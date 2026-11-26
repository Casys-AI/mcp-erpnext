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
import {
  type SnippetCatalog,
  SnippetCatalogError,
  type SnippetParameterType,
} from "@mcpview/server/snippets";
import {
  INVOICE_FOLLOW_PORTS,
  invoiceDocumentRef,
  invoiceSelectionRef,
  SALES_INVOICE_DOCTYPE,
  SALES_INVOICE_GET,
} from "./document-follow.ts";
import { runCodeProgram, SuspendCodeMode } from "./sandbox.ts";

type Arguments = Record<string, unknown>;
// Compose's public MCP App-only result envelope. The backend does not render panels.
const SNIPPET_PANELS_META_KEY = "io.mcpview/snippet-panels";
const SNIPPET_SYNC_META_KEY = "io.mcpview/snippet-sync";
const MAX_PANEL_BYTES = 6 * 1024 * 1024;
const EXECUTION_REFERENCE_META = "io.casys/erpnext-execution-ref";
const SNIPPET_EVENT_META = "io.casys/erpnext-snippet-event";

interface SnippetAccess {
  readonly scope: string;
  readonly catalog: SnippetCatalog;
}

function objectArgument(value: unknown, field: string): Arguments | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`execute.${field} must be an object.`);
  }
  return value as Arguments;
}

function snippetParams(
  input: unknown,
  contract?: Readonly<Record<string, SnippetParameterType>>,
): Arguments {
  const params = objectArgument(input, "params") ?? {};
  if (!contract) return params;
  for (const [name, expected] of Object.entries(contract)) {
    const value = params[name];
    const actual = value === null
      ? "null"
      : Array.isArray(value)
      ? "array"
      : typeof value;
    if (!Object.hasOwn(params, name) || actual !== expected) {
      throw new Error(
        `Snippet parameter ${JSON.stringify(name)} requires type ${expected}.`,
      );
    }
  }
  if (Object.keys(params).some((name) => !Object.hasOwn(contract, name))) {
    throw new Error(
      "Unexpected snippet parameter. List saved programs for accepted parameters.",
    );
  }
  return params;
}

function dataResult(
  value: unknown,
  snippetEvent?: "saved" | "list" | "source",
) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: { value },
    ...(snippetEvent && { _meta: { [SNIPPET_EVENT_META]: snippetEvent } }),
  };
}

interface CodeModeExecuteOptions {
  readonly tools: readonly MCPTool[];
  readonly mountableResourceUris: Iterable<string>;
  readonly sessionResources?: Iterable<ViewAppManifestResource>;
  readonly resourceUri?: string;
  readonly snippets?: (
    ctx?: ToolHandlerContext,
  ) => SnippetAccess | undefined | Promise<SnippetAccess | undefined>;
  readonly call: (
    name: string,
    args: Record<string, unknown>,
    context?: ToolHandlerContext,
  ) => Promise<unknown>;
  /** The host intercepts each call for confirmation and replay before dispatch. */
  readonly run?: (
    context: ToolHandlerContext | undefined,
    run: (call: CodeModeExecuteOptions["call"]) => Promise<unknown>,
    args: Arguments,
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

function isRecord(value: unknown): value is Arguments {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const invoiceListTools = ["erpnext_sales_invoice_list", "erpnext_doc_list"];
const { source: invoiceListPort, target: invoiceDetailPort } =
  INVOICE_FOLLOW_PORTS;

function invoicePorts(
  name: string,
  resourceUri: string | undefined,
  content: unknown,
): { emits?: string[]; accepts?: string[] } | undefined {
  if (!isRecord(content)) return;
  if (
    resourceUri === invoiceListPort.resourceUri &&
    invoiceListTools.includes(name) &&
    content.doctype === SALES_INVOICE_DOCTYPE &&
    Array.isArray(content.data) &&
    content.data.every((row) =>
      isRecord(row) && invoiceSelectionRef(content.doctype, row) !== null
    )
  ) return { emits: [invoiceListPort.event] };
  if (
    resourceUri === invoiceDetailPort.resourceUri &&
    name === SALES_INVOICE_GET &&
    isRecord(content.data) &&
    invoiceDocumentRef(content.data.doctype, content.data.name)
  ) return { accepts: [invoiceDetailPort.action] };
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
  const declaresView = (name: string, uri: string) =>
    mountableResourceUris.includes(uri) &&
    operations.some((operation) =>
      operation.name === name && operation._meta?.ui?.resourceUri === uri
    );
  const linkedLists = invoiceListTools.filter((name) =>
    declaresView(name, invoiceListPort.resourceUri)
  ).map((name) =>
    name === "erpnext_doc_list"
      ? `${name} with doctype "${SALES_INVOICE_DOCTYPE}" and the name field`
      : name
  );
  const tool: MCPTool = {
    name: "execute",
    description: [
      "Run a JavaScript function body in the ERPNext workspace.",
      "erp.catalog is an array of available business operations with name, description, inputSchema and annotations.",
      "Use await erp.call(name, args) for business operations. The host asks for confirmation before each write.",
      "For attachment bytes or large arguments, pass the complete operation argument object as execute.input and use await erp.callWithInput(name). The input stays on the server.",
      "Return an original response to display its declared view, or return any computed JSON value.",
      "To display several business views together, call erp.panel(originalResponse, optionalTitle) for each in the desired order, then return a short JSON summary. Only original responses with declared business views may be selected.",
      ...(linkedLists.length &&
          declaresView(SALES_INVOICE_GET, invoiceDetailPort.resourceUri)
        ? [
          `To make an invoice detail follow selections in a list of Sales Invoices, use ${
            linkedLists.join(" or ")
          } to obtain the list and ${SALES_INVOICE_GET} for the initial detail. Select both original results with erp.panel(rows) and erp.panel(invoice), then call erp.sync({from: rows, event: "${invoiceListPort.event}", to: invoice, action: "${invoiceDetailPort.action}"}). Use a real invoice name for the initial detail. Declare this route only when the user requests linked views.`,
        ]
        : []),
      "Use execute.params for JSON parameters readable as erp.params.",
      ...(options.snippets
        ? [
          "When asked to save a successful program, pass save: {runId, name, description?} using that run's execution reference.",
          "Use snippets: true to list saved programs, or snippet: name with params to run a saved program.",
          "When asked to view a saved program's source, pass inspectSnippet: name.",
          "If the user asks to reuse an earlier procedure without its exact name, list saved programs first, even in a new conversation.",
        ]
        : []),
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
        params: {
          type: "object",
          additionalProperties: true,
          description: "JSON parameters available to JavaScript as erp.params.",
        },
        ...(options.snippets && {
          save: {
            type: "object",
            additionalProperties: false,
            required: ["runId", "name"],
            properties: {
              runId: { type: "string", minLength: 1 },
              name: { type: "string", minLength: 1 },
              description: {
                type: "string",
                maxLength: 512,
                description:
                  "Short purpose that helps find this program later.",
              },
            },
          },
          snippet: { type: "string", minLength: 1 },
          snippets: { const: true },
          inspectSnippet: { type: "string", minLength: 1 },
        }),
      },
      ...(options.snippets
        ? {
          oneOf: [
            { required: ["code"] },
            { required: ["save"] },
            { required: ["snippet"] },
            { required: ["snippets"] },
            { required: ["inspectSnippet"] },
          ],
        }
        : { required: ["code"] }),
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: mutations.size === 0 && !options.snippets,
      destructiveHint: mutations.size > 0,
      idempotentHint: mutations.size === 0 && !options.snippets,
    },
    ...(options.resourceUri && {
      _meta: {
        ui: { resourceUri: options.resourceUri, visibility: ["model", "app"] },
        ...{ "openai/outputTemplate": options.resourceUri },
      },
    }),
  };
  const handler: ToolHandler = async (args, ctx) => {
    const { code, input, params, save, snippet, snippets, inspectSnippet } =
      args;
    const commands = [code, save, snippet, snippets, inspectSnippet].filter((
      value,
    ) => value !== undefined);
    if (commands.length !== 1) {
      throw new Error(
        "Supply one of code, save, snippet, snippets or inspectSnippet.",
      );
    }
    const access = await options.snippets?.(ctx);
    if (
      save !== undefined || snippets !== undefined ||
      inspectSnippet !== undefined
    ) {
      if (!access) {
        throw new Error(
          "Saved programs require an authenticated ERPNext workspace.",
        );
      }
      if (
        input !== undefined || params !== undefined ||
        ctx?.inputResponses !== undefined || ctx?.retryVerified !== undefined
      ) {
        throw new Error(
          "Snippet catalog requests do not accept execution inputs or confirmations.",
        );
      }
      if (snippets !== undefined) {
        if (snippets !== true) {
          throw new Error("execute.snippets must be true.");
        }
        return dataResult(await access.catalog.list(access.scope), "list");
      }
      if (inspectSnippet !== undefined) {
        if (typeof inspectSnippet !== "string") {
          throw new Error("execute.inspectSnippet must be a snippet name.");
        }
        return dataResult(
          await access.catalog.inspect(access.scope, inspectSnippet),
          "source",
        );
      }
      const selection = objectArgument(save, "save");
      if (
        typeof selection?.runId !== "string" ||
        typeof selection.name !== "string" ||
        (selection.description !== undefined &&
          typeof selection.description !== "string") ||
        Object.keys(selection).some((key) =>
          key !== "runId" && key !== "name" && key !== "description"
        )
      ) {
        throw new Error("Supply save.runId and save.name.");
      }
      return dataResult(
        await access.catalog.save(
          access.scope,
          selection.runId,
          selection.name,
          selection.description,
        ),
        "saved",
      );
    }

    const externalInput = objectArgument(input, "input");
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
    async function executeProgram(
      program: unknown,
      parameters: Arguments,
      call: CodeModeExecuteOptions["call"],
    ): Promise<DeclaredViewNativeResult> {
      const execution = createDeclaredViewExecution({
        tools: allowed,
        mountableResourceUris,
        sessionResources,
      });

      const output = await runCodeProgram(
        program,
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
        parameters,
      );
      function resolveResult(reference: string) {
        const selected = execution.resolve(reference);
        if (!selected) {
          throw new Error("Unknown result from this ERPNext execution.");
        }
        return {
          resourceUri: selected.resourceUri,
          result: selected.resourceUri
            ? withDeclaredViewUri(
              selected.result,
              selected.resourceUri,
              selected.session,
            )
            : selected.result,
        };
      }
      if ("panels" in output) {
        let nativeBytes = 0;
        const panels = output.panels.map(({ native, name, title }) => {
          const { result, resourceUri } = resolveResult(native.reference);
          if (!resourceUri) {
            throw new Error(
              "The selected ERP operation has no compatible declared view.",
            );
          }
          const serialized = JSON.stringify(result);
          if (
            serialized.length > MAX_PANEL_BYTES ||
            (nativeBytes += new TextEncoder().encode(serialized).byteLength) >
              MAX_PANEL_BYTES
          ) {
            throw new Error(
              "Selected ERP results exceed the board size limit.",
            );
          }
          const events = invoicePorts(
            name,
            resourceUri,
            result.structuredContent,
          );
          return {
            id: native.reference,
            provider: "erpnext",
            name,
            title,
            result,
            ...(events && { events }),
          };
        });
        const panelsById = new Map(panels.map((panel) => [panel.id, panel]));
        const routes = output.sync.map(({ from, event, to, action }) => {
          const source = panelsById.get(from.native.reference);
          const target = panelsById.get(to.native.reference);
          if (
            !source?.events?.emits?.includes(event) ||
            !target?.events?.accepts?.includes(action)
          ) {
            throw new Error(
              "Unsupported ERP synchronization. Link invoice.selected from a Sales Invoice list to invoice.focus on a Sales Invoice detail.",
            );
          }
          return { from: source.id, event, to: target.id, action };
        });
        const visible = {
          value: output.value,
          panels: panels.map(({ id, provider, name, title }) => ({
            id,
            provider,
            name,
            title,
          })),
        };
        return {
          structuredContent: visible,
          content: [{ type: "text", text: JSON.stringify(visible) }],
          _meta: {
            [SNIPPET_PANELS_META_KEY]: panels,
            ...(routes.length && { [SNIPPET_SYNC_META_KEY]: routes }),
          },
        };
      }
      if ("native" in output) {
        return resolveResult(output.native.reference).result;
      }
      return dataResult(output.value);
    }

    async function execute(
      program: string,
      parameters: Arguments | undefined,
      recordReference: boolean,
    ) {
      let completed: DeclaredViewNativeResult | undefined;
      const run = async (call: CodeModeExecuteOptions["call"]) => {
        let completedWrite: string | undefined;
        try {
          completed = await executeProgram(
            program,
            parameters ?? {},
            async (name, inputs, context) => {
              const result = await call(name, inputs, context);
              if (
                mutations.has(name) &&
                !(typeof result === "object" && result !== null &&
                  (("isError" in result && result.isError) ||
                    ("resultType" in result &&
                      result.resultType !== "complete")))
              ) {
                completedWrite = name;
              }
              return result;
            },
          );
          return completed;
        } catch (error) {
          // A request for the next approval must continue through the same journal.
          if (!completedWrite || error instanceof SuspendCodeMode) throw error;
          throw new SuspendCodeMode(
            `ERPNext completed ${completedWrite}, but the program or its selected views could not finish. Check the changed record before retrying.`,
          );
        }
      };
      const result = options.run
        ? await options.run(ctx, run, args)
        : await run(options.call);
      if (access && recordReference && completed && completed === result) {
        let runId: string;
        try {
          runId = access.catalog.recordSuccess(
            access.scope,
            program,
            parameters,
          );
        } catch (error) {
          // A non-recordable parameter contract must not turn completed ERP
          // work into an apparent failure that the caller might retry.
          if (
            error instanceof SnippetCatalogError &&
            error.code === "EXECUTION_NOT_ELIGIBLE"
          ) return result;
          throw error;
        }
        return {
          ...completed,
          content: [
            ...(Array.isArray(completed.content) ? completed.content : []),
            {
              type: "text",
              text: `Execution reference for saving this program: ${runId}`,
            },
          ],
          _meta: { ...completed._meta, [EXECUTION_REFERENCE_META]: runId },
        };
      }
      return result;
    }

    if (snippet !== undefined) {
      if (!access) {
        throw new Error(
          "Saved programs require an authenticated ERPNext workspace.",
        );
      }
      if (typeof snippet !== "string" || input !== undefined) {
        throw new Error("Supply a saved program name and optional params.");
      }
      return await access.catalog.run(access.scope, snippet, params, {
        validate: snippetParams,
        execute: (program, parameters) => execute(program, parameters, false),
      });
    }
    if (typeof code !== "string") {
      throw new Error("Expected a JavaScript function body.");
    }
    // The opaque input may contain attachments. References retain code only.
    return await execute(
      code,
      objectArgument(params, "params"),
      externalInput === undefined,
    );
  };
  return { tool, handler };
}
