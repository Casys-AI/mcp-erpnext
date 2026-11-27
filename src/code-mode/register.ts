import {
  type McpApp,
  type MCPTool,
  SchemaValidator,
  type ToolHandler,
  type ToolHandlerContext,
} from "@mcpview/server";
import {
  createFileSnippetStore,
  createSnippetCatalog,
  type SnippetStore,
} from "@mcpview/server/snippets";
import { staticSnippetPrincipal } from "../auth/config.ts";
import { env } from "../runtime.ts";
import type { ErpNextToolsClient } from "../client.ts";
import { allowedMethod } from "../tools/method-allowlist.ts";
import { assertNonEmptySelection } from "../tools/selection.ts";
import {
  isAppsHost,
  type Operation,
  WriteConfirmations,
} from "./confirmation.ts";
import { STAGE_BOARD_LAYOUT_TOOL } from "./board-layout.ts";
import { createCodeModeExecute } from "./execute.ts";

type CodeModeView = Pick<
  Parameters<typeof createCodeModeExecute>[0],
  "resourceUri" | "mountableResourceUris" | "sessionResources"
>;
type Write = Parameters<Parameters<WriteConfirmations["run"]>[3]>[0];

function snippetDirectory(): string | undefined {
  function optionalEnv(key: string): string | undefined {
    try {
      return env(key);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NotCapable" || error.name === "PermissionDenied")
      ) return undefined;
      throw error;
    }
  }
  const override = optionalEnv("MCP_SNIPPETS_DIR");
  if (override) return override;
  const state = optionalEnv("XDG_STATE_HOME") || optionalEnv("LOCALAPPDATA");
  if (state) return `${state}/mcp-erpnext/snippets`;
  const home = optionalEnv("HOME");
  if (home) return `${home}/.local/state/mcp-erpnext/snippets`;
}

function snippetStore(): SnippetStore {
  const directory = snippetDirectory();
  if (!directory) {
    return {
      putIfAbsent: () =>
        Promise.reject(
          new Error(
            "No location for saved programs. Set MCP_SNIPPETS_DIR to a writable directory.",
          ),
        ),
      get: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
    };
  }
  const store = createFileSnippetStore(directory);
  return {
    ...store,
    async putIfAbsent(scope, snippet) {
      try {
        return await store.putIfAbsent(scope, snippet);
      } catch (cause) {
        throw new Error(
          "Unable to save this program. Configure MCP_SNIPPETS_DIR with a writable directory that supports hard links.",
          { cause },
        );
      }
    },
  };
}

async function snippetWorkspace(url: string, apiKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    "erpnext-snippet-workspace-v1",
    url,
    apiKey,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

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
  const snippets = createSnippetCatalog({ store: snippetStore() });
  const url = env("ERPNEXT_URL");
  const apiKey = env("ERPNEXT_API_KEY");
  const workspace = url && apiKey ? snippetWorkspace(url, apiKey) : undefined;
  const execute = createCodeModeExecute({
    snippets: async (ctx) => {
      if (!workspace) return undefined;
      if (!ctx?.request) {
        return {
          scope: JSON.stringify(["stdio", await workspace]),
          catalog: snippets,
        };
      }
      const auth = ctx.authInfo;
      if (
        !auth?.subject || auth.subject === "unknown" ||
        auth.subject === "\u0000unauthenticated"
      ) return undefined;
      const staticPrincipal = await staticSnippetPrincipal(auth);
      return {
        scope: JSON.stringify([
          staticPrincipal ? "http-static" : "http",
          await workspace,
          staticPrincipal ?? auth.subject,
          auth.tenantId,
          auth.clientId,
          auth.claims?.iss,
        ]),
        catalog: snippets,
      };
    },
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
        name: STAGE_BOARD_LAYOUT_TOOL,
        description:
          "Acknowledge the current viewer arrangement for this open dashboard.",
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
        },
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["runId", "revision", "layout"],
          properties: {
            runId: { type: "string", minLength: 1 },
            revision: { type: "integer", minimum: 1 },
            layout: { type: "object" },
          },
        },
      },
      (args, ctx) => {
        if (!isAppsHost(ctx)) {
          throw new Error("Dashboard layout changes require an MCP Apps host.");
        }
        return execute.stageBoardLayout(args, ctx);
      },
    );
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
