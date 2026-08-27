import type { EmbeddedDownloadResource } from "./attachment-results.ts";

export type AttachmentPreviewKind = "image" | "pdf" | "text" | "unsupported";

export interface AttachmentTextPreview {
  text: string;
  truncated: boolean;
  byteLength: number;
}

/**
 * Decoded preview kept by the UI while the sheet is open. The transport's
 * base64 string is deliberately not retained in component state.
 */
export interface PreparedAttachmentPreview {
  kind: AttachmentPreviewKind;
  uri: string;
  mimeType: string;
  bytes: Uint8Array;
  text?: string;
  textTruncated?: boolean;
}

const IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

const PREVIEW_FILE_EXTENSIONS = new Set([
  "csv",
  "gif",
  "jpeg",
  "jpg",
  "json",
  "md",
  "pdf",
  "png",
  "txt",
  "webp",
]);

export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;
export const MAX_BINARY_PREVIEW_BYTES = 5 * 1024 * 1024;

export function normalizedMimeType(mimeType: string | undefined): string {
  return mimeType?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

/** The filename is only an affordance hint; the fetched MIME remains authority. */
export function isAttachmentPreviewCandidate(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return false;
  return PREVIEW_FILE_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase());
}

export function attachmentPreviewKind(
  resource: EmbeddedDownloadResource,
): AttachmentPreviewKind {
  const mimeType = normalizedMimeType(resource.resource.mimeType);
  if (base64ByteLength(resource.resource.blob) > MAX_BINARY_PREVIEW_BYTES) {
    return "unsupported";
  }
  if (IMAGE_MIME_TYPES.has(mimeType)) {
    return hasImageSignature(mimeType, resource.resource.blob)
      ? "image"
      : "unsupported";
  }
  if (mimeType === "application/pdf") {
    return hasPdfSignature(resource.resource.blob) ? "pdf" : "unsupported";
  }
  if (TEXT_MIME_TYPES.has(mimeType)) return "text";
  return "unsupported";
}

export function base64Bytes(value: string): Uint8Array {
  assertCanonicalBase64(value);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64ByteLength(value: string): number {
  assertCanonicalBase64(value);
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return value.length / 4 * 3 - padding;
}

export function attachmentTextPreview(
  resource: EmbeddedDownloadResource,
  maxBytes = MAX_TEXT_PREVIEW_BYTES,
): AttachmentTextPreview {
  if (attachmentPreviewKind(resource) !== "text") {
    throw new Error("attachment is not previewable text");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive safe integer");
  }
  const byteLength = base64ByteLength(resource.resource.blob);
  const truncated = byteLength > maxBytes;
  const encodedLength = truncated ? Math.ceil(maxBytes / 3) * 4 : undefined;
  const prefix = encodedLength === undefined
    ? resource.resource.blob
    : resource.resource.blob.slice(0, encodedLength);
  const bytes = base64Bytes(prefix);
  const visible = truncated ? bytes.subarray(0, maxBytes) : bytes;
  return {
    text: decodeUtf8(visible, truncated),
    truncated,
    byteLength,
  };
}

export function prepareAttachmentPreview(
  resource: EmbeddedDownloadResource,
): PreparedAttachmentPreview {
  const mimeType = normalizedMimeType(resource.resource.mimeType) ||
    "application/octet-stream";
  const bytes = base64Bytes(resource.resource.blob);
  let kind = attachmentPreviewKind(resource);
  let textPreview: AttachmentTextPreview | undefined;
  if (kind === "text") {
    try {
      textPreview = attachmentTextPreview(resource);
    } catch {
      // Invalid UTF-8 is never rendered. The fetched file can still be saved.
      kind = "unsupported";
    }
  }
  return {
    kind,
    uri: resource.resource.uri,
    mimeType,
    bytes,
    ...(textPreview
      ? { text: textPreview.text, textTruncated: textPreview.truncated }
      : {}),
  };
}

/** Recreate the host-mediated download resource without another ERP request. */
export function resourceFromPreparedPreview(
  preview: PreparedAttachmentPreview,
): EmbeddedDownloadResource {
  return {
    type: "resource",
    resource: {
      uri: preview.uri,
      mimeType: preview.mimeType,
      blob: bytesToBase64(preview.bytes),
    },
  };
}

function hasPdfSignature(value: string): boolean {
  try {
    const prefix = atob(value.slice(0, 12));
    return prefix.startsWith("%PDF-");
  } catch {
    return false;
  }
}

function assertCanonicalBase64(value: string): void {
  if (
    value.length === 0 || value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error("attachment blob is not canonical base64");
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    let chunk = "";
    const end = Math.min(offset + chunkSize, bytes.length);
    for (let index = offset; index < end; index += 1) {
      chunk += String.fromCharCode(bytes[index]);
    }
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
}

function decodeUtf8(bytes: Uint8Array, allowIncompleteTail: boolean): string {
  const decoder = () => new TextDecoder("utf-8", { fatal: true });
  try {
    return decoder().decode(bytes);
  } catch (cause) {
    if (!allowIncompleteTail) throw cause;
    // A bounded text preview may end inside a multi-byte code point. Trim only
    // that possible tail; malformed bytes elsewhere still fail closed.
    for (let trim = 1; trim <= 3 && trim < bytes.length; trim += 1) {
      try {
        return decoder().decode(bytes.subarray(0, bytes.length - trim));
      } catch {
        // Try the next possible UTF-8 sequence length.
      }
    }
    throw cause;
  }
}

function hasImageSignature(mimeType: string, value: string): boolean {
  try {
    const bytes = base64Bytes(value.slice(0, Math.min(value.length, 24)));
    if (mimeType === "image/png") {
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      );
    }
    if (mimeType === "image/jpeg") {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    const ascii = new TextDecoder("ascii").decode(bytes);
    if (mimeType === "image/gif") {
      return ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
    }
    return mimeType === "image/webp" && ascii.startsWith("RIFF") &&
      ascii.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}
