import { extractToolResultText } from "../refresh.ts";

export interface DocumentAttachment {
  /** Canonical Frappe File document id. Never use file_url as authority. */
  id: string;
  fileName: string;
  fileSize: number | null;
  isPrivate: boolean;
  attachedToField?: string;
  createdAt?: string;
  modifiedAt?: string;
  owner?: string;
}

export interface EmbeddedDownloadResource {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    blob: string;
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Parse the bounded attachment-list contract without trusting file URLs. */
export function attachmentListFromToolResult(
  result: unknown,
): DocumentAttachment[] {
  const toolResult = record(result);
  if (!toolResult || toolResult.isError === true) {
    throw new Error("attachment list failed");
  }
  const text = extractToolResultText(toolResult);
  if (!text) throw new Error("attachment list is empty");

  const payload = record(JSON.parse(text));
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("attachment list is malformed");
  }

  return payload.data.map((raw, index) => {
    const file = record(raw);
    const id = optionalString(file?.name);
    const fileName = optionalString(file?.file_name);
    if (!file || !id || !fileName) {
      throw new Error(`attachment ${index + 1} has no canonical identity`);
    }
    const size = file.file_size;
    const fileSize = size === null || size === undefined
      ? null
      : typeof size === "number" && Number.isFinite(size) && size >= 0
      ? size
      : null;
    return {
      id,
      fileName,
      fileSize,
      isPrivate: file.is_private === true || file.is_private === 1,
      attachedToField: optionalString(file.attached_to_field),
      createdAt: optionalString(file.creation),
      modifiedAt: optionalString(file.modified),
      owner: optionalString(file.owner),
    };
  });
}

/**
 * Extract the single inline resource returned by the app-only download tool.
 * It is deliberately returned only to the click handler, never persisted in UI
 * state, so large base64 data is eligible for collection immediately afterward.
 */
export function downloadResourceFromToolResult(
  result: unknown,
): EmbeddedDownloadResource {
  const toolResult = record(result);
  if (!toolResult || toolResult.isError === true) {
    throw new Error("attachment download failed");
  }
  const content = Array.isArray(toolResult.content) ? toolResult.content : [];
  const resources = content.flatMap((raw) => {
    const block = record(raw);
    const resource = record(block?.resource);
    if (block?.type !== "resource" || !resource) return [];
    const uri = optionalString(resource.uri);
    const blob = optionalString(resource.blob);
    if (!uri || !blob) return [];
    const mimeType = optionalString(resource.mimeType);
    return [{
      type: "resource" as const,
      resource: { uri, ...(mimeType ? { mimeType } : {}), blob },
    }];
  });
  if (resources.length !== 1) {
    throw new Error("attachment download did not return one inline resource");
  }
  return resources[0];
}
