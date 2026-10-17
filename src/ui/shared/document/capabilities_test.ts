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

Deno.test("document capabilities follow the server manifest, never the doctype", () => {
  const host = { serverTools: {} };
  // Supplier Quotation, Expense Claim… : le serveur publie les deux outils.
  const submittable = documentCapabilities(host, [
    "erpnext_doc_get",
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
  ]);
  assertEquals(submittable.canSubmit, true);
  assertEquals(submittable.canCancel, true);

  // Customer, Item, Task… : le serveur les retire, aucune action.
  const master = documentCapabilities(host, ["erpnext_doc_get"]);
  assertEquals(master.canSubmit, false);
  assertEquals(master.canCancel, false);

  // Un seul des deux outils chargé : seule cette action existe.
  const submitOnly = documentCapabilities(host, ["erpnext_doc_submit"]);
  assertEquals(submitOnly.canSubmit, true);
  assertEquals(submitOnly.canCancel, false);

  // Sans proxy d'outils de l'hôte, le manifeste ne suffit pas.
  assertEquals(
    documentCapabilities({}, ["erpnext_doc_submit", "erpnext_doc_cancel"])
      .canSubmit,
    false,
  );
});
