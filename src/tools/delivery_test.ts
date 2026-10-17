import { assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { FrappeDoc, FrappeListOptions } from "../api/types.ts";
import { deliveryTools } from "./delivery.ts";

const shipmentList = deliveryTools.find((tool) =>
  tool.name === "erpnext_shipment_list"
)!;

function mockList(
  list: (doctype: string, options: FrappeListOptions) => Promise<FrappeDoc[]>,
): FrappeClient {
  return { list } as unknown as FrappeClient;
}

Deno.test("erpnext_shipment_list - queries supported fields and pickup date bounds", async () => {
  const doc = {
    name: "SHIPMENT-001",
    status: "Completed",
    pickup_date: "2026-09-05",
    carrier: "Carrier",
    shipment_amount: 0,
  };
  const client = mockList(async (doctype, options) => {
    assertEquals(doctype, "Shipment");
    // These fields exist in ERPNext v15 and v16; delivery_date does not.
    assertEquals(options.fields, [
      "name",
      "status",
      "pickup_date",
      "carrier",
      "shipment_amount",
    ]);
    assertEquals(options.filters, [
      ["status", "=", "Completed"],
      ["carrier", "=", "Carrier"],
      ["pickup_date", ">=", "2026-09-01"],
      ["pickup_date", "<=", "2026-09-30"],
    ]);
    assertEquals(options.limit, 5);
    return [doc];
  });

  const result = await shipmentList.handler({
    status: "Completed",
    carrier: "Carrier",
    date_from: "2026-09-01",
    date_to: "2026-09-30",
    limit: 5,
  }, { client }) as { doctype: string; count: number; data: unknown[] };

  assertEquals(result.doctype, "Shipment");
  assertEquals(result.count, 1);
  assertEquals(result.data, [doc]);
});

Deno.test("erpnext_shipment_list - propagates list failures", async () => {
  const failure = new FrappeAPIError("Permission denied", 403, null);
  const client = mockList(async () => {
    throw failure;
  });
  assertEquals(
    await assertRejects(() => shipmentList.handler({}, { client })),
    failure,
  );
});
