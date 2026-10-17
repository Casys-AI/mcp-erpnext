import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  FILE_DOWNLOAD_ERROR_CODES,
  FileDownloadError,
  isFileDownloadError,
} from "./file-download-error.ts";

Deno.test("FileDownloadError - renders '[tool] CODE: message. Recovery: recovery'", () => {
  const error = new FileDownloadError("APP_CONTEXT_REQUIRED", "not an App", {
    recovery: "open the viewer",
  });
  assertEquals(
    error.message,
    "[erpnext_file_download] APP_CONTEXT_REQUIRED: not an App. Recovery: open the viewer",
  );
  assertEquals(error.name, "FileDownloadError");
  assertEquals(error.code, "APP_CONTEXT_REQUIRED");
  assertEquals(error.detail, "not an App");
  assertEquals(error.recovery, "open the viewer");
});

Deno.test("FileDownloadError - is not retryable by default and its context is frozen and copied", () => {
  const source = { tool: "erpnext_file_download" };
  const error = new FileDownloadError("APP_CONTEXT_REQUIRED", "x", {
    context: source,
    recovery: "y",
  });
  assertFalse(error.retryable);
  assert(Object.isFrozen(error.context));
  source.tool = "mutated";
  assertEquals(error.context, { tool: "erpnext_file_download" });
});

Deno.test("FileDownloadError - the error code set is closed", () => {
  assertEquals([...FILE_DOWNLOAD_ERROR_CODES], ["APP_CONTEXT_REQUIRED"]);
});

Deno.test("isFileDownloadError - narrows only FileDownloadError", () => {
  assert(
    isFileDownloadError(
      new FileDownloadError("APP_CONTEXT_REQUIRED", "x", { recovery: "y" }),
    ),
  );
  assertFalse(isFileDownloadError(new Error("APP_CONTEXT_REQUIRED")));
  assertFalse(isFileDownloadError("APP_CONTEXT_REQUIRED"));
  assertFalse(isFileDownloadError(null));
});
