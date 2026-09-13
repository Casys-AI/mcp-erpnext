import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { documentModelOf } from "./model.ts";
import {
  operationalDocstatusKey,
  operationalField,
  operationalProfile,
  operationalProgress,
  operationalRemainder,
  operationalTable,
  operationalUnit,
} from "./operational-model.ts";
import { translatorForLocale } from "../i18n.ts";
import { childTableHiddenEntries } from "./child-table-model.ts";
import {
  OPERATIONAL_FIXTURES,
  operationalFixture,
} from "../../doc-viewer/src/operational-fixtures.ts";

Deno.test("operational profile only selects exact six document types", () => {
  for (const fixture of Object.values(OPERATIONAL_FIXTURES)) {
    const model = documentModelOf(fixture)!;
    assert(operationalProfile(model.envelope.doctype));
  }
  for (
    const name of [
      "Purchase Invoice",
      "project",
      "WorkOrder",
      "toString",
      "__proto__",
    ]
  ) {
    assertEquals(operationalProfile(name), undefined);
  }
  assertEquals(operationalFixture("?fixture=__proto__"), undefined);
});

Deno.test("operational missing values never become zero, unit or derived progress", () => {
  const model = documentModelOf({
    doctype: "Work Order",
    name: "WO-1",
    qty: 12,
    produced_qty: 0,
    currency: "EUR",
  })!;
  const profile = operationalProfile("Work Order")!;
  assertEquals(operationalField(model, profile.metrics[1]).value, 0);
  assertEquals(operationalField(model, profile.metrics[2]).kind, "empty");
  assertEquals(operationalUnit(model, profile.metrics[0]), null);
  const costs = profile.groups.find((group) => group.title === "costing")!;
  assertEquals(
    operationalUnit(model, costs.fields[0]),
    null,
    "transaction currency cannot stand in for company currency",
  );
  assertEquals(operationalField(model, costs.fields[0]).value, null);
  assertEquals(model.progressFields, [], "no produced/required ratio");
});

Deno.test("ERP currency, explicit false and zero remain visible without changing source", () => {
  const model = documentModelOf({
    doctype: "BOM",
    name: "BOM-1",
    currency: "JPY",
    total_cost: 0,
    is_active: 0,
    raw_material_cost: 10,
    operating_cost: 4,
  })!;
  const profile = operationalProfile("BOM")!;
  assertEquals(
    operationalField(model, profile.metrics[1]).value,
    0,
    "do not sum materials and operations",
  );
  assertEquals(operationalUnit(model, profile.metrics[1]), "JPY");
  assertEquals(operationalField(model, profile.metrics[2]).value, false);
  assertEquals(model.envelope.document.is_active, 0);
});

Deno.test("meter accepts bounded ERP progress only and does not clamp invalid values", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      " ",
      true,
      {},
      NaN,
      Infinity,
      -1,
      101,
      "0x20",
    ]
  ) assertEquals(operationalProgress(value), null);
  for (
    const [value, expected] of [[0, 0], ["42.5", 42.5], [100, 100]] as const
  ) assertEquals(operationalProgress(value), expected);
});

Deno.test("dossier table presentation preserves row identity, hidden fields and raw envelope", () => {
  const model = documentModelOf(OPERATIONAL_FIXTURES.bom)!;
  const table = model.childTables.find((table) => table.key === "items")!;
  assert(
    table.total,
    "generic table computes a total before dossier decoration",
  );
  const decorated = operationalTable(
    table,
    operationalProfile("BOM")!,
    translatorForLocale("fr"),
  );
  assertStrictEquals(decorated.rows, table.rows);
  assertEquals(decorated.total, undefined);
  assertEquals(decorated.columns.slice(0, 4).map((column) => column.key), [
    "item_code",
    "qty",
    "uom",
    "amount",
  ]);
  assertEquals(decorated.label, "Matières");
  assert(
    childTableHiddenEntries(decorated, 0, "panel").some((field) =>
      field.key === "amount"
    ),
  );
  assert(
    childTableHiddenEntries(decorated, 0, "wide").some((field) =>
      field.key === "item_name"
    ),
  );
  assertStrictEquals(
    model.envelope.document,
    operationalRemainder(model, operationalProfile("BOM")!).envelope.document,
  );
});

Deno.test("all untouched fields, collections and system evidence remain available", () => {
  const model = documentModelOf({
    doctype: "Task",
    name: "TASK-1",
    custom_engineering_reference: "REF-01",
    description: "Review notes",
    progress: 42,
    modified: "2026-09-13 09:00:00",
    tags: ["unverified"],
  })!;
  const remainder = operationalRemainder(model, operationalProfile("Task")!);
  assert(
    remainder.fields.some((field) =>
      field.key === "custom_engineering_reference"
    ),
  );
  assertEquals(remainder.progressFields, []);
  assertStrictEquals(remainder.longFields, model.longFields);
  assertStrictEquals(remainder.collections, model.collections);
  assertStrictEquals(remainder.systemFields, model.systemFields);
});

Deno.test("each profile field and section translates in EN FR ZH; fixture actions absent", () => {
  for (const fixture of Object.values(OPERATIONAL_FIXTURES)) {
    const model = documentModelOf(fixture)!;
    const profile = operationalProfile(model.envelope.doctype)!;
    assertEquals(model.envelope.availableTools, []);
    assertEquals(model.envelope.refreshRequest, undefined);
    for (const locale of ["en", "fr", "zh"]) {
      const t = translatorForLocale(locale);
      for (
        const field of [
          ...profile.metrics,
          ...profile.groups.flatMap((group) => group.fields),
        ]
      ) {
        const key = `dossier.field.${field.label}`;
        assert(t(key) !== key, `${locale} ${key}`);
      }
      for (const group of profile.groups) {
        const key = `dossier.section.${group.title}`;
        assert(t(key) !== key, `${locale} ${key}`);
      }
    }
  }
});

Deno.test("operation time labels do not mislabel logged minutes as planned", () => {
  const model = documentModelOf(OPERATIONAL_FIXTURES["job-card"])!;
  const table = operationalTable(
    model.childTables[0],
    operationalProfile("Job Card")!,
    translatorForLocale("en"),
  );
  assertEquals(
    table.columns.find((column) => column.key === "time_in_mins")?.label,
    "Logged time · min",
  );
});

Deno.test("document status maps only ERP 0/1/2 and preserves unknown states", () => {
  assertEquals(operationalDocstatusKey(0), "dossier.docstatus.draft");
  assertEquals(operationalDocstatusKey(1), "dossier.docstatus.submitted");
  assertEquals(operationalDocstatusKey(2), "dossier.docstatus.cancelled");
  for (const value of [undefined, -1, 3, NaN]) {
    assertEquals(operationalDocstatusKey(value), undefined);
  }
});
