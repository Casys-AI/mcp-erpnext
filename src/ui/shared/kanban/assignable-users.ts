import { t } from "../i18n.ts";
import type { ToolHost } from "../jumps.ts";
import { extractToolResultText } from "../refresh.ts";
import { collectToolPages } from "../tool-pages.ts";

export interface AssignableUser {
  name: string;
  full_name?: string;
}

export function loadAssignableUsers(
  host: ToolHost,
  isCurrent: () => boolean,
): Promise<AssignableUser[] | null> {
  return collectToolPages<AssignableUser>(
    async (offset, limit) => {
      const result = await host.callServerTool({
        name: "erpnext_user_list",
        arguments: { limit, offset },
      }, { timeout: 10_000 });
      const text = extractToolResultText(result);
      if (result.isError) {
        let message = text ?? t("common.error.tool_failed");
        try {
          const error = JSON.parse(message);
          message = String(error?.errorMessage ?? error?.message ?? message);
        } catch {
          // Plain text diagnostics are already the server's error message.
        }
        throw new Error(message);
      }
      if (!text) throw new Error(t("kanban.error.user_list"));
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(t("kanban.error.user_list"));
      }
      if (
        !payload || typeof payload !== "object" ||
        !("data" in payload) || !Array.isArray(payload.data) ||
        !payload.data.every((row: unknown) =>
          row !== null && typeof row === "object" && "name" in row &&
          typeof row.name === "string"
        )
      ) throw new Error(t("kanban.error.user_list"));
      return payload.data as AssignableUser[];
    },
    (row) => row.name,
    isCurrent,
    { pageSize: 100 },
  );
}
