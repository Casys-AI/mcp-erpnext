import { assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { FrappeDoc, FrappeListOptions } from "../api/types.ts";
import { assetsTools } from "./assets.ts";

const assetList = assetsTools.find((tool) =>
  tool.name === "erpnext_asset_list"
)!;

function mockList(
  list: (doctype: string, options: FrappeListOptions) => Promise<FrappeDoc[]>,
): FrappeClient {
  return { list } as unknown as FrappeClient;
}

for (const purchaseField of ["gross_purchase_amount", "net_purchase_amount"]) {
  Deno.test(`erpnext_asset_list - projects ${purchaseField} with compatible aliases`, async () => {
    const doc = {
      name: "ASSET-001",
      asset_name: "Equipment",
      asset_category: "Machinery",
      status: "Partially Depreciated",
      purchase_date: "2026-09-01",
      [purchaseField]: 1234.5678,
      value_after_depreciation: 987.6543,
      location: "Factory",
      custodian: null,
      purchase_amount: 0,
      owner: "private-owner@example.invalid",
      custom_private_note: "Do not expose in a list",
    };
    const client = mockList(async (doctype, options) => {
      assertEquals(doctype, "Asset");
      assertEquals(options.fields, ["*"]);
      assertEquals(options.filters, [
        ["status", "=", "Partially Depreciated"],
        ["purchase_date", ">=", "2026-09-01"],
        ["purchase_date", "<=", "2026-09-30"],
      ]);
      assertEquals(options.limit, 5);
      return [doc];
    });

    const result = await assetList.handler({
      status: "Partially Depreciated",
      date_from: "2026-09-01",
      date_to: "2026-09-30",
      limit: 5,
    }, { client }) as { doctype: string; count: number; data: unknown[] };

    assertEquals(result.doctype, "Asset");
    assertEquals(result.count, 1);
    assertEquals(result.data, [{
      name: "ASSET-001",
      asset_name: "Equipment",
      asset_category: "Machinery",
      status: "Partially Depreciated",
      purchase_date: "2026-09-01",
      gross_purchase_amount: 1234.5678,
      net_purchase_amount: 1234.5678,
      current_value: 987.6543,
      value_after_depreciation: 987.6543,
      location: "Factory",
      custodian: null,
    }]);
  });
}

Deno.test("erpnext_asset_list - preserves zero and null canonical amounts", async () => {
  const client = mockList(async () => [
    {
      name: "ZERO",
      net_purchase_amount: 0,
      gross_purchase_amount: 100,
      value_after_depreciation: 0,
    },
    {
      name: "NULL",
      net_purchase_amount: null,
      gross_purchase_amount: 100,
      value_after_depreciation: null,
    },
  ]);
  const result = await assetList.handler({}, { client }) as {
    data: Record<string, unknown>[];
  };
  assertEquals(
    result.data.map((doc) => [
      doc.gross_purchase_amount,
      doc.net_purchase_amount,
      doc.current_value,
      doc.value_after_depreciation,
    ]),
    [[0, 0, 0, 0], [null, null, null, null]],
  );
});

Deno.test("erpnext_asset_list - rejects an unsupported amount schema", async () => {
  const client = mockList(
    async () => [{ name: "UNKNOWN", purchase_amount: 0 }],
  );
  await assertRejects(
    () => assetList.handler({}, { client }),
    Error,
    "no supported net purchase amount field",
  );
});

Deno.test("erpnext_asset_list - propagates list failures", async () => {
  const failure = new FrappeAPIError("Permission denied", 403, null);
  const client = mockList(async () => {
    throw failure;
  });
  assertEquals(
    await assertRejects(() => assetList.handler({}, { client })),
    failure,
  );
});

const assetCreate = assetsTools.find((tool) =>
  tool.name === "erpnext_asset_create"
)!;

for (const purchaseField of ["gross_purchase_amount", "net_purchase_amount"]) {
  Deno.test(`erpnext_asset_create - preserves the net purchase amount in ${purchaseField}`, async () => {
    const client = {
      create: async (doctype: string, data: Record<string, unknown>) => {
        assertEquals(doctype, "Asset");
        assertEquals(data.gross_purchase_amount, 1234.5678);
        assertEquals(data.net_purchase_amount, 1234.5678);
        assertEquals(data.item_code, "FIXED-ASSET-ITEM");
        assertEquals(data.location, "Factory");
        return { name: "ASSET-NEW", [purchaseField]: data[purchaseField] };
      },
    } as unknown as FrappeClient;

    const result = await assetCreate.handler({
      asset_name: "Equipment",
      asset_category: "Machinery",
      company: "Company",
      purchase_date: "2026-09-01",
      gross_purchase_amount: 1234.5678,
      item_code: "FIXED-ASSET-ITEM",
      location: "Factory",
    }, { client }) as { data: Record<string, unknown> };

    assertEquals(result.data[purchaseField], 1234.5678);
  });
}

Deno.test("erpnext_asset_create - rejects a missing purchase amount", async () => {
  const client = {} as FrappeClient;
  await assertRejects(
    () =>
      assetCreate.handler({
        asset_name: "Equipment",
        asset_category: "Machinery",
        company: "Company",
        purchase_date: "2026-09-01",
      }, { client }),
    Error,
    "gross_purchase_amount",
  );
});

Deno.test("erpnext_asset_create - propagates creation failures", async () => {
  const failure = new FrappeAPIError("Purchase receipt is required", 417, null);
  const client = {
    create: async () => {
      throw failure;
    },
  } as unknown as FrappeClient;
  assertEquals(
    await assertRejects(() =>
      assetCreate.handler({
        asset_name: "Equipment",
        asset_category: "Machinery",
        company: "Company",
        purchase_date: "2026-09-01",
        gross_purchase_amount: 100,
      }, { client })
    ),
    failure,
  );
});
