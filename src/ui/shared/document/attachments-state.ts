export type AttachmentLoadState = "idle" | "loading" | "ready" | "error";
export type AttachmentUploadState =
  | "idle"
  | "reading"
  | "uploading"
  | "relisting"
  | "error";

export interface PersistentAttachmentError {
  operation: "list" | "upload" | "download";
  message: string;
  fileName?: string;
}

export interface AttachmentsState {
  documentKey: string;
  revision: number;
  nextRequest: number;
  load: AttachmentLoadState;
  upload: AttachmentUploadState;
  downloadingFile: string | null;
  error: PersistentAttachmentError | null;
}

export interface AttachmentToken {
  documentKey: string;
  revision: number;
  request: number;
}

export function createAttachmentsState(documentKey: string): AttachmentsState {
  return {
    documentKey,
    revision: 0,
    nextRequest: 1,
    load: "idle",
    upload: "idle",
    downloadingFile: null,
    error: null,
  };
}

export function resetAttachmentsState(
  state: AttachmentsState,
  documentKey: string,
): AttachmentsState {
  if (state.documentKey === documentKey) return state;
  return {
    ...createAttachmentsState(documentKey),
    revision: state.revision + 1,
    nextRequest: state.nextRequest,
  };
}

export function reserveAttachmentRequest(
  state: AttachmentsState,
): { state: AttachmentsState; token: AttachmentToken } {
  return {
    state: { ...state, nextRequest: state.nextRequest + 1 },
    token: {
      documentKey: state.documentKey,
      revision: state.revision,
      request: state.nextRequest,
    },
  };
}

export function invalidateAttachmentRequests(
  state: AttachmentsState,
): AttachmentsState {
  return { ...state, revision: state.revision + 1 };
}

export function acceptsAttachmentToken(
  state: AttachmentsState,
  token: AttachmentToken,
): boolean {
  return state.documentKey === token.documentKey &&
    state.revision === token.revision &&
    state.nextRequest === token.request + 1;
}

export function canStartAttachmentUpload(state: AttachmentsState): boolean {
  return state.upload === "idle" || state.upload === "error";
}

/**
 * Settle an upload failure after its request superseded the current list load.
 * The superseded list response can no longer leave `load` because its token is
 * stale, so release that loading state and let the user retry explicitly.
 */
export function settleAttachmentUploadFailure(
  state: AttachmentsState,
): AttachmentsState {
  return {
    ...state,
    load: state.load === "loading" ? "idle" : state.load,
    upload: "error",
  };
}
