import {
  type ViewAppManifestResource,
  withDeclaredViewUri,
} from "@mcpview/contracts";
import {
  createDeclaredViewExecution,
  type DeclaredViewNativeResult,
  type MCPTool,
  type ToolHandler,
  type ToolHandlerContext,
} from "@mcpview/server";
import { runCodeProgram } from "./sandbox.ts";

interface CodeModeExecuteOptions {
  readonly tools: readonly MCPTool[];
  readonly mountableResourceUris: Iterable<string>;
  readonly sessionResources?: Iterable<ViewAppManifestResource>;
  readonly resourceUri?: string;
  readonly call: (
    name: string,
    args: Record<string, unknown>,
    context?: ToolHandlerContext,
  ) => Promise<unknown>;
  /** The host intercepts each call for confirmation and replay before dispatch. */
  readonly run?: (
    context: ToolHandlerContext | undefined,
    run: (call: CodeModeExecuteOptions["call"]) => Promise<unknown>,
    args: { code: string; input?: Record<string, unknown> },
  ) => Promise<unknown>;
}

function isReadOnly(tool: MCPTool): boolean {
  return tool.annotations?.readOnlyHint === true &&
    tool.annotations.destructiveHint !== true;
}

function isNativeResult(
  value: unknown,
): value is DeclaredViewNativeResult & {
  content: Array<{ type?: unknown; text?: unknown } | null>;
} {
  return typeof value === "object" && value !== null &&
    "content" in value && Array.isArray(value.content);
}

/** Wrap this server's selected operations in its single model-visible tool. */
export function createCodeModeExecute(options: CodeModeExecuteOptions): {
  tool: MCPTool;
  handler: ToolHandler;
} {
  const operations = options.tools.filter((t) =>
    (options.run || isReadOnly(t)) &&
    (t._meta?.ui?.visibility?.includes("model") ?? true)
  );
  const mutations = new Set(
    operations.filter((t) => !isReadOnly(t)).map((t) => t.name),
  );
  const mountableResourceUris = [...options.mountableResourceUris];
  const sessionResources = [...options.sessionResources ?? []];
  const tool: MCPTool = {
    name: "execute",
    description: [
      "Run a JavaScript function body in the ERPNext workspace.",
      "erp.catalog is an array of available business operations with name, description, inputSchema and annotations.",
      "Use await erp.call(name, args) for business operations. The host asks for confirmation before each write.",
      "For attachment bytes or large arguments, pass the complete operation argument object as execute.input and use await erp.callWithInput(name). The input stays on the server.",
      "Return an original response to display its declared view, or return any computed JSON value.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", minLength: 1, maxLength: 16_384 },
        input: {
          type: "object",
          additionalProperties: true,
          description:
            "Complete ERPNext arguments for erp.callWithInput(name), including attachment data.",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: mutations.size === 0,
      destructiveHint: mutations.size > 0,
      idempotentHint: mutations.size === 0,
    },
    ...(options.resourceUri && {
      _meta: {
        ui: { resourceUri: options.resourceUri, visibility: ["model", "app"] },
        ...{ "openai/outputTemplate": options.resourceUri },
      },
    }),
  };
  const handler: ToolHandler = async ({ code, input }, ctx) => {
    if (typeof code !== "string") {
      throw new Error("Expected a JavaScript function body.");
    }
    if (
      input !== undefined &&
      (typeof input !== "object" || input === null || Array.isArray(input))
    ) {
      throw new Error("execute.input must be an argument object.");
    }
    const externalInput = input as Record<string, unknown> | undefined;
    // Follow mcpview's scope contract: stdio is trusted. Each HTTP operation
    // must be available both to the program's catalog and its dispatcher.
    const allowed = operations.filter(({ requiredScopes }) =>
      !ctx?.request || !requiredScopes?.length ||
      requiredScopes.every((scope) => ctx.authInfo?.scopes.includes(scope))
    );
    const names = new Set(allowed.map(({ name }) => name));
    const catalog = allowed.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { ...t.annotations, readOnlyHint: isReadOnly(t) },
    }));
    async function run(call: CodeModeExecuteOptions["call"]): Promise<unknown> {
      const execution = createDeclaredViewExecution({
        tools: allowed,
        mountableResourceUris,
        sessionResources,
      });

      const output = await runCodeProgram(
        code,
        catalog,
        async (name, args) => {
          if (!names.has(name)) {
            throw new Error(`Unknown ERPNext operation: ${name}`);
          }
          const result = await call(name, args, ctx);
          if (isNativeResult(result)) {
            if (result.isError) {
              const message = result.content.find((block) =>
                block?.type === "text"
              );
              throw new Error(
                typeof message?.text === "string"
                  ? message.text
                  : "ERPNext operation failed.",
              );
            }
            return execution.capture(name, result);
          }
          if (
            typeof result === "object" && result !== null &&
            "resultType" in result
          ) {
            throw new Error(
              "The ERPNext operation requires additional input. Use an exact record ID.",
            );
          }
          // buildHandlersMap also returns plain arrays and scalar values. Expose
          // them in the VM in the same shape the native ERP handler produced.
          return execution.capture(name, {
            content: [{ type: "text", text: JSON.stringify(result) }],
          }, result);
        },
        mutations,
        externalInput,
      );
      if ("native" in output) {
        const selected = execution.resolve(output.native.reference);
        if (!selected) {
          throw new Error("Unknown result from this ERPNext execution.");
        }
        return selected.resourceUri
          ? withDeclaredViewUri(
            selected.result,
            selected.resourceUri,
            selected.session,
          )
          : selected.result;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(output.value) }],
        structuredContent: { value: output.value },
      };
    }
    return options.run
      ? await options.run(ctx, run, {
        code,
        ...(externalInput && { input: externalInput }),
      })
      : await run(options.call);
  };
  return { tool, handler };
}
