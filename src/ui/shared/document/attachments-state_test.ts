import { assert, assertEquals } from "@std/assert";
import {
  acceptsAttachmentToken,
  canStartAttachmentUpload,
  createAttachmentsState,
  invalidateAttachmentRequests,
  reserveAttachmentRequest,
  resetAttachmentsState,
  settleAttachmentUploadFailure,
} from "./attachments-state.ts";

Deno.test("attachment token becomes stale when the document changes", () => {
  const initial = createAttachmentsState("Task:TASK-1");
  const reserved = reserveAttachmentRequest(initial);
  const changed = resetAttachmentsState(reserved.state, "Task:TASK-2");
  assertEquals(acceptsAttachmentToken(changed, reserved.token), false);
});

Deno.test("post-mutation invalidation rejects an older attachment list", () => {
  const reserved = reserveAttachmentRequest(
    createAttachmentsState("Task:TASK-1"),
  );
  const invalidated = invalidateAttachmentRequests(reserved.state);
  assertEquals(acceptsAttachmentToken(invalidated, reserved.token), false);
  const fresh = reserveAttachmentRequest(invalidated);
  assert(acceptsAttachmentToken(fresh.state, fresh.token));
});

Deno.test("only the newest attachment request wins within one revision", () => {
  const first = reserveAttachmentRequest(
    createAttachmentsState("Task:TASK-1"),
  );
  const second = reserveAttachmentRequest(first.state);

  assertEquals(acceptsAttachmentToken(second.state, first.token), false);
  assert(acceptsAttachmentToken(second.state, second.token));
});

Deno.test("attachment uploads are single-flight", () => {
  const state = createAttachmentsState("Task:TASK-1");
  assert(canStartAttachmentUpload(state));
  assertEquals(
    canStartAttachmentUpload({ ...state, upload: "reading" }),
    false,
  );
  assertEquals(
    canStartAttachmentUpload({ ...state, upload: "uploading" }),
    false,
  );
  assertEquals(
    canStartAttachmentUpload({ ...state, upload: "relisting" }),
    false,
  );
  assert(canStartAttachmentUpload({ ...state, upload: "error" }));
});

Deno.test("failed upload releases the list load it superseded", () => {
  const initialList = reserveAttachmentRequest(
    createAttachmentsState("Task:TASK-1"),
  );
  const loading = { ...initialList.state, load: "loading" as const };
  const upload = reserveAttachmentRequest(loading);
  const uploading = { ...upload.state, upload: "uploading" as const };

  // Starting the upload makes the slow initial list response stale.
  assertEquals(acceptsAttachmentToken(uploading, initialList.token), false);
  assert(acceptsAttachmentToken(uploading, upload.token));

  const failed = settleAttachmentUploadFailure(uploading);

  // The stale list can no longer settle this state, so the upload failure must
  // release it and allow an explicit refresh to reserve the next valid token.
  assertEquals(failed.load, "idle");
  assertEquals(failed.upload, "error");
  const retry = reserveAttachmentRequest(failed);
  assert(acceptsAttachmentToken(retry.state, retry.token));
  assertEquals(acceptsAttachmentToken(retry.state, initialList.token), false);
});
