import { assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import { buyTools } from "./buy.ts";
import { getToolByName } from "./mod.ts";
import { BuyCaptureError } from "../buy/errors.ts";
import { SYNTHETIC_MODIFIED } from "../buy/synthetic.ts";

function getTool(name: string) {
  const tool = buyTools.find((item) => item.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function priceDoc() {
  return {
    name: "ITEM-PRICE-SYNTHETIC-001",
    modified: SYNTHETIC_MODIFIED,
    item_code: "ITEM-SYNTHETIC-FASTENER",
    price_list_rate: "1.25",
    currency: "EUR",
    uom: "Nos",
    buying: 1,
    selling: 0,
  };
}

Deno.test("erpnext_buy_capture is registered read-only without a live viewer binding", () => {
  const tool = getToolByName("erpnext_buy_capture");
  assertEquals(tool?.annotations?.readOnlyHint, true);
  assertEquals(tool?._meta, undefined);
  assertEquals(tool?.category, "buy");
  assertEquals(getTool("erpnext_buy_capture").name, "erpnext_buy_capture");
});

Deno.test("erpnext_buy_capture handler uses the injected client and never mutates", async () => {
  const calls = {
    get: 0,
    create: 0,
    update: 0,
    callMethod: 0,
    skipCache: [] as boolean[],
  };
  const client = {
    normalizedSiteUrl: () => "https://erp.test.example/site-a",
    get: async (
      _doctype: string,
      _name: string,
      opts?: { skipCache?: boolean },
    ) => {
      calls.get += 1;
      calls.skipCache.push(opts?.skipCache === true);
      return priceDoc();
    },
    create: async () => {
      calls.create += 1;
      throw new Error("create");
    },
    update: async () => {
      calls.update += 1;
      throw new Error("update");
    },
    callMethod: async () => {
      calls.callMethod += 1;
      throw new Error("callMethod");
    },
  } as unknown as FrappeClient;
  const result = await getTool("erpnext_buy_capture").handler({
    documents: [{ doctype: "Item Price", name: "ITEM-PRICE-SYNTHETIC-001" }],
  }, { client }) as {
    fingerprint: string;
    canonicalText: string;
    capture: { sourceInstance: { siteId: string } };
  };
  assertEquals(result.fingerprint.startsWith("sha256:"), true);
  assertEquals(result.canonicalText.includes("sourceInstance"), true);
  assertEquals(result.canonicalText.includes("canonicalText"), false);
  assertEquals(calls.get, 2);
  assertEquals(calls.skipCache, [true, true]);
  assertEquals(calls.create, 0);
  assertEquals(calls.update, 0);
  assertEquals(calls.callMethod, 0);
});

Deno.test("erpnext_buy_capture fails closed on a missing document", async () => {
  const client = {
    normalizedSiteUrl: () => "https://erp.test.example/site-a",
    get: async () => {
      throw new FrappeAPIError("missing", 404, null);
    },
    create: async () => {
      throw new Error("create");
    },
    update: async () => {
      throw new Error("update");
    },
    callMethod: async () => {
      throw new Error("callMethod");
    },
  } as unknown as FrappeClient;
  await assertRejects(
    () =>
      getTool("erpnext_buy_capture").handler({
        documents: [{ doctype: "Item", name: "MISSING" }],
      }, { client }),
    BuyCaptureError,
    "was not found",
  );
});
