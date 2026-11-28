import {
  getMcpAppsCapability,
  MCP_APP_MIME_TYPE,
  type ToolHandlerContext,
} from "@mcpview/server";
import {
  configuredUploadLimit,
  decodeBase64File,
} from "../api/frappe-client.ts";
import { SuspendCodeMode } from "./sandbox.ts";
import { CodeModeError, codeModeMessage, describeCause } from "./errors.ts";

type Args = Record<string, unknown>;
export type Operation = { name: string; args: Args };
type Invoke = (
  operation: Operation,
  invoke: () => Promise<unknown>,
) => Promise<unknown>;
/** One approved write already replayed or applied; `operation` names it for the agent. */
type Entry = {
  operation: string;
  signature: string;
  result: string;
  error: boolean;
};
type Rail = "app" | "form";
interface Ticket {
  owner: string;
  rail: Rail;
  source: Operation;
  /** The write awaiting this decision. */
  operation: string;
  signature: string;
  journal: Entry[];
  expires: number;
  bytes: number;
}

const CONFIRM_META = "io.casys/erpnext-write-confirmation";
const MAX_PENDING = 128;
const MAX_BYTES = 16 * 1024 * 1024;
const TTL = 5 * 60_000;

class NeedApproval extends SuspendCodeMode {
  constructor(readonly result: object) {
    super("ERPNext awaits confirmation.");
  }
}

/** Canonicalise JSON keys without interpreting ERP field names. */
function canonical({ name, args }: Operation): string {
  return JSON.stringify([name, args], (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      );
    }
    return value;
  });
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const raw = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(raw), (n) => n.toString(16).padStart(2, "0"))
    .join("");
}

async function approvalArguments(
  operation: Operation,
  maxUpload: number,
): Promise<Args> {
  if (
    operation.name !== "erpnext_file_upload" ||
    typeof operation.args.content_base64 !== "string"
  ) {
    return operation.args;
  }
  const bytes = decodeBase64File(operation.args.content_base64, maxUpload);
  return {
    ...operation.args,
    content_base64: { bytes: bytes.length, sha256: await digest(bytes) },
  };
}

export function isAppsHost(ctx?: ToolHandlerContext): boolean {
  return getMcpAppsCapability(ctx?.clientCapabilities)?.mimeTypes
    ?.includes(MCP_APP_MIME_TYPE) === true;
}

function owner(ctx?: ToolHandlerContext): string {
  if (!ctx) throw new Error("ERPNext writes require a confirmed MCP request.");
  if (!ctx.request) return "stdio";
  const auth = ctx.authInfo;
  if (
    !auth?.subject || auth.subject === "unknown" ||
    auth.subject === "\u0000unauthenticated"
  ) {
    throw new Error(
      "ERPNext writes over HTTP require an authenticated principal.",
    );
  }
  return JSON.stringify([
    "http",
    auth.subject,
    auth.tenantId,
    auth.clientId,
    auth.claims?.iss,
  ]);
}

function formCapable(ctx?: ToolHandlerContext): boolean {
  const cap = ctx?.clientCapabilities?.elicitation;
  return !!cap && typeof cap === "object" &&
    ("form" in cap || !Object.keys(cap).length);
}

/**
 * Approved writes of this program that ERPNext already received. A failed one
 * may still have committed part of its work (a task created before its
 * assignment failed), so it is reported apart, never as "nothing changed".
 */
function outcomes(journal: readonly Entry[]) {
  return {
    sent: journal.filter((step) => !step.error).map((step) => step.operation),
    failed: journal.filter((step) => step.error).map((step) => step.operation),
  };
}

/**
 * The agent reads this when the user declines a write. Earlier approvals in
 * the same program already reached ERPNext; say which, so it neither repeats
 * them nor reports that nothing changed.
 */
function cancelled(ticket: Ticket): CodeModeError {
  const { sent, failed } = outcomes(ticket.journal);
  const touched = sent.length > 0 || failed.length > 0;
  return new CodeModeError(
    "CHANGE_CANCELLED",
    [
      `The user cancelled ${ticket.operation}`,
      sent.length &&
      `Already sent to ERPNext in this program: ${sent.join(", ")}`,
      failed.length &&
      `Sent but failed, possibly in part: ${failed.join(", ")}`,
      !touched && "No ERPNext change was made",
    ].filter(Boolean).join(". "),
    {
      recovery: touched
        ? "Check these records in ERPNext and tell the user what changed; do not repeat them, and ask before proposing another change"
        : "Ask the user before proposing this change again",
      context: { declined: ticket.operation, sent, failed },
    },
  );
}

/** Tickets stay private to the connected host and expire with this server process. */
export class WriteConfirmations {
  private pending = new Map<string, Ticket>();
  private appGrants = new WeakMap<ToolHandlerContext, Ticket>();

  constructor(private readonly clock: () => number = Date.now) {}

  private clean(): void {
    const now = this.clock();
    for (const [id, ticket] of this.pending) {
      if (ticket.expires <= now) this.pending.delete(id);
    }
  }

  private claim(id: string, rail: Rail, ctx?: ToolHandlerContext): Ticket {
    this.clean();
    const ticket = this.pending.get(id);
    if (!ticket || ticket.rail !== rail || ticket.owner !== owner(ctx)) {
      throw new Error(
        "ERPNext confirmation is unavailable, expired or already used.",
      );
    }
    this.pending.delete(id); // Claim synchronously, before ERP I/O or JS replay.
    return ticket;
  }

  async confirmInApp(
    args: Args,
    ctx: ToolHandlerContext | undefined,
    resume: (source: Operation, ctx: ToolHandlerContext) => Promise<unknown>,
  ): Promise<unknown> {
    if (
      !ctx || !isAppsHost(ctx) || typeof args.ticket !== "string" ||
      (args.decision !== "approve" && args.decision !== "cancel")
    ) {
      throw new Error("ERPNext confirmation requires a decision in the app.");
    }
    const ticket = this.claim(args.ticket, "app", ctx);
    if (args.decision === "cancel") throw cancelled(ticket);
    const fresh = {
      ...ctx,
      toolName: ticket.source.name,
      inputResponses: undefined,
      retryVerified: undefined,
    };
    this.appGrants.set(fresh, ticket);
    try {
      return await resume(ticket.source, fresh);
    } finally {
      this.appGrants.delete(fresh);
    }
  }

  async run(
    ctx: ToolHandlerContext | undefined,
    source: Operation,
    canDisplayApp: boolean,
    run: (write: Invoke) => Promise<unknown>,
  ): Promise<unknown> {
    let grant = ctx && this.appGrants.get(ctx);
    if (ctx?.inputResponses !== undefined || ctx?.retryVerified !== undefined) {
      const entries = Object.entries(ctx.inputResponses ?? {});
      if (!ctx.retryVerified || entries.length !== 1) {
        throw new Error("A signed ERPNext confirmation is required.");
      }
      const [id, answer] = entries[0];
      grant = this.claim(id, "form", ctx);
      if (
        !answer || typeof answer !== "object" || !("action" in answer) ||
        answer.action !== "accept" || !("content" in answer) ||
        !answer.content || typeof answer.content !== "object" ||
        !("confirm" in answer.content) || answer.content.confirm !== true
      ) {
        throw cancelled(grant);
      }
    }
    if (grant && canonical(grant.source) !== canonical(source)) {
      throw new Error("ERPNext confirmation belongs to another request.");
    }
    const journal = grant?.journal ?? [];
    let index = 0;
    let used = false;
    const write: Invoke = async (operation, invoke) => {
      const key = await digest(new TextEncoder().encode(canonical(operation)));
      const previous = journal[index++];
      if (previous) {
        if (previous.signature !== key) {
          throw new SuspendCodeMode(
            "ERPNext operations changed. Restart to confirm the new plan.",
          );
        }
        if (previous.error) throw new Error(previous.result);
        return JSON.parse(previous.result);
      }
      if (grant && !used) {
        if (grant.signature !== key) {
          throw new SuspendCodeMode(
            "ERPNext arguments changed. Restart to confirm this operation.",
          );
        }
        used = true;
        let result: unknown;
        try {
          result = await invoke();
        } catch (error) {
          journal.push({
            operation: operation.name,
            signature: key,
            error: true,
            result: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        const stored = JSON.stringify(result);
        if (stored === undefined || stored.length > MAX_BYTES) {
          throw new SuspendCodeMode(codeModeMessage(
            "WRITE_APPLIED_THEN_FAILED",
            `ERPNext completed ${operation.name}, but its receipt is too large to keep for the next writes of this program`,
            "Check the record in ERPNext before retrying, and do not repeat this write",
          ));
        }
        journal.push({
          operation: operation.name,
          signature: key,
          error: false,
          result: stored,
        });
        return result;
      }
      const identity = owner(ctx);
      const app = canDisplayApp && isAppsHost(ctx);
      const rail = app && source.name !== "execute"
        ? "app" // The viewer's callServerTool expects an ordinary App result.
        : formCapable(ctx)
        ? "form"
        : app
        ? "app"
        : undefined;
      if (!rail) {
        throw new SuspendCodeMode(
          "Confirm the ERPNext change using an MCP form or an MCP Apps host.",
        );
      }
      const maxUpload = configuredUploadLimit();
      const displayArgs = await approvalArguments(operation, maxUpload);
      // One full-size configured attachment fits in a single pending entry.
      const maxPendingBytes = Math.max(
        MAX_BYTES,
        4 * Math.ceil(maxUpload / 3) + 1024 * 1024,
      );
      this.clean();
      const bytes = key.length + canonical(source).length +
        journal.reduce(
          (n, step) => n + step.signature.length + step.result.length,
          0,
        );
      if (
        this.pending.size >= MAX_PENDING ||
        [...this.pending.values()].reduce(
            (n, ticket) => n + ticket.bytes,
            bytes,
          ) > maxPendingBytes
      ) {
        throw new SuspendCodeMode(
          "ERPNext confirmation capacity reached. Retry after pending decisions expire.",
        );
      }
      const id = crypto.randomUUID();
      this.pending.set(id, {
        owner: identity,
        rail,
        source: structuredClone(source),
        operation: operation.name,
        signature: key,
        journal,
        expires: this.clock() + TTL,
        bytes,
      });
      const info = {
        ticket: id,
        operation: operation.name,
        arguments: displayArgs,
      };
      if (rail === "app") {
        throw new NeedApproval({
          content: [{
            type: "text",
            text:
              "An ERPNext change is waiting for your confirmation in the app.",
          }],
          _meta: { [CONFIRM_META]: info },
        });
      }
      throw new NeedApproval({
        resultType: "input_required",
        inputRequests: {
          [id]: {
            method: "elicitation/create",
            params: {
              mode: "form",
              message: `Confirm this ERPNext operation: ${operation.name}\n${
                JSON.stringify(displayArgs)
              }`,
              requestedSchema: {
                type: "object",
                required: ["confirm"],
                properties: {
                  confirm: {
                    type: "boolean",
                    title: "Approve this exact change",
                  },
                },
              },
            },
          },
        },
      });
    };
    try {
      const result = await run(write);
      if (grant && !used) {
        throw new Error(
          "The program no longer requests the approved ERPNext change.",
        );
      }
      return result;
    } catch (error) {
      if (error instanceof NeedApproval) return error.result;
      if (error instanceof SuspendCodeMode) throw error;
      // A replay re-runs the program's reads against records that earlier
      // approvals already changed, so it can fail before it reaches those
      // writes again. Never let that read as "safe to rerun".
      const { sent, failed } = outcomes(journal);
      if (!sent.length && !failed.length) throw error;
      throw new SuspendCodeMode(codeModeMessage(
        "WRITE_APPLIED_THEN_FAILED",
        `${
          [
            sent.length && `ERPNext already received ${sent.join(", ")}`,
            failed.length &&
            `${
              failed.join(", ")
            } failed after being sent and may have applied in part`,
          ].filter(Boolean).join("; ")
        } in this program, but the program could not finish (${
          describeCause(error)
        })`,
        "Check these records in ERPNext before retrying, and do not repeat these writes",
      ));
    }
  }
}
