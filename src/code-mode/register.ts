import {
  type McpApp,
  type MCPTool,
  SchemaValidator,
  type ToolHandler,
  type ToolHandlerContext,
} from "@mcpview/server";
import type { ErpNextToolsClient } from "../client.ts";
import { allowedMethod } from "../tools/method-allowlist.ts";
import { assertNonEmptySelection } from "../tools/selection.ts";
import {
  isAppsHost,
  type Operation,
  WriteConfirmations,
} from "./confirmation.ts";
import { createCodeModeExecute } from "./execute.ts";

type CodeModeView = Pick<
  Parameters<typeof createCodeModeExecute>[0],
  "resourceUri" | "mountableResourceUris" | "sessionResources"
>;
type Write = Parameters<Parameters<WriteConfirmations["run"]>[3]>[0];

/** Bind the selected business operations to programs and native viewer callbacks. */
export function registerCodeModeTools(
  server: Pick<McpApp, "registerTool" | "registerAppOnlyTool">,
  client: ErpNextToolsClient,
  view?: CodeModeView,
): number {
  const tools = client.toMCPFormat();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const visible = client.listTools().filter((tool) =>
    !tool._meta?.ui?.visibility || tool._meta.ui.visibility.includes("model")
  );
  assertNonEmptySelection({ ...client.selection, tools: visible });
  const handlers = client.buildHandlersMap();
  const schemas = new SchemaValidator();
  const confirmations = new WriteConfirmations();
  const hasApp = Boolean(view?.resourceUri);
  const callbacks = new Map<string, ToolHandler>();

  async function dispatch(
    tool: MCPTool,
    args: Record<string, unknown>,
    ctx: ToolHandlerContext | undefined,
    write?: Write,
  ): Promise<unknown> {
    if (
      ctx?.request &&
      tool.requiredScopes?.some((scope) =>
        !ctx.authInfo?.scopes.includes(scope)
      )
    ) {
      throw new Error("Insufficient ERPNext operation scope.");
    }
    schemas.validateOrThrow(tool.name, args);
    if (tool.name === "erpnext_method_call") allowedMethod(args.method);
    const invoke = async () => await handlers.get(tool.name)!(args, ctx);
    if (
      tool.annotations?.readOnlyHint === true &&
      tool.annotations.destructiveHint !== true
    ) {
      return await invoke();
    }
    if (!write) throw new Error("An ERPNext write requires host confirmation.");
    return await write({ name: tool.name, args }, invoke);
  }

  for (const tool of tools) {
    schemas.addSchema(tool.name, tool.inputSchema);
    const callback: ToolHandler = (args, ctx) => {
      if (!isAppsHost(ctx)) {
        throw new Error("This ERPNext callback requires an MCP Apps host.");
      }
      if (
        tool.annotations?.readOnlyHint === true &&
        tool.annotations.destructiveHint !== true
      ) {
        return dispatch(tool, args, ctx);
      }
      return confirmations.run(
        ctx,
        { name: tool.name, args },
        hasApp,
        (write) =>
          dispatch(
            tool,
            args,
            ctx &&
              {
                ...ctx,
                clientCapabilities: undefined,
                inputResponses: undefined,
                retryVerified: undefined,
              },
            write,
          ),
      );
    };
    callbacks.set(tool.name, callback);
    // Native viewer calls return to the requesting app. Opening their legacy
    // standalone URI would bypass the shell that displays pending decisions.
    const { _meta: _viewerDeclaration, ...callbackTool } = tool;
    server.registerAppOnlyTool(callbackTool, callback);
  }

  const programTools = new Map(
    visible.map((t) => [t.name, byName.get(t.name)!]),
  );
  const programCall = (write?: Write) =>
  async (
    name: string,
    args: Record<string, unknown>,
    ctx?: ToolHandlerContext,
  ) => {
    const tool = programTools.get(name);
    if (!tool) throw new Error(`Unknown ERPNext operation: ${name}`);
    // An inner call cannot consume a form or retry belonging to the outer tool.
    return await dispatch(
      tool,
      args,
      ctx &&
        {
          ...ctx,
          toolName: name,
          clientCapabilities: undefined,
          inputResponses: undefined,
          retryVerified: undefined,
        },
      write,
    );
  };
  const execute = createCodeModeExecute({
    tools: [...programTools.values()],
    mountableResourceUris: [],
    ...view,
    call: programCall(),
    run: (ctx, run, args) =>
      confirmations.run(
        ctx,
        { name: "execute", args },
        hasApp,
        (write) => run(programCall(write)),
      ),
  });
  server.registerTool(execute.tool, execute.handler);
  if (hasApp) {
    server.registerAppOnlyTool(
      {
        name: "erpnext_confirm_write",
        description:
          "Submit the user's decision on a pending ERPNext change from the app.",
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
        },
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["ticket", "decision"],
          properties: {
            ticket: { type: "string", minLength: 1 },
            decision: { enum: ["approve", "cancel"] },
          },
        },
      },
      (args, ctx) =>
        confirmations.confirmInApp(
          args,
          ctx,
          async (source: Operation, fresh) => {
            const handler = source.name === "execute"
              ? execute.handler
              : callbacks.get(source.name);
            if (!handler) {
              throw new Error("The ERPNext operation is no longer available.");
            }
            return await handler(source.args, fresh);
          },
        ),
    );
  }
  return programTools.size;
}
