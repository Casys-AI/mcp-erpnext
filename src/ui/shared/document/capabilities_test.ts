import { assertEquals } from "@std/assert";
import { documentCapabilities } from "./capabilities.ts";

const REFRESH = {
  toolName: "erpnext_task_get",
  arguments: { name: "TASK-1" },
};

Deno.test("document capabilities fail closed without a server manifest", () => {
  assertEquals(
    documentCapabilities(
      { serverTools: {}, downloadFile: {} },
      undefined,
      REFRESH,
    ),
    {
      canRefresh: false,
      canListAttachments: false,
      canUploadAttachment: false,
      canPreviewAttachment: false,
      canDownloadAttachment: false,
      canSubmit: false,
      canCancel: false,
    },
  );
});

Deno.test("document capabilities require both host and exact tools", () => {
  const tools = [
    "erpnext_task_get",
    "erpnext_file_list",
    "erpnext_file_upload",
    "erpnext_file_download",
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
  ];
  assertEquals(
    documentCapabilities({ serverTools: {}, downloadFile: {} }, tools, REFRESH),
    {
      canRefresh: true,
      canListAttachments: true,
      canUploadAttachment: true,
      canPreviewAttachment: true,
      canDownloadAttachment: true,
      canSubmit: true,
      canCancel: true,
    },
  );
  assertEquals(
    documentCapabilities({ serverTools: {} }, tools, REFRESH)
      .canDownloadAttachment,
    false,
  );
  assertEquals(
    documentCapabilities({ downloadFile: {} }, tools, REFRESH)
      .canListAttachments,
    false,
  );
});

Deno.test("upload and download cannot bypass attachment listing", () => {
  const capabilities = documentCapabilities(
    { serverTools: {}, downloadFile: {} },
    ["erpnext_file_upload", "erpnext_file_download"],
  );
  assertEquals(capabilities.canUploadAttachment, false);
  assertEquals(capabilities.canPreviewAttachment, false);
  assertEquals(capabilities.canDownloadAttachment, false);
});

Deno.test("preview needs serverTools but not the host download channel", () => {
  const capabilities = documentCapabilities(
    { serverTools: {} },
    ["erpnext_file_list", "erpnext_file_download"],
  );
  assertEquals(capabilities.canPreviewAttachment, true);
  assertEquals(capabilities.canDownloadAttachment, false);
});
