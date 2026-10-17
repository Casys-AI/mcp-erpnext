import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  companySectionsOf,
  nativeDocTypeFieldsOf,
} from "./company-sections.ts";
import type { DocumentFieldModel } from "./types.ts";

function field(key: string, value: string | number | boolean | null = key) {
  return { key, label: `Original ${key}`, value, kind: "text" as const };
}

function flattened(result: ReturnType<typeof companySectionsOf>) {
  return [
    ...result.general,
    ...result.sections.flatMap((group) => group.fields),
  ];
}

function assertConserved(
  fields: readonly DocumentFieldModel[],
  result: ReturnType<typeof companySectionsOf>,
) {
  const output = flattened(result);
  assertEquals(output.length, fields.length);
  for (const entry of fields) {
    assertEquals(output.filter((candidate) => candidate === entry).length, 1);
  }
}

Deno.test("Company sections use native boundaries and preserve every field object", () => {
  const fields = [
    field("default_cash_account", 0),
    field("country"),
    field("company_name"),
    field("is_group", false),
    field("custom_flag", null),
    field("stock_account"),
  ];
  const result = companySectionsOf(fields, [
    { fieldname: "details", fieldtype: "Section Break" },
    { fieldname: "company_name", fieldtype: "Data", label: "Company" },
    { fieldname: "country", fieldtype: "Link" },
    { fieldname: "column", fieldtype: "Column Break" },
    { fieldname: "is_group", fieldtype: "Check" },
    { fieldname: "accounts", fieldtype: "Tab Break", label: "Accounts" },
    {
      fieldname: "defaults",
      fieldtype: "Section Break",
      label: "Default Accounts",
    },
    { fieldname: "default_cash_account", fieldtype: "Link" },
    { fieldname: "stock", fieldtype: "Tab Break", label: "Stock" },
    { fieldname: "stock_account", fieldtype: "Link" },
  ]);

  assertEquals(result.schemaAvailable, true);
  assertEquals(result.general.map((entry) => entry.key), [
    "company_name",
    "country",
    "is_group",
  ]);
  assertEquals(result.sections.map((group) => [group.key, group.label]), [
    ["native:defaults", "Default Accounts"],
    ["native:stock", "Stock"],
    ["other", ""],
  ]);
  assertStrictEquals(result.sections[0].fields[0], fields[0]);
  assertEquals(fields[0].label, "Original default_cash_account");
  assertConserved(fields, result);
});

Deno.test("Company without schema uses existing identity fields and conserves settings", () => {
  const fields = [
    field("company_name"),
    field("abbr"),
    field("default_currency"),
    field("country"),
    field("domain"),
    field("is_group", false),
    field("custom_unknown", ""),
    field("enable_perpetual_inventory", 0),
  ];
  const result = companySectionsOf(fields);
  assertEquals(result.schemaAvailable, false);
  assertEquals(result.general, fields.slice(0, 6));
  assertEquals(result.sections, [{
    key: "other",
    label: "",
    fields: fields.slice(6),
  }]);
  assertConserved(fields, result);
});

Deno.test("Company keeps only its useful identity visible before advanced settings", () => {
  const fields = [
    field("company_name"),
    field("reporting_currency"),
    field("is_group", false),
    field("domain"),
  ];
  const result = companySectionsOf(fields, [
    { fieldname: "company_name", fieldtype: "Data" },
    { fieldname: "reporting_currency", fieldtype: "Link" },
    { fieldname: "is_group", fieldtype: "Check" },
    { fieldname: "domain", fieldtype: "Data" },
  ]);

  assertEquals(result.general.map((entry) => entry.key), [
    "company_name",
    "is_group",
    "domain",
  ]);
  assertEquals(result.sections, [{
    key: "other",
    label: "",
    fields: [fields[1]],
  }]);
  assertConserved(fields, result);
});

Deno.test("Company native sections with no labels still retain their fields", () => {
  const fields = [field("company_name"), field("rgt"), field("close_account")];
  const result = companySectionsOf(fields, [
    { fieldname: "details", fieldtype: "Section Break" },
    { fieldname: "company_name", fieldtype: "Data" },
    { fieldname: "registration", fieldtype: "Section Break" },
    { fieldname: "rgt", fieldtype: "Int" },
    { fieldname: "closing", fieldtype: "Tab Break", label: "Accounts Closing" },
    { fieldname: "closing_fields", fieldtype: "Section Break" },
    { fieldname: "close_account", fieldtype: "Link" },
  ]);
  assertEquals(result.sections.map((group) => group.label), [
    "",
    "Accounts Closing",
  ]);
  assertConserved(fields, result);
});

Deno.test("Company fields before the first native break remain general", () => {
  const fields = [field("company_name"), field("setting")];
  const result = companySectionsOf(fields, [
    { fieldname: "company_name", fieldtype: "Data" },
    { fieldname: "settings", fieldtype: "Section Break", label: "Settings" },
    { fieldname: "setting", fieldtype: "Check" },
  ]);
  assertEquals(result.general, [fields[0]]);
  assertEquals(result.sections[0].fields, [fields[1]]);
  assertConserved(fields, result);
});

Deno.test("Consecutive initial tab and section breaks keep the first native section general", () => {
  const fields = [field("company_name"), field("setting")];
  const result = companySectionsOf(fields, [
    { fieldname: "main", fieldtype: "Tab Break", label: "Company" },
    { fieldname: "details", fieldtype: "Section Break" },
    { fieldname: "company_name", fieldtype: "Data" },
    { fieldname: "settings", fieldtype: "Section Break", label: "Settings" },
    { fieldname: "setting", fieldtype: "Check" },
  ]);
  assertEquals(result.general, [fields[0]]);
  assertEquals(result.sections[0].fields, [fields[1]]);
  assertConserved(fields, result);
});

Deno.test("Malformed or empty native schemas fail closed without losing company data", () => {
  for (
    const schema of [
      undefined,
      [],
      [null],
      [{ fieldname: "name", fieldtype: 12 }],
      [{ fieldname: "details", fieldtype: "Section Break" }],
      [{ fieldname: "abbr", fieldtype: "Data", label: {} }],
      [
        { fieldname: "abbr", fieldtype: "Data" },
        { fieldname: "abbr", fieldtype: "Link" },
      ],
    ]
  ) assertEquals(nativeDocTypeFieldsOf(schema), undefined);
  const fields = [field("company_name"), field("custom_new")];
  const result = companySectionsOf(fields, []);
  assertEquals(result.schemaAvailable, false);
  assertConserved(fields, result);
});

Deno.test("Native schema validation accepts Frappe null labels without manufacturing labels", () => {
  assertEquals(
    nativeDocTypeFieldsOf([
      { fieldname: "details", fieldtype: "Section Break", label: null },
      { fieldname: "company_name", fieldtype: "Data", label: "Company" },
    ]),
    [
      { fieldname: "details", fieldtype: "Section Break" },
      { fieldname: "company_name", fieldtype: "Data", label: "Company" },
    ],
  );
});
