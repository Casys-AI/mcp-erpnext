import type { UiRefreshRequestData } from "../refresh.ts";

export interface DocumentHostCapabilities {
  serverTools?: unknown;
  downloadFile?: unknown;
}

export interface DocumentCapabilities {
  canRefresh: boolean;
  canListAttachments: boolean;
  canUploadAttachment: boolean;
  canDownloadAttachment: boolean;
  canSubmit: boolean;
  canCancel: boolean;
}

/**
 * Capabilities for document-initiated calls are deliberately fail-closed.
 * A beta.2 document payload is required to carry the server-filtered manifest;
 * an absent legacy manifest still renders the document, but exposes no action.
 */
export function documentCapabilities(
  host: DocumentHostCapabilities | undefined,
  availableTools: readonly string[] | undefined,
  refreshRequest?: UiRefreshRequestData,
): DocumentCapabilities {
  const serverTools = Boolean(host?.serverTools);
  const has = (toolName: string) =>
    serverTools && Array.isArray(availableTools) &&
    availableTools.includes(toolName);

  const canListAttachments = has("erpnext_file_list");
  return {
    canRefresh: Boolean(refreshRequest && has(refreshRequest.toolName)),
    canListAttachments,
    canUploadAttachment: canListAttachments && has("erpnext_file_upload"),
    canDownloadAttachment: canListAttachments &&
      has("erpnext_file_download") && Boolean(host?.downloadFile),
    canSubmit: has("erpnext_doc_submit"),
    canCancel: has("erpnext_doc_cancel"),
  };
}
