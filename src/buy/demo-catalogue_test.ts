import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  DEMO_CATALOGUE_PLAN_SCHEMA,
  DEMO_CATALOGUE_SCHEMA,
  DemoCatalogueError,
  isDemoCatalogueError,
  parseDemoCatalogueCliArgs,
  planDemoCatalogue,
  planDemoCatalogueFromJson,
} from "./demo-catalogue.ts";
import { SYNTHETIC_TEST_NOTICE } from "./identities.ts";

const SYNTHETIC_SOURCE_HASH = `sha256:${"e".repeat(64)}`;

function syntheticPreparation(priced: boolean) {
  return {
    schema: DEMO_CATALOGUE_SCHEMA,
    scenario: "DEMO-ID01 synthetic planner check — not a real catalogue",
    priceList: { name: "DEMO-ID01-BUYING", currency: "EUR" },
    sources: [
      {
        id: "src-synthetic-001",
        path: "synthetic planner fixture — no real manifest",
        url: "https://example.invalid/synthetic",
        retrievedAt: "2026-09-13T08:00:00.000Z",
        sha256: SYNTHETIC_SOURCE_HASH,
      },
    ],
    lines: [
      {
        itemCode: "DEMO-ID01-SYNTHETIC-001",
        itemName: "Synthetic demo fastener",
        itemGroup: "Hardware",
        stockUom: "Nos",
        sourceRef: "src-synthetic-001",
        sourceMapping: "candidate",
        observation: {
          amount: priced ? "12.50" : null,
          currency: "EUR",
          uom: "Nos",
          pack: "1 pc",
          taxShipping: "unknown",
        },
        note: SYNTHETIC_TEST_NOTICE,
      },
    ],
  };
}

Deno.test("demo catalogue plans priced line as Price List, Item, Item Price", () => {
  const plan = planDemoCatalogue(syntheticPreparation(true));
  assertEquals(plan.schema, DEMO_CATALOGUE_PLAN_SCHEMA);
  assertEquals(plan.demo, true);
  assertEquals(plan.stage, "preparatory");
  assertEquals(plan.grants, "none");
  assertEquals(plan.calls.length, 3);
  assertEquals(plan.calls[0].tool, "erpnext_doc_create");
  assertEquals(
    (plan.calls[0].input.data as Record<string, unknown>).price_list_name,
    "DEMO-ID01-BUYING",
  );
  assertEquals(plan.calls[1].tool, "erpnext_item_create");
  assertEquals(plan.calls[2].tool, "erpnext_doc_create");
  const priceData = plan.calls[2].input.data as Record<string, unknown>;
  assertEquals(priceData.item_code, "DEMO-ID01-SYNTHETIC-001");
  assertEquals(priceData.price_list_rate, "12.50");
  assertEquals(priceData.buying, 1);
  assertEquals(priceData.selling, 0);
  assertEquals("valid_upto" in priceData, false);
  assertEquals("valid_from" in priceData, false);
  assertEquals("supplier" in priceData, false);
  assertEquals("min_qty" in priceData, false);
  assertEquals(plan.prerequisites.uoms, ["Nos"]);
  assertEquals(plan.prerequisites.itemGroups, ["Hardware"]);
  assertEquals(plan.sources.length, 1);
  assertEquals(plan.sources[0].id, "src-synthetic-001");
  assertEquals(plan.sources[0].url, "https://example.invalid/synthetic");
  assertEquals(plan.sources[0].retrievedAt, "2026-09-13T08:00:00.000Z");
  assertEquals(plan.sources[0].sha256, SYNTHETIC_SOURCE_HASH);
  assertEquals(plan.observations[0].note, SYNTHETIC_TEST_NOTICE);
  const text = JSON.stringify(plan);
  for (
    const forbidden of [
      "Supplier Quotation",
      "modified",
      "siteId",
      "buy-source-capture",
      "buy-cost-bundle",
      "valid_upto",
    ]
  ) {
    assert(!text.includes(forbidden), `plan leaks ${forbidden}`);
  }
});

Deno.test("demo catalogue keeps unpriced lines as Item only", () => {
  const plan = planDemoCatalogue(syntheticPreparation(false));
  assertEquals(plan.calls.length, 2);
  assertEquals(plan.calls[1].tool, "erpnext_item_create");
  assertEquals(plan.observations[0].priced, false);
  assertEquals(plan.observations[0].amount, null);
  assertEquals(plan.observations[0].taxShipping, "unknown");
  assert(!JSON.stringify(plan.calls).includes("Item Price"));
});

Deno.test("demo catalogue refuses unknown source reference", () => {
  const input = syntheticPreparation(true);
  input.lines[0].sourceRef = "src-missing";
  const error = assertThrows(
    () => planDemoCatalogue(input),
    DemoCatalogueError,
  ) as DemoCatalogueError;
  assertEquals(error.code, "DEMO_CATALOGUE_AMBIGUOUS_SOURCE");
  assert(isDemoCatalogueError(error));
});

Deno.test("demo catalogue refuses duplicate item codes", () => {
  const input = syntheticPreparation(true);
  input.lines.push({ ...input.lines[0] });
  const error = assertThrows(
    () => planDemoCatalogue(input),
    DemoCatalogueError,
  ) as DemoCatalogueError;
  assertEquals(error.code, "DEMO_CATALOGUE_DUPLICATE_CONFLICT");
});

Deno.test("demo catalogue refuses zero amount fallback", () => {
  const input = syntheticPreparation(true);
  input.lines[0].observation.amount = "0.00";
  assertThrows(() => planDemoCatalogue(input), DemoCatalogueError);
});

Deno.test("demo catalogue refuses omitted amount and currency drift", () => {
  const omittedLine = syntheticPreparation(true);
  (omittedLine.lines[0] as unknown as Record<string, unknown>).observation = {};
  assertThrows(() => planDemoCatalogue(omittedLine), DemoCatalogueError);
  const drifted = syntheticPreparation(true);
  drifted.lines[0].observation.currency = "USD";
  assertThrows(() => planDemoCatalogue(drifted), DemoCatalogueError);
});

Deno.test("demo catalogue refuses non-demo labels and valid_upto", () => {
  const prefix = syntheticPreparation(true);
  prefix.lines[0].itemCode = "WIDGET-001";
  assertThrows(() => planDemoCatalogue(prefix), DemoCatalogueError);
  const dated = syntheticPreparation(true) as unknown as Record<
    string,
    unknown
  >;
  const lines = dated.lines as Array<Record<string, unknown>>;
  lines[0].observation = {
    ...(lines[0].observation as Record<string, unknown>),
    valid_upto: "2026-12-31",
  };
  assertThrows(() => planDemoCatalogue(dated), DemoCatalogueError);
});

Deno.test("demo catalogue rejects malformed JSON cleanly", () => {
  const error = assertThrows(
    () => planDemoCatalogueFromJson("{not json"),
    DemoCatalogueError,
  ) as DemoCatalogueError;
  assertEquals(error.code, "DEMO_CATALOGUE_INVALID_INPUT");
  const plan = planDemoCatalogueFromJson(
    JSON.stringify(syntheticPreparation(false)),
  );
  assertEquals(plan.calls.length, 2);
});

Deno.test("demo catalogue refuses priced line without source metadata", () => {
  const input = syntheticPreparation(true);
  delete (input.sources[0] as unknown as Record<string, unknown>).sha256;
  const error = assertThrows(
    () => planDemoCatalogue(input),
    DemoCatalogueError,
  ) as DemoCatalogueError;
  assertEquals(error.code, "DEMO_CATALOGUE_INVALID_INPUT");
});

Deno.test("demo catalogue refuses non-public source URL", () => {
  for (
    const url of [
      "ftp://example.invalid/synthetic",
      "https://?",
      "https://user:secret@example.invalid/synthetic",
    ]
  ) {
    const input = syntheticPreparation(false);
    input.sources[0].url = url;
    assertThrows(() => planDemoCatalogue(input), DemoCatalogueError);
  }
});

Deno.test("demo catalogue keeps unpriced line with missing metadata", () => {
  const input = syntheticPreparation(false);
  delete (input.sources[0] as unknown as Record<string, unknown>).sha256;
  delete (input.sources[0] as unknown as Record<string, unknown>).retrievedAt;
  const plan = planDemoCatalogue({
    ...input,
    unresolved: ["manifest hash not yet recorded"],
  });
  assertEquals(plan.calls.length, 2);
  assertEquals(plan.observations[0].priced, false);
  assertEquals(plan.sources[0].sha256, undefined);
  assert(
    plan.unresolved.includes(
      "Source src-synthetic-001 is missing retrievedAt, sha256.",
    ),
  );
  const undeclared = planDemoCatalogue(input);
  assert(
    undeclared.unresolved.includes(
      "Source src-synthetic-001 is missing retrievedAt, sha256.",
    ),
  );
});

Deno.test("demo catalogue refuses a demo marker inside another scenario name", () => {
  for (const scenario of ["production-DEMO-ID01", "DEMO-ID01X"]) {
    assertThrows(
      () => planDemoCatalogue({ ...syntheticPreparation(false), scenario }),
      DemoCatalogueError,
    );
  }
});

Deno.test("demo catalogue normalizes primitive type errors", () => {
  for (
    const mutate of [
      (line: Record<string, unknown>) => {
        (line.observation as Record<string, unknown>).amount = 12.5;
      },
      (line: Record<string, unknown>) => {
        (line.observation as Record<string, unknown>).currency = "eur";
      },
      (line: Record<string, unknown>) => {
        line.itemCode = 42;
      },
    ]
  ) {
    const input = syntheticPreparation(true) as unknown as {
      lines: Array<Record<string, unknown>>;
    };
    mutate(input.lines[0]);
    const error = assertThrows(
      () => planDemoCatalogue(input),
      DemoCatalogueError,
    ) as DemoCatalogueError;
    assertEquals(error.code, "DEMO_CATALOGUE_INVALID_INPUT");
    assert(isDemoCatalogueError(error));
    assert(!(error instanceof TypeError));
  }
});

Deno.test("demo catalogue CLI args accept only --input path or help", () => {
  assertEquals(parseDemoCatalogueCliArgs(["--help"]), { help: true });
  assertEquals(parseDemoCatalogueCliArgs(["--input", "prep.json"]), {
    help: false,
    inputPath: "prep.json",
  });
  for (
    const args of [
      [],
      ["--input"],
      ["--input", "--apply"],
      ["--apply"],
      ["--input", "a.json", "extra"],
      ["prep.json"],
    ]
  ) {
    const error = assertThrows(
      () => parseDemoCatalogueCliArgs(args),
      DemoCatalogueError,
    ) as DemoCatalogueError;
    assertEquals(error.code, "DEMO_CATALOGUE_INVALID_ARGS");
  }
});
