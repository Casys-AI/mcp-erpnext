import { assertEquals, assertExists } from "@std/assert";
import { companyPreviewFieldsOf } from "./company-preview.ts";
import { documentModelOf } from "./model.ts";

Deno.test("Company preview shows identity fields in a useful order instead of Frappe metadata", () => {
  const document = {
    name: "Casys Industries",
    owner: "Administrator",
    creation: "2026-09-01 09:00:00",
    modified: "2026-09-02 10:00:00",
    modified_by: "Administrator",
    docstatus: 0,
    idx: 0,
    is_group: 0,
    domain: "Manufacturing",
    default_currency: "TWD",
    country: "Taiwan",
    abbr: "CASYS",
    company_name: "Casys Industries",
    doctype: "Company",
    default_bank_account: "Bank - CASYS",
    custom_summary: "A custom field stays on the full record",
  };

  assertEquals(companyPreviewFieldsOf(document), [
    { key: "company_name", value: "Casys Industries" },
    { key: "abbr", value: "CASYS" },
    { key: "country", value: "Taiwan" },
    { key: "default_currency", value: "TWD" },
    { key: "domain", value: "Manufacturing" },
    { key: "is_group", value: false },
  ]);
});

Deno.test("Company preview retains false and normalizes Frappe checkbox values", () => {
  for (
    const [input, expected] of [
      [0, false],
      [1, true],
      ["0", false],
      ["1", true],
      [false, false],
      [true, true],
    ] as const
  ) {
    assertEquals(companyPreviewFieldsOf({ is_group: input }), [
      { key: "is_group", value: expected },
    ]);
  }
  for (const input of [undefined, null, "", 2, "false", {}]) {
    assertEquals(companyPreviewFieldsOf({ is_group: input }), []);
  }
});

Deno.test("Company preview uses the record name when company_name is absent or empty", () => {
  for (const companyName of [undefined, null, "", "  "]) {
    assertEquals(
      companyPreviewFieldsOf({
        name: "Casys Industries",
        company_name: companyName,
      }),
      [{ key: "company_name", value: "Casys Industries" }],
    );
  }
  assertEquals(
    companyPreviewFieldsOf({
      name: "COMPANY-001",
      company_name: "Casys Industries",
    }),
    [{ key: "company_name", value: "Casys Industries" }],
  );
});

Deno.test("Company preview omits missing or empty identity fields and never guesses extra fields", () => {
  assertEquals(
    companyPreviewFieldsOf({
      name: "Casys Industries",
      abbr: "CASYS",
      country: "Taiwan",
      default_currency: "TWD",
      domain: "   ",
      is_group: 0,
      phone: "+886 123456789",
      custom_domain: "Services",
    }),
    [
      { key: "company_name", value: "Casys Industries" },
      { key: "abbr", value: "CASYS" },
      { key: "country", value: "Taiwan" },
      { key: "default_currency", value: "TWD" },
      { key: "is_group", value: false },
    ],
  );
  assertEquals(
    companyPreviewFieldsOf({ abbr: 0, country: null, domain: [] }),
    [],
  );
});

Deno.test("Company preview preserves all source data for the full document model", () => {
  const document = {
    name: "Casys Industries",
    doctype: "Company",
    company_name: "Casys Industries",
    is_group: 0,
    idx: 0,
    owner: "Administrator",
    default_bank_account: "Bank - CASYS",
    accounts: [{ account: "Cash - CASYS", account_currency: "TWD" }],
  };
  const payload = {
    data: document,
    _availableTools: ["erpnext_doc_get"],
    refreshRequest: {
      toolName: "erpnext_doc_get",
      arguments: { doctype: "Company", name: "Casys Industries" },
    },
  };
  const before = structuredClone(payload);
  companyPreviewFieldsOf(Object.freeze(document));

  assertEquals(payload, before);
  const fullModel = documentModelOf(payload);
  assertExists(fullModel);
  assertEquals(fullModel.envelope.document, before.data);
  assertEquals(fullModel.envelope.availableTools, before._availableTools);
  assertEquals(fullModel.envelope.refreshRequest, before.refreshRequest);
  assertEquals(
    fullModel.fields.find((field) => field.key === "default_bank_account")
      ?.value,
    "Bank - CASYS",
  );
  assertEquals(
    fullModel.systemFields.find((field) => field.key === "owner")?.value,
    "Administrator",
  );
  assertEquals(fullModel.childTables[0].rows[0].account, "Cash - CASYS");
});
