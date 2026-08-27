import type { App } from "@modelcontextprotocol/ext-apps";
import { useCallback, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useT } from "../i18n-hook.ts";
import type { DocumentChangeEvent } from "../document-events.ts";
import { extractToolResultText } from "../refresh.ts";
import {
  acceptsAttachmentToken,
  type AttachmentsState,
  canStartAttachmentUpload,
  createAttachmentsState,
  invalidateAttachmentRequests,
  reserveAttachmentRequest,
  resetAttachmentsState,
  settleAttachmentUploadFailure,
} from "./attachments-state.ts";
import type { DocumentCapabilities } from "./capabilities.ts";
import {
  attachmentListFromToolResult,
  type DocumentAttachment,
  downloadResourceFromToolResult,
  type EmbeddedDownloadResource,
} from "./attachment-results.ts";
import {
  prepareAttachmentPreview,
  type PreparedAttachmentPreview,
  resourceFromPreparedPreview,
} from "./attachment-preview.ts";
import type { DocumentEnvelope } from "./types.ts";

const TOOL_CALL_TIMEOUT_MS = 30_000;
export const MAX_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface PreparedDocumentAttachment {
  documentKey: string;
  fileId: string;
  fileName: string;
  preview: PreparedAttachmentPreview;
}

export interface AttachmentsController {
  documentKey: string;
  document: { doctype: string; name: string };
  state: AttachmentsState;
  files: readonly DocumentAttachment[];
  readProgress: number | null;
  refresh: () => Promise<boolean>;
  upload: (file: File, isPrivate: boolean) => Promise<boolean>;
  preview: (file: DocumentAttachment) => Promise<
    PreparedDocumentAttachment | null
  >;
  download: (
    file: DocumentAttachment,
    prepared?: PreparedDocumentAttachment,
  ) => Promise<boolean>;
  dismissError: () => void;
}

export interface UseAttachmentsOptions {
  app: App;
  envelope: DocumentEnvelope;
  capabilities: DocumentCapabilities;
  fixtureFiles?: readonly DocumentAttachment[];
  /** Called after ERPNext commits the attachment, before the mandatory relist. */
  onDocumentChanged?: (event: DocumentChangeEvent) => void;
}

function documentKey(envelope: DocumentEnvelope): string {
  return `${envelope.doctype}\u0000${envelope.name}`;
}

function resultError(result: unknown, fallback: string): string {
  if (result && typeof result === "object") {
    const text = extractToolResultText(result as Record<string, unknown>);
    if (text && !text.trim().startsWith("{")) return text;
  }
  return fallback;
}

type AttachmentTransferPurpose = "preview" | "download";

interface AttachmentTransfer {
  token: symbol;
  generation: number;
  documentKey: string;
  fileId: string;
  purpose: AttachmentTransferPurpose;
}

function readFile(
  file: File,
  onProgress: (progress: number | null) => void,
  onReader: (reader: FileReader | null) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    onReader(reader);
    reader.onprogress = (event) => {
      onProgress(
        event.lengthComputable && event.total > 0
          ? event.loaded / event.total
          : null,
      );
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("file read failed"));
    reader.onabort = () => reject(new Error("file read aborted"));
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0 || !value.slice(comma + 1)) {
        reject(new Error("file read is empty"));
        return;
      }
      resolve(value.slice(comma + 1));
    };
    reader.onloadend = () => onReader(null);
    reader.readAsDataURL(file);
  });
}

export function useAttachments({
  app,
  envelope,
  capabilities,
  fixtureFiles,
  onDocumentChanged,
}: UseAttachmentsOptions): AttachmentsController {
  const t = useT();
  const { doctype, name } = envelope;
  const key = documentKey(envelope);
  const identityRef = useRef(key);
  const stateRef = useRef(createAttachmentsState(key));
  const [state, setState] = useState(stateRef.current);
  const [files, setFiles] = useState<readonly DocumentAttachment[]>(
    fixtureFiles ?? [],
  );
  const [readProgress, setReadProgress] = useState<number | null>(null);
  const uploadInFlightRef = useRef(false);
  const lifecycleRef = useRef(0);
  const transferInFlightRef = useRef<AttachmentTransfer | null>(null);
  const readerRef = useRef<FileReader | null>(null);

  // Invalidate old async work synchronously during render. The layout effect
  // then swaps the visible state before the browser paints the new document.
  if (identityRef.current !== key) {
    identityRef.current = key;
    lifecycleRef.current += 1;
    stateRef.current = resetAttachmentsState(stateRef.current, key);
    uploadInFlightRef.current = false;
    transferInFlightRef.current = null;
    readerRef.current?.abort();
    readerRef.current = null;
  }

  const commitState = useCallback(
    (update: (current: AttachmentsState) => AttachmentsState) => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  const load = useCallback(async (
    reason: "refresh" | "after-upload" = "refresh",
  ): Promise<boolean> => {
    if (!capabilities.canListAttachments) return false;
    const base = resetAttachmentsState(stateRef.current, key);
    const reserved = reserveAttachmentRequest(base);
    const token = reserved.token;
    commitState(() => ({
      ...reserved.state,
      load: "loading",
      upload: reason === "after-upload" ? "relisting" : reserved.state.upload,
    }));

    try {
      const result = await app.callServerTool({
        name: "erpnext_file_list",
        arguments: {
          attached_to_doctype: doctype,
          attached_to_name: name,
          limit: 50,
        },
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (
        identityRef.current !== key ||
        !acceptsAttachmentToken(stateRef.current, token)
      ) return false;
      const nextFiles = attachmentListFromToolResult(result);
      setFiles(nextFiles);
      commitState((current) => ({
        ...current,
        load: "ready",
        upload: reason === "after-upload" ? "idle" : current.upload,
        error: current.error?.operation === "list" ||
            (reason === "after-upload" && current.error?.operation === "upload")
          ? null
          : current.error,
      }));
      return true;
    } catch {
      if (
        identityRef.current !== key ||
        !acceptsAttachmentToken(stateRef.current, token)
      ) return false;
      commitState((current) => ({
        ...current,
        load: "error",
        upload: reason === "after-upload" ? "error" : current.upload,
        error: {
          operation: reason === "after-upload" ? "upload" : "list",
          message: t(
            reason === "after-upload"
              ? "document.attachments.error.relist"
              : "document.attachments.error.list",
          ),
        },
      }));
      return false;
    }
  }, [
    app,
    capabilities.canListAttachments,
    commitState,
    doctype,
    key,
    name,
    t,
  ]);

  const upload = useCallback(async (
    file: File,
    isPrivate: boolean,
  ): Promise<boolean> => {
    if (
      !capabilities.canUploadAttachment || uploadInFlightRef.current ||
      !canStartAttachmentUpload(stateRef.current)
    ) return false;

    if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      commitState((current) => ({
        ...current,
        upload: "error",
        error: {
          operation: "upload",
          fileName: file.name,
          message: t("document.attachments.error.too_large", {
            limit: Math.round(MAX_ATTACHMENT_UPLOAD_BYTES / 1024 / 1024),
          }),
        },
      }));
      return false;
    }

    uploadInFlightRef.current = true;
    const base = resetAttachmentsState(stateRef.current, key);
    const reserved = reserveAttachmentRequest(base);
    const token = reserved.token;
    commitState(() => ({
      ...reserved.state,
      upload: "reading",
      error: null,
    }));
    setReadProgress(0);

    try {
      const contentBase64 = await readFile(
        file,
        (progress) => {
          if (
            identityRef.current === key &&
            acceptsAttachmentToken(stateRef.current, token)
          ) setReadProgress(progress);
        },
        (reader) => {
          readerRef.current = reader;
        },
      );
      if (
        identityRef.current !== key ||
        !acceptsAttachmentToken(stateRef.current, token)
      ) return false;

      commitState((current) => ({ ...current, upload: "uploading" }));
      setReadProgress(null);
      const result = await app.callServerTool({
        name: "erpnext_file_upload",
        arguments: {
          file_name: file.name,
          content_base64: contentBase64,
          attached_to_doctype: doctype,
          attached_to_name: name,
          is_private: isPrivate,
        },
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (
        identityRef.current !== key ||
        !acceptsAttachmentToken(stateRef.current, token)
      ) return false;
      if (result.isError) {
        throw new Error(
          resultError(result, t("document.attachments.error.upload")),
        );
      }

      // The mutation is committed. Invalidate every earlier list response and
      // emit before the mandatory canonical relist.
      commitState((current) => ({
        ...invalidateAttachmentRequests(current),
        upload: "relisting",
      }));
      onDocumentChanged?.({
        doctype,
        name,
        mutation: "attachment.added",
        committedAt: new Date().toISOString(),
        source: "document.attachments",
      });
      return await load("after-upload");
    } catch (cause) {
      if (
        identityRef.current !== key ||
        !acceptsAttachmentToken(stateRef.current, token)
      ) return false;
      commitState((current) => ({
        ...settleAttachmentUploadFailure(current),
        error: {
          operation: "upload",
          fileName: file.name,
          message: cause instanceof Error && cause.message
            ? cause.message
            : t("document.attachments.error.upload"),
        },
      }));
      return false;
    } finally {
      if (identityRef.current === key) {
        uploadInFlightRef.current = false;
        setReadProgress(null);
      }
    }
  }, [
    app,
    capabilities.canUploadAttachment,
    commitState,
    doctype,
    key,
    load,
    name,
    onDocumentChanged,
    t,
  ]);

  const beginTransfer = useCallback((
    file: DocumentAttachment,
    purpose: AttachmentTransferPurpose,
  ): AttachmentTransfer | null => {
    if (transferInFlightRef.current !== null) return null;
    const transfer = {
      token: Symbol(`${purpose}:${file.id}`),
      generation: lifecycleRef.current,
      documentKey: key,
      fileId: file.id,
      purpose,
    };
    transferInFlightRef.current = transfer;
    commitState((current) => ({
      ...current,
      previewingFile: purpose === "preview" ? file.id : null,
      downloadingFile: purpose === "download" ? file.id : null,
      error: null,
    }));
    return transfer;
  }, [commitState, key]);

  const transferIsCurrent = useCallback((
    transfer: AttachmentTransfer,
  ): boolean => {
    const current = transferInFlightRef.current;
    return identityRef.current === transfer.documentKey &&
      lifecycleRef.current === transfer.generation &&
      current?.token === transfer.token;
  }, []);

  const finishTransfer = useCallback((transfer: AttachmentTransfer) => {
    if (!transferIsCurrent(transfer)) return;
    transferInFlightRef.current = null;
    commitState((current) => ({
      ...current,
      previewingFile: null,
      downloadingFile: null,
    }));
  }, [commitState, transferIsCurrent]);

  const fetchAttachment = useCallback(async (
    file: DocumentAttachment,
    transfer: AttachmentTransfer,
  ): Promise<EmbeddedDownloadResource | null> => {
    const result = await app.callServerTool({
      name: "erpnext_file_download",
      arguments: {
        file_id: file.id,
        attached_to_doctype: doctype,
        attached_to_name: name,
      },
    }, { timeout: TOOL_CALL_TIMEOUT_MS });
    if (!transferIsCurrent(transfer)) return null;
    if (result.isError) {
      throw new Error(resultError(
        result,
        t(
          transfer.purpose === "preview"
            ? "document.attachments.error.preview"
            : "document.attachments.error.download",
        ),
      ));
    }
    const resource = downloadResourceFromToolResult(result);
    return transferIsCurrent(transfer) ? resource : null;
  }, [app, doctype, name, t, transferIsCurrent]);

  const settleTransferError = useCallback((
    transfer: AttachmentTransfer,
    file: DocumentAttachment,
    cause: unknown,
  ) => {
    if (!transferIsCurrent(transfer)) return;
    commitState((current) => ({
      ...current,
      error: {
        operation: transfer.purpose,
        fileName: file.fileName,
        message: cause instanceof Error && cause.message ? cause.message : t(
          transfer.purpose === "preview"
            ? "document.attachments.error.preview"
            : "document.attachments.error.download",
        ),
      },
    }));
  }, [commitState, t, transferIsCurrent]);

  const preview = useCallback(async (
    file: DocumentAttachment,
  ): Promise<PreparedDocumentAttachment | null> => {
    if (!capabilities.canPreviewAttachment) return null;
    const transfer = beginTransfer(file, "preview");
    if (!transfer) return null;
    try {
      const resource = await fetchAttachment(file, transfer);
      if (!resource || !transferIsCurrent(transfer)) return null;
      const prepared = prepareAttachmentPreview(resource);
      if (!transferIsCurrent(transfer)) return null;
      return {
        documentKey: key,
        fileId: file.id,
        fileName: file.fileName,
        preview: prepared,
      };
    } catch (cause) {
      settleTransferError(transfer, file, cause);
      return null;
    } finally {
      finishTransfer(transfer);
    }
  }, [
    beginTransfer,
    capabilities.canPreviewAttachment,
    fetchAttachment,
    finishTransfer,
    key,
    settleTransferError,
    transferIsCurrent,
  ]);

  const download = useCallback(async (
    file: DocumentAttachment,
    prepared?: PreparedDocumentAttachment,
  ): Promise<boolean> => {
    if (!capabilities.canDownloadAttachment) return false;
    const transfer = beginTransfer(file, "download");
    if (!transfer) return false;
    try {
      const reusable = prepared?.documentKey === key &&
          prepared.fileId === file.id
        ? resourceFromPreparedPreview(prepared.preview)
        : null;
      const resource = reusable ?? await fetchAttachment(file, transfer);
      if (!resource || !transferIsCurrent(transfer)) return false;
      const hostResult = await app.downloadFile(
        { contents: [resource] },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (!transferIsCurrent(transfer)) return false;
      if (hostResult.isError) {
        throw new Error(t("document.attachments.error.host_denied"));
      }
      return true;
    } catch (cause) {
      settleTransferError(transfer, file, cause);
      return false;
    } finally {
      finishTransfer(transfer);
    }
  }, [
    app,
    beginTransfer,
    capabilities.canDownloadAttachment,
    fetchAttachment,
    finishTransfer,
    key,
    settleTransferError,
    t,
    transferIsCurrent,
  ]);

  useLayoutEffect(() => {
    readerRef.current?.abort();
    readerRef.current = null;
    uploadInFlightRef.current = false;
    transferInFlightRef.current = null;
    const next = resetAttachmentsState(stateRef.current, key);
    stateRef.current = next;
    setState(next);
    setFiles(fixtureFiles ?? []);
    setReadProgress(null);
    if (!fixtureFiles && capabilities.canListAttachments) void load();
    return () => {
      lifecycleRef.current += 1;
      transferInFlightRef.current = null;
      readerRef.current?.abort();
    };
  }, [key, fixtureFiles, capabilities.canListAttachments, load]);

  const dismissError = useCallback(() => {
    commitState((current) => ({
      ...current,
      error: null,
      upload: current.upload === "error" ? "idle" : current.upload,
    }));
  }, [commitState]);

  return {
    documentKey: key,
    document: { doctype, name },
    state,
    files: state.documentKey === key ? files : [],
    readProgress,
    refresh: load,
    upload,
    preview,
    download,
    dismissError,
  };
}
