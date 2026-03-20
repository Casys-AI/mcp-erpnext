/**
 * Shared field utilities for kanban card enrichment.
 * Parse Frappe-specific field formats into display-ready values.
 */

/** Extract the first assignee email from Frappe's `_assign` JSON field. */
export function parseFirstAssignee(assign: unknown): string | undefined {
  if (typeof assign !== "string" || assign.length === 0) return undefined;
  try {
    const parsed = JSON.parse(assign) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
      return parsed[0];
    }
  } catch {
    // Not valid JSON — ignore
  }
  return undefined;
}

/** Strip HTML tags and &nbsp; entities, then truncate to `maxLen` with trailing ellipsis if needed. */
export function truncateDescription(desc: unknown, maxLen = 80): string | undefined {
  if (typeof desc !== "string" || desc.length === 0) return undefined;
  const plain = desc.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (plain.length === 0) return undefined;
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen).trimEnd() + "\u2026";
}

/** Check whether a date string (YYYY-MM-DD) is strictly before today. Today's date is NOT considered overdue. Uses string comparison to avoid timezone issues. */
export function isDateOverdue(dateStr: unknown): boolean {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) < todayStr;
}

/** Format a date string for display (e.g. "Mar 20"). */
export function formatShortDate(dateStr: unknown): string | undefined {
  if (typeof dateStr !== "string" || dateStr.length === 0) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Map an ERPNext priority string to a badge tone. */
export function priorityTone(priority: string): "neutral" | "warning" | "error" {
  if (priority === "Urgent") return "error";
  if (priority === "High") return "warning";
  return "neutral";
}