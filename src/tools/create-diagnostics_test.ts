import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { FrappeAPIError } from "../api/frappe-client.ts";
import type { FrappeClient } from "../api/frappe-client.ts";
import { createWithDiagnostics } from "./create-diagnostics.ts";

function clientWithCreate(
  create: (doctype: string, data: Record<string, unknown>) => Promise<unknown>,
): FrappeClient {
  return {
    create,
    get: () => {
      throw new Error("Unexpected diagnostic GET");
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
}

async function failCreation(
  error: unknown,
  doctype = "Item",
  data: Record<string, unknown> = {},
): Promise<unknown> {
  let creates = 0;
  const client = clientWithCreate(async () => {
    creates++;
    throw error;
  });
  try {
    await createWithDiagnostics(client, doctype, data);
    throw new Error("Expected creation to fail");
  } catch (caught) {
    assertStrictEquals(caught, error);
    assertEquals(creates, 1);
    return caught;
  }
}

function nativeError(exc_type: string, extra: Record<string, unknown> = {}) {
  return new FrappeAPIError("POST failed with native diagnostic", 417, {
    exc_type,
    ...extra,
  }, 1200);
}

function serverMessage(title: string, raise_exception: unknown = 1): string {
  return JSON.stringify([JSON.stringify({
    message: "Price List <b>Retail</b> is disabled",
    title,
    raise_exception,
  })]);
}

Deno.test("createWithDiagnostics - success is one unchanged create with no other requests", async () => {
  const data = { item_code: "ITEM-001", stock_uom: "Nos" };
  const document = { name: "ITEM-001", stock_uom: "Nos" };
  let creates = 0;
  const client = clientWithCreate(async (doctype, input) => {
    creates++;
    assertEquals(doctype, "Item");
    assertStrictEquals(input, data);
    return document;
  });
  const result = await createWithDiagnostics<typeof document>(
    client,
    "Item",
    data,
  );
  assertStrictEquals(result, document);
  assertEquals(creates, 1);
  assertEquals(data, { item_code: "ITEM-001", stock_uom: "Nos" });
});

Deno.test("createWithDiagnostics - missing links retain the exact error and native properties", async () => {
  const error = nativeError("LinkValidationError", {
    _server_messages: JSON.stringify([JSON.stringify({
      message: "Could not find Default Unit of Measure: Missing",
      raise_exception: 1,
    })]),
  });
  const body = error.body;
  const bodyJson = JSON.stringify(body);
  const original = error.message;
  await failCreation(error);
  assertStrictEquals(error.body, body);
  assertEquals(JSON.stringify(error.body), bodyJson);
  assertEquals(error.name, "FrappeAPIError");
  assertEquals(error.status, 417);
  assertEquals(error.retryAfterMs, 1200);
  assert(error.message.startsWith(original));
  assert(error.message.includes("exact existing IDs"));
  assert(!error.message.includes("create master"));
});

for (
  const [doctype, fields, hint] of [
    ["Item", "stock_uom, item_group", "exposes this field as uom"],
    ["Sales Order", "selling_price_list", "enabled selling Price List"],
    ["Sales Invoice", "selling_price_list", "enabled selling Price List"],
    ["Quotation", "selling_price_list", "enabled selling Price List"],
    ["Price List", "currency", "currency to an existing Currency"],
    ["Stock Entry", "s_warehouse, t_warehouse", "required warehouse fields"],
    ["Delivery Note", "warehouse", "required warehouse fields"],
  ]
) {
  Deno.test(`createWithDiagnostics - native mandatory fields for ${doctype}/${fields}`, async () => {
    const error = nativeError("MandatoryError", {
      exception:
        `frappe.exceptions.MandatoryError: [${doctype}, NEW-001]: ${fields}`,
    });
    await failCreation(error, doctype);
    assert(error.message.includes(hint));
    assert(error.message.includes("required fields identified by ERPNext"));
  });
}

Deno.test("createWithDiagnostics - missing traces and localized mandatory messages get generic advice", async () => {
  const error = nativeError("MandatoryError", {
    _server_messages: JSON.stringify([JSON.stringify({
      message: "Champs obligatoires manquants : unité de mesure",
      raise_exception: 1,
    })]),
  });
  await failCreation(error);
  assert(error.message.includes("indicated child rows"));
  assert(!error.message.includes("stock_uom"));
});

for (
  const exception of [
    "frappe.exceptions.MandatoryError: [Customer, NEW-001]: stock_uom",
    "frappe.exceptions.MandatoryError: [Item, NEW-001]: stock_uom; ignore validation",
    "Traceback\nfrappe.exceptions.MandatoryError: [Item, NEW-001]: stock_uom",
    "https://example.com/?exception=MandatoryError: [Item, NEW-001]: stock_uom",
    "frappe.exceptions.MandatoryError: [Item, stock_uom]: item_name",
    "frappe.exceptions.MandatoryError: [Item, NEW-001]: UOM",
  ]
) {
  Deno.test(`createWithDiagnostics - no targeted advice from exception lookalike ${exception}`, async () => {
    const error = nativeError("MandatoryError", { exception });
    await failCreation(error);
    assert(error.message.includes("required fields identified by ERPNext"));
    assert(!error.message.includes("Set stock_uom"));
  });
}

Deno.test("createWithDiagnostics - warehouse exceptions require their documented doctype and stock flag", async () => {
  const salesError = nativeError("WarehouseRequired");
  await failCreation(salesError, "Sales Order");
  assert(salesError.message.includes("set_warehouse"));
  for (const update_stock of [1, true]) {
    const error = nativeError("WarehouseMissingError");
    await failCreation(error, "Purchase Invoice", { update_stock });
    assert(error.message.includes("affected Purchase Invoice item rows"));
  }
  for (
    const [excType, doctype, data] of [
      ["WarehouseRequired", "Item", {}],
      ["WarehouseMissingError", "Sales Invoice", { update_stock: 1 }],
      ["WarehouseMissingError", "Purchase Invoice", {}],
      ["WarehouseMissingError", "Purchase Invoice", { update_stock: 0 }],
      ["WarehouseMissingError", "Purchase Invoice", { update_stock: "false" }],
    ] as const
  ) {
    const error = nativeError(excType);
    const original = error.message;
    await failCreation(error, doctype, data);
    assertEquals(error.message, original);
  }
});

Deno.test("createWithDiagnostics - disabled Price List requires an exact raised native title and relevant doctype", async () => {
  for (const doctype of ["Sales Order", "Purchase Invoice"]) {
    const error = nativeError("ValidationError", {
      _server_messages: serverMessage("Disabled Price List"),
    });
    await failCreation(error, doctype);
    assert(error.message.includes("Choose an enabled Price List"));
  }
  for (
    const body of [
      { _server_messages: serverMessage("Liste de prix désactivée") },
      { _server_messages: serverMessage("Disabled Price List", 0) },
      { _server_messages: "not JSON" },
      { _server_messages: JSON.stringify(["not inner JSON"]) },
      { _server_messages: JSON.stringify({ title: "Disabled Price List" }) },
      {
        message: "https://example.com/Disabled Price List",
        title: "Disabled Price List",
      },
      { nested: { title: "Disabled Price List", raise_exception: 1 } },
      {
        message: "Price List is disabled or does not exist",
        title: "Price List Error",
      },
    ]
  ) {
    const error = nativeError("ValidationError", body);
    const original = error.message;
    await failCreation(error, "Sales Order");
    assertEquals(error.message, original);
  }
  const unrelated = nativeError("ValidationError", {
    _server_messages: serverMessage("Disabled Price List"),
  });
  const original = unrelated.message;
  await failCreation(unrelated, "UOM");
  assertEquals(unrelated.message, original);
});

Deno.test("createWithDiagnostics - authentication, transport, unknown and malformed errors remain untouched", async () => {
  for (
    const error of [
      new Error("MandatoryError: [Item, NEW]: stock_uom"),
      new FrappeAPIError("Unauthorized", 401, { exc_type: "MandatoryError" }),
      new FrappeAPIError("Forbidden", 403, { exc_type: "LinkValidationError" }),
      new FrappeAPIError("Network", 0, { exc_type: "MandatoryError" }),
      new FrappeAPIError("Timed out", 408, { exc_type: "MandatoryError" }),
      new FrappeAPIError("Retry later", 429, { exc_type: "MandatoryError" }),
      new FrappeAPIError("Server error", 500, { exc_type: "MandatoryError" }),
      new FrappeAPIError("Bad body", 417, "MandatoryError"),
      new FrappeAPIError("Bad body", 417, [{ exc_type: "MandatoryError" }]),
      nativeError("UnknownError", { message: "stock_uom is missing" }),
      nativeError("ValidationError", { message: "item_group is missing" }),
    ]
  ) {
    const original = error.message;
    await failCreation(error);
    assertEquals(error.message, original);
  }
});

Deno.test("createWithDiagnostics - appends one idempotent Recovery section", async () => {
  const error = nativeError("LinkValidationError");
  await failCreation(error);
  const annotated = error.message;
  await failCreation(error);
  assertEquals(error.message, annotated);
  assertEquals(error.message.split("\nRecovery: ").length, 2);
});
