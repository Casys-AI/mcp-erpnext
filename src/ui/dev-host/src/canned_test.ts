import { assert, assertEquals } from "@std/assert";
import { documentEnvelopeOf } from "../../shared/document/model.ts";
import { jumpFromHint } from "../../shared/jumps.ts";
import {
  approximateBase64Bytes,
  cannedResult,
  DEV_DOCUMENT_DOCTYPE,
  DEV_DOCUMENT_NAME,
  DEV_INVOICE_DOCTYPE,
  DEV_INVOICE_NAME,
  INITIAL_TOOL,
  initialResult,
  isCannedDownloadToolResult,
  resetCannedState,
  summarizeDownloadContents,
  summarizeModelContextContents,
  toolArgumentsForLog,
  withDevViewerTools,
} from "./canned.ts";

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

const documentArgs = {
  attached_to_doctype: DEV_DOCUMENT_DOCTYPE,
  attached_to_name: DEV_DOCUMENT_NAME,
};

Deno.test("dev-host canned - keeps eight viewers and exposes exact generic document tools", () => {
  assertEquals(Object.keys(INITIAL_TOOL), [
    "invoice",
    "doclist",
    "doc",
    "kanban",
    "stock",
    "funnel",
    "kpi",
    "chart",
  ]);

  const payload = object(withDevViewerTools("doc", initialResult("doc")));
  const data = object(payload.data);
  assertEquals(data.doctype, "BOM");
  assertEquals(data.name, DEV_DOCUMENT_NAME);
  assertEquals((data.items as unknown[]).length, 3);
  assertEquals((data.operations as unknown[]).length, 2);
  assertEquals(payload.refreshRequest, {
    toolName: "erpnext_doc_get",
    arguments: { doctype: DEV_DOCUMENT_DOCTYPE, name: DEV_DOCUMENT_NAME },
  });
  assertEquals(payload._availableTools, [
    "erpnext_doc_cancel",
    "erpnext_doc_get",
    "erpnext_doc_submit",
    "erpnext_file_download",
    "erpnext_file_list",
    "erpnext_file_upload",
  ]);

  const invoice = object(
    withDevViewerTools("invoice", initialResult("invoice")),
  );
  assertEquals(object(invoice.data).name, DEV_INVOICE_NAME);
  assertEquals(
    (invoice._availableTools as string[]).slice(-3),
    ["erpnext_file_download", "erpnext_file_list", "erpnext_file_upload"],
  );
});

Deno.test("dev-host canned - doclist invoice child exposes typed navigation end to end", () => {
  const root = object(initialResult("doclist"));
  const firstRow = object((root.data as unknown[])[0]);
  const invoiceName = String(firstRow.name);
  const detail = object(withDevViewerTools(
    "doclist",
    cannedResult("doclist", "erpnext_sales_invoice_get", {
      name: invoiceName,
    }),
  ));
  const envelope = documentEnvelopeOf(detail);
  assert(envelope);
  assertEquals(envelope.doctype, DEV_INVOICE_DOCTYPE);
  assertEquals(envelope.name, invoiceName);
  assertEquals(envelope.refreshRequest, {
    toolName: "erpnext_sales_invoice_get",
    arguments: { name: invoiceName },
  });
  assertEquals(envelope.availableTools, [
    "erpnext_customer_get",
    "erpnext_doc_cancel",
    "erpnext_doc_list",
    "erpnext_doc_submit",
    "erpnext_item_get",
    "erpnext_sales_invoice_get",
    "erpnext_sales_invoice_submit",
    "erpnext_stock_balance",
  ]);

  const hints = envelope.sendMessageHints ?? [];
  assertEquals(hints.map((hint) => hint.key), [
    "payments",
    "customer",
    "item",
    "stock",
  ]);
  const paymentFields = hints[0].args?.fields;
  assert(
    Array.isArray(paymentFields) &&
      paymentFields.every((field) => typeof field === "string"),
  );
  const customerJump = jumpFromHint(hints[1], {
    id: envelope.name,
    name: envelope.name,
    doctype: envelope.doctype,
  });
  assert(customerJump);
  assertEquals(customerJump.tool, {
    name: "erpnext_customer_get",
    args: { name: "Acme Corp" },
  });
  const customer = object(cannedResult(
    "doclist",
    customerJump.tool.name,
    customerJump.tool.args,
  ));
  assertEquals(object(customer.data).doctype, "Customer");
  assertEquals(object(customer.data).name, "Acme Corp");

  const firstItem = object((envelope.document.items as unknown[])[0]);
  const itemCode = String(firstItem.item_code);
  assertEquals(itemCode, "ITEM-LAPTOP");
  const itemJump = jumpFromHint(hints[2], { item: itemCode });
  assert(itemJump);
  assertEquals(itemJump.tool, {
    name: "erpnext_item_get",
    args: { name: itemCode },
  });
  const item = object(cannedResult(
    "doclist",
    itemJump.tool.name,
    itemJump.tool.args,
  ));
  assertEquals(object(item.data).doctype, "Item");
  assertEquals(object(item.data).name, itemCode);

  const stockJump = jumpFromHint(hints[3], { item: itemCode });
  assert(stockJump);
  assertEquals(stockJump.tool, {
    name: "erpnext_stock_balance",
    args: { item_code: itemCode, limit: 50 },
  });
  const stock = object(cannedResult(
    "doclist",
    stockJump.tool.name,
    stockJump.tool.args,
  ));
  assertEquals(stock.doctype, "Bin");
  assertEquals(
    (stock.data as Array<Record<string, unknown>>).every((row) =>
      row.item_code === itemCode
    ),
    true,
  );
});

Deno.test("dev-host canned - file list is attached to the exact document", () => {
  resetCannedState();
  const result = object(cannedResult("doc", "erpnext_file_list", {
    ...documentArgs,
    limit: 50,
  }));
  assertEquals(result.count, 2);
  const files = result.data as Array<Record<string, unknown>>;
  assertEquals(files.map((file) => file.name), [
    "FILE-BOM-001",
    "FILE-BOM-002",
  ]);
  assertEquals(files[0].is_private, true);
  assertEquals(files[1].is_private, false);

  assertEquals(
    cannedResult("doc", "erpnext_file_list", {
      ...documentArgs,
      attached_to_name: "BOM-OTHER",
    }),
    null,
  );
  assertEquals(
    cannedResult("invoice", "erpnext_file_list", documentArgs),
    null,
  );

  const invoiceResult = object(cannedResult("invoice", "erpnext_file_list", {
    attached_to_doctype: DEV_INVOICE_DOCTYPE,
    attached_to_name: DEV_INVOICE_NAME,
    limit: 1,
  }));
  assertEquals(invoiceResult.count, 1);
});

Deno.test("dev-host canned - upload is relisted and can be downloaded", () => {
  resetCannedState();
  const blob = "SGVsbG8=";
  const upload = object(cannedResult("doc", "erpnext_file_upload", {
    ...documentArgs,
    file_name: "inspection note.txt",
    content_base64: blob,
    is_private: false,
  }));
  assertEquals(
    upload.message,
    `inspection note.txt attached to ${DEV_DOCUMENT_DOCTYPE} ${DEV_DOCUMENT_NAME}`,
  );

  const listed = object(cannedResult("doc", "erpnext_file_list", documentArgs));
  assertEquals(listed.count, 3);
  const first = (listed.data as Array<Record<string, unknown>>)[0];
  assertEquals(first, {
    name: "FILE-UPLOAD-001",
    file_name: "inspection note.txt",
    file_url: "/files/inspection note.txt",
    file_size: 5,
    is_private: false,
    attached_to_field: null,
    creation: "2026-08-24 17:00:01",
    modified: "2026-08-24 17:00:01",
    owner: "dev-host@casys.ai",
  });

  const download = cannedResult("doc", "erpnext_file_download", {
    ...documentArgs,
    file_id: "FILE-UPLOAD-001",
  });
  assert(isCannedDownloadToolResult(download));
  assertEquals(download.content, [
    {
      type: "text",
      text: "Prepared inspection note.txt for download (5 bytes).",
    },
    {
      type: "resource",
      resource: {
        uri: "file:///inspection%20note.txt",
        mimeType: "text/plain",
        blob,
      },
    },
  ]);
});

Deno.test("dev-host canned - download matches the single embedded-resource contract", () => {
  resetCannedState();
  const result = cannedResult("doc", "erpnext_file_download", {
    ...documentArgs,
    file_id: "FILE-BOM-001",
  });
  assert(isCannedDownloadToolResult(result));
  assertEquals(result.content.length, 2);
  const resource = result.content[1].resource;
  const pdf = atob(resource.blob);
  assertEquals(result.content[0].type, "text");
  assertEquals(resource.uri, "file:///control-cabinet-drawing.pdf");
  assertEquals(resource.mimeType, "application/pdf");
  assertEquals(pdf.startsWith("%PDF-1.4"), true);
  assertEquals(pdf.includes("/Count 3"), true);
  assertEquals(pdf.includes("/PageMode /UseThumbs"), true);
  assertEquals(pdf.endsWith("%%EOF\n"), true);

  const summary = summarizeDownloadContents([result.content[1]]);
  assertEquals(summary, [{
    name: "control-cabinet-drawing.pdf",
    mimeType: "application/pdf",
    approximateBytes: resource.blob.length / 4 * 3 -
      (resource.blob.endsWith("==") ? 2 : resource.blob.endsWith("=") ? 1 : 0),
  }]);
  assertEquals(JSON.stringify(summary).includes("JVBER"), false);
});

Deno.test("dev-host canned - download and upload fail closed on identity", () => {
  resetCannedState();
  assertEquals(
    cannedResult("doc", "erpnext_file_download", {
      ...documentArgs,
      file_id: "FILE-UNKNOWN",
    }),
    null,
  );
  assertEquals(
    cannedResult("doc", "erpnext_file_download", {
      ...documentArgs,
      attached_to_doctype: "Task",
      file_id: "FILE-BOM-001",
    }),
    null,
  );
  assertEquals(
    cannedResult("doc", "erpnext_file_upload", {
      ...documentArgs,
      file_name: "../escape.txt",
      content_base64: "eA==",
    }),
    null,
  );
});

Deno.test("dev-host canned - journal metadata omits uploaded and downloaded blobs", () => {
  assertEquals(approximateBase64Bytes("SGVsbG8="), 5);
  assertEquals(approximateBase64Bytes(" AP8=\n"), 2);
  const logged = toolArgumentsForLog({
    file_name: "hello.txt",
    content_base64: "SGVsbG8=",
  });
  assertEquals(logged, {
    file_name: "hello.txt",
    content_base64: "[base64 omitted; approximately 5 bytes]",
  });
  assertEquals(JSON.stringify(logged).includes("SGVsbG8="), false);

  const context = summarizeModelContextContents([{
    type: "resource",
    resource: {
      uri: "file:///hello.txt",
      mimeType: "text/plain",
      blob: "SGVsbG8=",
    },
  }]);
  assertEquals(context, [{
    type: "resource",
    resource: {
      uri: "file:///hello.txt",
      mimeType: "text/plain",
      approximateBytes: 5,
    },
  }]);
  assertEquals(JSON.stringify(context).includes("SGVsbG8="), false);
});
