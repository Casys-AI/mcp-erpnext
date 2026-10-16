import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { FrappeAPIError, FrappeClient } from "../api/frappe-client.ts";
import { deliveryTools } from "./delivery.ts";
import { inventoryTools } from "./inventory.ts";
import { manufacturingTools } from "./manufacturing.ts";
import { operationsTools } from "./operations.ts";
import { purchasingTools } from "./purchasing.ts";
import { salesTools } from "./sales.ts";

const tools = [
  ...deliveryTools,
  ...inventoryTools,
  ...manufacturingTools,
  ...operationsTools,
  ...purchasingTools,
  ...salesTools,
];

function tool(name: string) {
  const result = tools.find((candidate) => candidate.name === name);
  assert(result, `Missing tool ${name}`);
  return result;
}

interface CreationCase {
  name: string;
  doctype: string;
  input: Record<string, unknown>;
  resolution?: [string, string];
  refreshTool?: string;
}

const lineItems = [{ item_code: "ITEM-DIAGNOSTIC", qty: 1, rate: 10 }];
const cases: CreationCase[] = [
  {
    name: "erpnext_item_create",
    doctype: "Item",
    input: { item_code: "ITEM-DIAGNOSTIC", item_name: "Item", uom: "Nos" },
  },
  {
    name: "erpnext_stock_entry_create",
    doctype: "Stock Entry",
    input: { stock_entry_type: "Material Receipt", items: lineItems },
  },
  {
    name: "erpnext_sales_order_create",
    doctype: "Sales Order",
    input: { customer: "CUSTOMER-DIAGNOSTIC", items: lineItems },
    refreshTool: "erpnext_sales_order_get",
  },
  {
    name: "erpnext_sales_invoice_create",
    doctype: "Sales Invoice",
    input: { customer: "CUSTOMER-DIAGNOSTIC", items: lineItems },
    refreshTool: "erpnext_sales_invoice_get",
  },
  {
    name: "erpnext_quotation_create",
    doctype: "Quotation",
    input: {
      quotation_to: "Customer",
      party_name: "CUSTOMER-DIAGNOSTIC",
      items: lineItems,
    },
    resolution: ["Customer", "CUSTOMER-DIAGNOSTIC"],
    refreshTool: "erpnext_quotation_get",
  },
  {
    name: "erpnext_purchase_order_create",
    doctype: "Purchase Order",
    input: { supplier: "SUPPLIER-DIAGNOSTIC", items: lineItems },
    resolution: ["Supplier", "SUPPLIER-DIAGNOSTIC"],
  },
  {
    name: "erpnext_delivery_note_create",
    doctype: "Delivery Note",
    input: { customer: "CUSTOMER-DIAGNOSTIC", items: lineItems },
  },
  {
    name: "erpnext_work_order_create",
    doctype: "Work Order",
    input: { production_item: "ITEM-DIAGNOSTIC", bom_no: "BOM-001", qty: 1 },
  },
  {
    name: "erpnext_doc_create",
    doctype: "Item",
    input: { doctype: "Item", data: { item_code: "ITEM-DIAGNOSTIC" } },
  },
];

function mockCreation(
  specimen: CreationCase,
  createError?: FrappeAPIError,
  resolutionError?: FrappeAPIError,
) {
  const calls: string[] = [];
  const document = {
    name: "CREATED-001",
    doctype: specimen.doctype,
    docstatus: 0,
  };
  const client = {
    get: async (doctype: string, name: string) => {
      calls.push("get");
      assertEquals([doctype, name], specimen.resolution);
      if (resolutionError) throw resolutionError;
      return { name };
    },
    create: async (doctype: string) => {
      calls.push("create");
      assertEquals(doctype, specimen.doctype);
      if (createError) throw createError;
      return document;
    },
    list: () => {
      throw new Error("Unexpected diagnostic list");
    },
    update: () => {
      throw new Error("Unexpected diagnostic update");
    },
    callMethod: () => {
      throw new Error("Unexpected diagnostic method call");
    },
  } as unknown as FrappeClient;
  return { client, calls, document };
}

for (const specimen of cases) {
  Deno.test(`${specimen.name} diagnostics - successful creation keeps its normal response and requests`, async () => {
    const { client, calls, document } = mockCreation(specimen);
    const result = await tool(specimen.name).handler(specimen.input, {
      client,
    }) as Record<string, unknown>;
    assertEquals(result.data, document);
    assertEquals(
      result.message,
      `${specimen.doctype} CREATED-001 created successfully`,
    );
    assertEquals(
      result.refreshRequest,
      specimen.refreshTool
        ? { toolName: specimen.refreshTool, arguments: { name: "CREATED-001" } }
        : undefined,
    );
    assertEquals(calls, specimen.resolution ? ["get", "create"] : ["create"]);
  });

  Deno.test(`${specimen.name} diagnostics - a failed create keeps the native error without extra requests`, async () => {
    const body = { exc_type: "LinkValidationError", message: "Invalid link" };
    const error = new FrappeAPIError("Native creation failure", 417, body, 700);
    const original = error.message;
    const { client, calls } = mockCreation(specimen, error);
    const caught = await assertRejects(
      () => tool(specimen.name).handler(specimen.input, { client }),
      FrappeAPIError,
    );
    assertStrictEquals(caught, error);
    assertStrictEquals(error.body, body);
    assertEquals(error.status, 417);
    assertEquals(error.retryAfterMs, 700);
    assert(error.message.startsWith(original));
    assert(error.message.includes("\nRecovery:"));
    assertEquals(calls, specimen.resolution ? ["get", "create"] : ["create"]);
  });

  Deno.test(`${specimen.name} diagnostics - local validation still fails before any request`, async () => {
    const { client, calls } = mockCreation(specimen);
    const error = await assertRejects(
      () => tool(specimen.name).handler({}, { client }),
      Error,
      `[${specimen.name}]`,
    );
    assert(!error.message.includes("Recovery:"));
    assertEquals(calls, []);
  });
}

for (const specimen of cases.filter((candidate) => candidate.resolution)) {
  Deno.test(`${specimen.name} diagnostics - resolution errors are not treated as creation failures`, async () => {
    const error = new FrappeAPIError("Native resolution failure", 417, {
      exc_type: "LinkValidationError",
    });
    const original = error.message;
    const { client, calls } = mockCreation(specimen, undefined, error);
    const caught = await assertRejects(
      () => tool(specimen.name).handler(specimen.input, { client }),
      FrappeAPIError,
    );
    assertStrictEquals(caught, error);
    assertEquals(error.message, original);
    assertEquals(calls, ["get"]);
  });
}

for (
  const [nativeMessage, hint] of [
    [
      "Party Account <strong></strong> currency (None) and document currency (EUR) should be same",
      "Set data.credit_to",
    ],
    [
      "Please set default Stock Received But Not Billed in Company",
      "Company.stock_received_but_not_billed",
    ],
  ]
) {
  Deno.test(`erpnext_doc_create diagnostics - Purchase Invoice retains ${hint} guidance`, async () => {
    const specimen: CreationCase = {
      name: "erpnext_doc_create",
      doctype: "Purchase Invoice",
      input: {
        doctype: "Purchase Invoice",
        data: { supplier: "SUPPLIER-001" },
      },
    };
    const body = { exc_type: "ValidationError", message: nativeMessage };
    const error = new FrappeAPIError(nativeMessage, 417, body);
    const original = error.message;
    const { client, calls } = mockCreation(specimen, error);
    const caught = await assertRejects(
      () => tool(specimen.name).handler(specimen.input, { client }),
      FrappeAPIError,
    );
    assertStrictEquals(caught, error);
    assertStrictEquals(error.body, body);
    assert(error.message.startsWith(original));
    assert(error.message.includes(hint));
    assertEquals(calls, ["create"]);
  });
}

Deno.test("creation diagnostics - real HTTP parsing preserves double-encoded native messages in one POST", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method?: string; body: unknown }> = [];
  const nativeMessage = "Could not find Default Unit of Measure: Missing UOM";
  const body = {
    exc_type: "LinkValidationError",
    _server_messages: JSON.stringify([
      JSON.stringify({ message: nativeMessage, raise_exception: 1 }),
    ]),
  };
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(body), {
      status: 417,
      headers: { "Content-Type": "application/json", "Retry-After": "2" },
    });
  };
  try {
    const client = new FrappeClient({
      baseUrl: "https://erpnext.test",
      apiKey: "test-key",
      apiSecret: "test-secret",
    });
    const error = await assertRejects(
      () =>
        tool("erpnext_item_create").handler({
          item_code: "ITEM-001",
          item_name: "Item",
          uom: "Missing UOM",
        }, { client }),
      FrappeAPIError,
    );
    assertEquals(requests, [{
      url: "https://erpnext.test/api/resource/Item",
      method: "POST",
      body: {
        data: {
          doctype: "Item",
          item_code: "ITEM-001",
          item_name: "Item",
          stock_uom: "Missing UOM",
        },
      },
    }]);
    assertEquals(error.status, 417);
    assertEquals(error.body, body);
    assertEquals(error.retryAfterMs, 2000);
    assert(error.message.startsWith(
      `[FrappeClient] POST /api/resource/Item failed: LinkValidationError: ${nativeMessage} (HTTP 417)`,
    ));
    assert(error.message.includes("\nRecovery:"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
