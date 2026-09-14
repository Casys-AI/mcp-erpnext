import { t } from "../i18n.ts";
import type { ToolHost } from "../jumps.ts";
import { extractToolResultText } from "../refresh.ts";
import { canCallViewerTool } from "../viewer-tools.ts";

export type TaskTimesheetAvailability =
  | { status: "unavailable" | "loading" | "present" | "empty" }
  | { status: "error"; message: string };

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
): Record<string, unknown> {
  return {
    doctype: "Timesheet",
    fields: ["name"],
    filters: [["Timesheet Detail", "task", "=", taskId]],
    limit: 1,
  };
}

export async function loadTaskTimesheetAvailability(
  host: ToolHost,
  taskId: string,
): Promise<TaskTimesheetAvailability> {
  if (!taskId.trim()) return { status: "unavailable" };
  try {
    const result = await host.callServerTool({
      name: "erpnext_doc_list",
      arguments: taskTimesheetAvailabilityArguments(taskId),
    }, { timeout: 10_000 });
    const text = extractToolResultText(result);
    if (result.isError) {
      return {
        status: "error",
        message: text ?? t("common.error.tool_failed"),
      };
    }
    if (!text) {
      return { status: "error", message: t("common.error.no_payload") };
    }
    const payload: unknown = JSON.parse(text);
    if (
      !payload || typeof payload !== "object" ||
      !("doctype" in payload) || payload.doctype !== "Timesheet" ||
      !("data" in payload) || !Array.isArray(payload.data) ||
      !payload.data.every((doc: unknown) =>
        doc !== null && typeof doc === "object" && "name" in doc &&
        typeof doc.name === "string" && doc.name.length > 0
      )
    ) {
      return { status: "error", message: t("common.error.parse_failed") };
    }
    // The child-table join can repeat a parent; one row proves presence only.
    return { status: payload.data.length > 0 ? "present" : "empty" };
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error
        ? cause.message
        : t("common.error.tool_failed"),
    };
  }
}

export function startTaskTimesheetAvailabilityCheck(
  host: ToolHost,
  taskId: string,
  publish: (availability: TaskTimesheetAvailability) => void,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false;
  publish({ status: "loading" });
  const done = loadTaskTimesheetAvailability(host, taskId).then(
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
