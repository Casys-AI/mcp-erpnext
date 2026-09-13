import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import { BuyCaptureError } from "./errors.ts";
import {
  parseBuyCaptureInput,
  parseBuyCaptureWrapper,
  parseBuySourceCapture,
  runBuyCapture,
  sealBuySourceCapture,
} from "./capture.ts";
import { sha256Fingerprint } from "../shared/json.ts";
import { sourceInstanceFromClient } from "./site.ts";
import { SYNTHETIC_MODIFIED, syntheticCapture } from "./synthetic.ts";

const SITE_A = "https://erp.test.example/site-a";
const SITE_B = "https://erp.test.example/site-b";

function fastenerDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: "ITEM-PRICE-SYNTHETIC-001",
    doctype: "Item Price",
    modified: SYNTHETIC_MODIFIED,
    item_code: "ITEM-SYNTHETIC-FASTENER",
    item_name: "Synthetic fastener",
    price_list: "SYNTHETIC-BUYING",
    price_list_rate: "1.25",
    currency: "EUR",
    uom: "Nos",
    min_qty: "1",
    valid_from: "2026-01-01",
    valid_upto: "2026-12-31",
    buying: 1,
    selling: 0,
    email_id: "secret@example.com",
    ...overrides,
  };
}

function bomDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: "BOM-SYNTHETIC-001",
    doctype: "BOM",
    modified: SYNTHETIC_MODIFIED,
    docstatus: 1,
    status: "Submitted",
    item: "ITEM-SYNTHETIC-001",
    item_name: "Synthetic bracket",
    quantity: "1",
    uom: "Nos",
    is_active: 1,
    is_default: 1,
    currency: "EUR",
    items: [{
      name: "row-synthetic-bom-item-001",
      idx: 1,
      item_code: "ITEM-SYNTHETIC-FASTENER",
      item_name: "Synthetic fastener",
      qty: "4",
      uom: "Nos",
      rate: "1.25",
      amount: "5.00",
    }],
    ...overrides,
  };
}

interface FakeCalls {
  get: Array<{ doctype: string; name: string; skipCache?: boolean }>;
  create: number;
  update: number;
  callMethod: number;
}

function fakeClient(
  reads: Record<string, unknown[]>,
  siteUrl = SITE_A,
): { client: FrappeClient; calls: FakeCalls } {
  const calls: FakeCalls = { get: [], create: 0, update: 0, callMethod: 0 };
  const cursors = new Map<string, number>();
  const client = {
    normalizedSiteUrl: () => siteUrl,
    get: async (
      doctype: string,
      name: string,
      opts?: { skipCache?: boolean },
    ) => {
      calls.get.push({ doctype, name, skipCache: opts?.skipCache });
      const key = `${doctype}:${name}`;
      const series = reads[key];
      if (!series) {
        throw new FrappeAPIError(`not found ${key}`, 404, null);
      }
      const index = cursors.get(key) ?? 0;
      cursors.set(key, index + 1);
      const doc = series[Math.min(index, series.length - 1)];
      return doc;
    },
    create: async () => {
      calls.create += 1;
      throw new Error("create must not be called");
    },
    update: async () => {
      calls.update += 1;
      throw new Error("update must not be called");
    },
    callMethod: async () => {
      calls.callMethod += 1;
      throw new Error("callMethod must not be called");
    },
  } as unknown as FrappeClient;
  return { client, calls };
}

Deno.test("caller-supplied sourceInstance is rejected", () => {
  assertThrows(
    () =>
      parseBuyCaptureInput({
        documents: [{ doctype: "Item", name: "ITEM-SYNTHETIC-001" }],
        sourceInstance: {
          kind: "erpnext-site",
          siteId: "sha256:" + "a".repeat(64),
        },
      }),
    BuyCaptureError,
    "sourceInstance",
  );
});

Deno.test("unsupported doctype cannot masquerade as a price", () => {
  assertThrows(
    () =>
      parseBuyCaptureInput({
        documents: [{ doctype: "Purchase Invoice", name: "PINV-001" }],
      }),
    BuyCaptureError,
    "closed Buy capture DocType",
  );
});

Deno.test("empty capture list is refused", () => {
  assertThrows(
    () => parseBuyCaptureInput({ documents: [] }),
    BuyCaptureError,
    "must not be empty",
  );
});

Deno.test("capture derives sourceInstance from the actual client and uses skipCache", async () => {
  const { client, calls } = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [fastenerDoc(), fastenerDoc()],
  });
  const wrapper = await runBuyCapture({
    documents: [{ doctype: "Item Price", name: "ITEM-PRICE-SYNTHETIC-001" }],
  }, {
    client,
    now: () => new Date("2026-09-12T10:00:00.000Z"),
  });
  const expectedSite = await sourceInstanceFromClient(client);
  assertEquals(wrapper.capture.sourceInstance, expectedSite);
  assertEquals(wrapper.capture.capturedAt, "2026-09-12T10:00:00.000Z");
  assertEquals(wrapper.capture.documents[0].sourceCategory, "catalogue-price");
  assertEquals("email_id" in wrapper.capture.documents[0].fields, false);
  assertEquals(
    wrapper.fingerprint,
    await (await import("../shared/json.ts")).sha256FingerprintOfUtf8(
      wrapper.canonicalText,
    ),
  );
  assertEquals(
    wrapper.byteCount,
    new TextEncoder().encode(wrapper.canonicalText).byteLength,
  );
  assertEquals(calls.get.length, 2);
  assertEquals(calls.get.every((call) => call.skipCache === true), true);
  assertEquals(calls.create, 0);
  assertEquals(calls.update, 0);
  assertEquals(calls.callMethod, 0);
  await parseBuyCaptureWrapper(wrapper);
});

Deno.test("a different configured site yields a different sourceInstance", async () => {
  const a = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [fastenerDoc(), fastenerDoc()],
  }, SITE_A);
  const b = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [fastenerDoc(), fastenerDoc()],
  }, SITE_B);
  const wrapA = await runBuyCapture({
    documents: [{ doctype: "Item Price", name: "ITEM-PRICE-SYNTHETIC-001" }],
  }, { client: a.client, now: () => new Date("2026-09-12T10:00:00.000Z") });
  const wrapB = await runBuyCapture({
    documents: [{ doctype: "Item Price", name: "ITEM-PRICE-SYNTHETIC-001" }],
  }, { client: b.client, now: () => new Date("2026-09-12T10:00:00.000Z") });
  assertEquals(
    wrapA.capture.sourceInstance.siteId === wrapB.capture.sourceInstance.siteId,
    false,
  );
});

Deno.test("modified race between the two reads is retryable and returns no chiffrage", async () => {
  const { client, calls } = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [
      fastenerDoc(),
      fastenerDoc({ modified: "2026-09-01 09:00:00.000000" }),
    ],
  });
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{
          doctype: "Item Price",
          name: "ITEM-PRICE-SYNTHETIC-001",
        }],
      }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") }),
    BuyCaptureError,
    "changed between the two skipCache reads",
  );
  assertEquals(error.code, "BUY_CAPTURE_INCONSISTENT");
  assertEquals(error.retryable, true);
  assertEquals(calls.create, 0);
});

Deno.test("body race with the same modified is still inconsistent", async () => {
  const { client } = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [
      fastenerDoc({ price_list_rate: "1.25" }),
      fastenerDoc({ price_list_rate: "9.99" }),
    ],
  });
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{
          doctype: "Item Price",
          name: "ITEM-PRICE-SYNTHETIC-001",
        }],
      }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") }),
    BuyCaptureError,
    "changed between the two skipCache reads",
  );
  assertEquals(error.retryable, true);
});

Deno.test("missing source fails closed", async () => {
  const { client } = fakeClient({});
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{ doctype: "Item Price", name: "MISSING" }],
      }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") }),
    BuyCaptureError,
    "was not found",
  );
  assertEquals(error.code, "BUY_CAPTURE_MISSING_SOURCE");
  assertEquals(error.retryable, false);
});

Deno.test("expectedModified mismatch is not a usable capture", async () => {
  const { client } = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [fastenerDoc(), fastenerDoc()],
  });
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{
          doctype: "Item Price",
          name: "ITEM-PRICE-SYNTHETIC-001",
          expectedModified: "2026-01-01 00:00:00",
        }],
      }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") }),
    BuyCaptureError,
    "expectedModified",
  );
  assertEquals(error.code, "BUY_CAPTURE_EXPECTED_MODIFIED_MISMATCH");
});

Deno.test("child row identity is preserved on BOM items", async () => {
  const { client } = fakeClient({
    "BOM:BOM-SYNTHETIC-001": [bomDoc(), bomDoc()],
  });
  const wrapper = await runBuyCapture({
    documents: [{ doctype: "BOM", name: "BOM-SYNTHETIC-001" }],
  }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") });
  const row = wrapper.capture.documents[0].children?.[0].rows[0];
  assertEquals(row?.name, "row-synthetic-bom-item-001");
  assertEquals(row?.idx, 1);
  assertEquals(row?.fields.qty, "4");
  assertEquals(wrapper.capture.documents[0].sourceCategory, "bom");
});

Deno.test("BOM child row without a name fails closed", async () => {
  const { client } = fakeClient({
    "BOM:BOM-SYNTHETIC-001": [
      bomDoc({ items: [{ idx: 1, item_code: "X", qty: "1", uom: "Nos" }] }),
      bomDoc({ items: [{ idx: 1, item_code: "X", qty: "1", uom: "Nos" }] }),
    ],
  });
  await assertRejects(
    () =>
      runBuyCapture({
        documents: [{ doctype: "BOM", name: "BOM-SYNTHETIC-001" }],
      }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") }),
    BuyCaptureError,
    "non-empty unpadded string",
  );
});

Deno.test("document bound is fail-closed", () => {
  const documents = Array.from({ length: 33 }, (_, index) => ({
    doctype: "UOM",
    name: `UOM-${index}`,
  }));
  const error = assertThrows(
    () => parseBuyCaptureInput({ documents }),
    BuyCaptureError,
    "32-document bound",
  );
  assertEquals(error.code, "BUY_CAPTURE_BOUNDS_EXCEEDED");
});

Deno.test("synthetic capture round-trips through the sealed wrapper", async () => {
  const capture = await syntheticCapture();
  const wrapper = await sealBuySourceCapture(capture);
  const parsed = await parseBuyCaptureWrapper(wrapper);
  assertEquals(parsed.capture.documents.length, 4);
  assertEquals(
    parsed.capture.documents.map((doc) => doc.sourceCategory),
    ["item", "bom", "catalogue-price", "supplier-quotation"],
  );
});

Deno.test("returned name different from requested identity is refused", async () => {
  const { client } = fakeClient({
    "Item:REQUESTED": [
      {
        doctype: "Item",
        name: "DIFFERENT",
        item_code: "DIFFERENT",
        modified: "2026-09-12 12:00:00",
      },
      {
        doctype: "Item",
        name: "DIFFERENT",
        item_code: "DIFFERENT",
        modified: "2026-09-12 12:00:00",
      },
    ],
  });
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{ doctype: "Item", name: "REQUESTED" }],
      }, { client, now: () => new Date("2026-09-12T12:00:00.000Z") }),
    BuyCaptureError,
    "DIFFERENT",
  );
  assertEquals(error.code, "BUY_CAPTURE_IDENTITY_MISMATCH");
});

Deno.test("returned doctype different from requested identity is refused", async () => {
  const { client } = fakeClient({
    "Item:REQUESTED": [{
      doctype: "BOM",
      name: "REQUESTED",
      item_code: "REQUESTED",
      modified: "2026-09-12 12:00:00",
    }, {
      doctype: "BOM",
      name: "REQUESTED",
      item_code: "REQUESTED",
      modified: "2026-09-12 12:00:00",
    }],
  });
  const error = await assertRejects(
    () =>
      runBuyCapture({
        documents: [{ doctype: "Item", name: "REQUESTED" }],
      }, { client, now: () => new Date("2026-09-12T12:00:00.000Z") }),
    BuyCaptureError,
    "BOM",
  );
  assertEquals(error.code, "BUY_CAPTURE_IDENTITY_MISMATCH");
});

Deno.test("raw ERP owner metadata is omitted rather than rejecting the document", async () => {
  const { client } = fakeClient({
    "Item Price:ITEM-PRICE-SYNTHETIC-001": [
      fastenerDoc({ owner: "Administrator", _user_tags: "x" }),
      fastenerDoc({ owner: "Administrator", _user_tags: "x" }),
    ],
  });
  const wrapper = await runBuyCapture({
    documents: [{ doctype: "Item Price", name: "ITEM-PRICE-SYNTHETIC-001" }],
  }, { client, now: () => new Date("2026-09-12T10:00:00.000Z") });
  assertEquals(wrapper.capture.documents[0].name, "ITEM-PRICE-SYNTHETIC-001");
  assertEquals("owner" in wrapper.capture.documents[0].fields, false);
});

async function wireCapture(): Promise<Record<string, unknown>> {
  return structuredClone(await syntheticCapture()) as unknown as Record<
    string,
    unknown
  >;
}

async function rehashDocument(doc: Record<string, unknown>): Promise<void> {
  const { fingerprint: _, ...identity } = doc;
  doc.fingerprint = await sha256Fingerprint(identity, "probe");
}

Deno.test("constructed wire rejects an unknown nested commercial field", async () => {
  const capture = await wireCapture();
  const docs = capture.documents as Record<string, unknown>[];
  const fields = docs[0].fields as Record<string, unknown>;
  fields.arbitrary_unregistered_commercial_field = "synthetic";
  await rehashDocument(docs[0]);
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "closed commercial field",
  );
});

Deno.test("constructed wire rejects an unknown child table", async () => {
  const capture = await wireCapture();
  const docs = capture.documents as Record<string, unknown>[];
  const bom = docs.find((item) => item.doctype === "BOM")!;
  const children = bom.children as Array<Record<string, unknown>>;
  children.push({ table: "taxes", rows: [] });
  await rehashDocument(bom);
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "closed child table",
  );
});

Deno.test("constructed wire rejects a missing required field", async () => {
  const capture = await wireCapture();
  const item = (capture.documents as Record<string, unknown>[])[0];
  const fields = item.fields as Record<string, unknown>;
  delete fields.item_code;
  await rehashDocument(item);
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "item_code is required",
  );
});

Deno.test("constructed wire rejects a duplicate child row identity", async () => {
  const capture = await wireCapture();
  const bom = (capture.documents as Record<string, unknown>[]).find((
    item,
  ) => item.doctype === "BOM")!;
  const children = bom.children as Array<{ rows: unknown[] }>;
  const row = children[0].rows[0];
  children[0].rows = [row, { ...(row as object) }];
  await rehashDocument(bom);
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "duplicates child row",
  );
});

Deno.test("constructed wire rejects a duplicate document identity", async () => {
  const capture = await wireCapture();
  const docs = capture.documents as unknown[];
  capture.documents = [docs[0], docs[0]];
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "duplicates",
  );
});

Deno.test("closed wire refuses an empty capture before sealing", async () => {
  const capture = await wireCapture();
  capture.documents = [];
  await assertRejects(
    () => parseBuySourceCapture(capture),
    TypeError,
    "must not be empty",
  );
});

Deno.test("capture and closed wire refuse impossible dates and incomplete revision timestamps", async () => {
  for (
    const [field, value] of [
      ["valid_from", "2026-02-30"],
      ["valid_upto", "2026-13-01"],
      ["modified", "2026-09-12"],
      ["modified", "2026-02-30 12:00:00.123456"],
      ["modified", "2026-09-12 25:00:00"],
      ["modified", "2026-09-12 12:60:00"],
    ]
  ) {
    const { client } = fakeClient({
      "Item Price:ITEM-PRICE-SYNTHETIC-001": [fastenerDoc({ [field]: value })],
    });
    await assertRejects(
      () =>
        runBuyCapture({
          documents: [{
            doctype: "Item Price",
            name: "ITEM-PRICE-SYNTHETIC-001",
          }],
        }, { client }),
      BuyCaptureError,
      field,
    );
    const capture = await wireCapture();
    const item = (capture.documents as Record<string, unknown>[]).find((doc) =>
      doc.doctype === "Item Price"
    )!;
    if (field === "modified") item.modified = value;
    else (item.fields as Record<string, unknown>)[field] = value;
    await rehashDocument(item);
    await assertRejects(() => parseBuySourceCapture(capture), Error, field);
  }
});
