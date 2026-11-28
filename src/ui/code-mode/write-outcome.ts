/**
 * How a confirmed or declined ERPNext change ended, for the model.
 *
 * On a host without MCP forms, `execute` confirms writes in this view: the
 * agent's own call only returns "waiting for your confirmation in the app",
 * and the decision travels through the app-only `erpnext_confirm_write` tool.
 * This snapshot reports the outcome through `ui/update-model-context`, so the
 * agent neither repeats a cancelled change nor misses a completed one.
 */

type TextBlock = { type: "text"; text: string };

/** The parts of a tool result this module reads. */
export interface ConfirmedResult {
  content?: ReadonlyArray<{ type: string; text?: unknown }>;
  isError?: boolean;
}

/**
 * `finished`: the user approved and the program finished; its own result says
 * what changed (it may have caught a failed write). `cancelled`: the user
 * declined. `failed`: the program did not finish after the decision.
 */
export type WriteOutcomeStatus = "finished" | "cancelled" | "failed";

export interface WriteOutcomeContext {
  content: TextBlock[];
  structuredContent: {
    erpnextWriteOutcome: {
      status: WriteOutcomeStatus;
      code?: string;
      message: string;
    };
  };
}

/** Panel ID under which the outcome joins the view's merged context. */
export const WRITE_OUTCOME_CONTEXT_ID = "erpnext-write-outcome";

const MAX_MESSAGE = 1_000;
const CODE = /^\[[^\]]+\] ([A-Z][A-Z0-9_]*):/;

/** Build the model-context snapshot for the final result of a confirmation. */
export function writeOutcomeContext(
  result: ConfirmedResult,
): WriteOutcomeContext {
  const text = (result.content ?? [])
    .flatMap((block) =>
      block.type === "text" && typeof block.text === "string"
        ? [block.text]
        : []
    )
    .join("\n")
    .trim();
  const message = text.length > MAX_MESSAGE
    ? `${text.slice(0, MAX_MESSAGE - 1)}…`
    : text;
  const code = result.isError ? CODE.exec(message)?.[1] : undefined;
  const status: WriteOutcomeStatus = !result.isError
    ? "finished"
    : code === "CHANGE_CANCELLED"
    ? "cancelled"
    : "failed";
  // Never claim more than the result shows: a finished program may have
  // caught a failed write, and a failed one may follow a committed write.
  const summary = status === "finished"
    ? "The user approved the ERPNext change in the app, and the program finished. Its result:"
    : status === "cancelled"
    ? "The user cancelled the ERPNext change in the app."
    : code === "WRITE_APPLIED_THEN_FAILED"
    ? "An approved ERPNext change may have been applied, but the program did not finish."
    : "The program did not finish after the user's decision in the app.";
  return {
    content: [{
      type: "text",
      text: message ? `${summary}\n${message}` : summary,
    }],
    structuredContent: {
      erpnextWriteOutcome: { status, ...(code && { code }), message },
    },
  };
}
