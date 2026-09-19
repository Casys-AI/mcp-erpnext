import { t } from "../i18n.ts";
import type { ToolHost } from "../jumps.ts";
import { extractToolResultText } from "../refresh.ts";
import { canCallViewerTool } from "../viewer-tools.ts";

export type TaskTimesheetAvailability =
  | { status: "unavailable" | "loading" | "empty" }
  | { status: "present"; count: number }
  | { status: "error"; message: string; messageKey?: string };

export const TASK_TIMESHEET_PAGE_SIZE = 200;
export const TASK_TIMESHEET_MAX_PAGES = 50;
export const TASK_TIMESHEET_TOO_LARGE_KEY = "kanban.timesheets.error.too_many";

export function canCheckTaskTimesheets(
  taskId: string | null,
  serverTools: unknown,
  availableTools: readonly string[] | undefined,
): boolean {
  return Boolean(taskId?.trim()) &&
    canCallViewerTool(serverTools, availableTools, "erpnext_doc_list");
}

export function taskTimesheetAvailabilityArguments(
  taskId: string,
  offset = 0,
): Record<string, unknown> {
  return {
    doctype: "Timesheet",
    fields: ["name"],
    filters: [["Timesheet Detail", "task", "=", taskId]],
    limit: TASK_TIMESHEET_PAGE_SIZE,
    offset,
    order_by: "name asc",
    skip_cache: true,
  };
}

export function taskTimesheetRevalidationKey(
  rootFreshEvent: number,
  detailModified: unknown,
): string {
  return JSON.stringify([
    rootFreshEvent,
    typeof detailModified === "string" ? detailModified : null,
  ]);
}

function invalidPayload(): Extract<
  TaskTimesheetAvailability,
  { status: "error" }
> {
  return {
    status: "error",
    message: t("common.error.parse_failed"),
    messageKey: "common.error.parse_failed",
  };
}

function relationTooLarge(): Extract<
  TaskTimesheetAvailability,
  { status: "error" }
> {
  return {
    status: "error",
    message: t(TASK_TIMESHEET_TOO_LARGE_KEY),
    messageKey: TASK_TIMESHEET_TOO_LARGE_KEY,
  };
}

export async function loadTaskTimesheetAvailability(
  host: ToolHost,
  taskId: string,
  isCancelled: () => boolean = () => false,
): Promise<TaskTimesheetAvailability> {
  if (!taskId.trim() || isCancelled()) return { status: "unavailable" };
  const distinctNames = new Set<string>();

  for (let page = 0; page < TASK_TIMESHEET_MAX_PAGES; page++) {
    if (isCancelled()) return { status: "unavailable" };
    try {
      const result = await host.callServerTool({
        name: "erpnext_doc_list",
        arguments: taskTimesheetAvailabilityArguments(
          taskId,
          page * TASK_TIMESHEET_PAGE_SIZE,
        ),
      }, { timeout: 10_000 });
      if (isCancelled()) return { status: "unavailable" };
      const text = extractToolResultText(result);
      if (result.isError) {
        return {
          status: "error",
          message: text ?? t("common.error.tool_failed"),
          ...(text ? {} : { messageKey: "common.error.tool_failed" }),
        };
      }
      if (!text) {
        return {
          status: "error",
          message: t("common.error.no_payload"),
          messageKey: "common.error.no_payload",
        };
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return invalidPayload();
      }
      if (
        !payload || typeof payload !== "object" ||
        !("doctype" in payload) || payload.doctype !== "Timesheet" ||
        !("data" in payload) || !Array.isArray(payload.data) ||
        payload.data.length > TASK_TIMESHEET_PAGE_SIZE ||
        !payload.data.every((doc: unknown) =>
          doc !== null && typeof doc === "object" && "name" in doc &&
          typeof doc.name === "string" && doc.name.length > 0
        )
      ) {
        return invalidPayload();
      }

      for (const doc of payload.data) {
        distinctNames.add((doc as { name: string }).name);
      }
      if (payload.data.length < TASK_TIMESHEET_PAGE_SIZE) {
        return distinctNames.size > 0
          ? { status: "present", count: distinctNames.size }
          : { status: "empty" };
      }
    } catch (cause) {
      if (isCancelled()) return { status: "unavailable" };
      return {
        status: "error",
        message: cause instanceof Error
          ? cause.message
          : t("common.error.tool_failed"),
        ...(cause instanceof Error
          ? {}
          : { messageKey: "common.error.tool_failed" }),
      };
    }
  }

  // Never publish a truncated count: an unusually large relation remains an
  // explicit error instead of masquerading as an exact value.
  return relationTooLarge();
}

export function startTaskTimesheetAvailabilityCheck(
  host: ToolHost,
  taskId: string,
  publish: (availability: TaskTimesheetAvailability) => void,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false;
  publish({ status: "loading" });
  const done = loadTaskTimesheetAvailability(
    host,
    taskId,
    () => cancelled,
  ).then(
    (availability) => {
      if (!cancelled) publish(availability);
    },
  );
  return {
    done,
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Host errors stay verbatim; viewer fallback messages follow later locale changes. */
export function taskTimesheetAvailabilityErrorMessage(
  availability: Extract<TaskTimesheetAvailability, { status: "error" }>,
  translate: typeof t,
): string {
  return availability.messageKey
    ? translate(availability.messageKey)
    : availability.message;
}

export function canNavigateToTaskTimesheets(
  availability: TaskTimesheetAvailability,
): boolean {
  return availability.status === "present" ||
    (availability.status === "error" &&
      availability.messageKey === TASK_TIMESHEET_TOO_LARGE_KEY);
}
