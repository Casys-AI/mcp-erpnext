import type { UiRefreshRequestData } from "../../shared/refresh.ts";
import { canCallViewerTool } from "../../shared/viewer-tools.ts";

/** Le contrôle de refresh n'existe que si l'hôte peut appeler son outil exact. */
export function canRefreshDoclistRoot(
  serverTools: unknown,
  availableTools: readonly string[] | undefined,
  request: UiRefreshRequestData | null,
): boolean {
  return request !== null && canCallViewerTool(
    serverTools,
    availableTools,
    request.toolName,
  );
}
