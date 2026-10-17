import { assertEquals } from "@std/assert";
import { documentFieldOf } from "./model.ts";
import {
  fieldLayoutOf,
  layoutDocumentFields,
  layoutLabelOf,
} from "./field-layout.ts";
import type { DocumentFieldLayout } from "./types.ts";

const LAYOUT = {
  version: 1,
  preview: ["customer_name", "posting_date", "grand_total"],
  sections: [
    { label: null, fields: ["company", "customer_name", "posting_date"] },
    { label: "Totals", fields: ["grand_total", "outstanding_amount"] },
    { label: "Notes", fields: ["po_no"] },
  ],
  labels: { customer_name: "Customer Name", po_no: "Customer's PO" },
};

function fields(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) =>
    documentFieldOf(key, value)
  );
}

Deno.test("fieldLayoutOf - accepte la mise en page serveur", () => {
  assertEquals(fieldLayoutOf(LAYOUT), {
    preview: LAYOUT.preview,
    sections: LAYOUT.sections,
    labels: LAYOUT.labels,
  });
});

Deno.test("fieldLayoutOf - refuse une charge inconnue ou incomplète", () => {
  assertEquals(fieldLayoutOf(undefined), undefined);
  assertEquals(fieldLayoutOf(null), undefined);
  assertEquals(fieldLayoutOf([]), undefined);
  assertEquals(fieldLayoutOf({ ...LAYOUT, version: 2 }), undefined);
  assertEquals(fieldLayoutOf({ ...LAYOUT, version: undefined }), undefined);
  assertEquals(fieldLayoutOf({ ...LAYOUT, preview: "a" }), undefined);
  assertEquals(fieldLayoutOf({ ...LAYOUT, sections: {} }), undefined);
});

Deno.test("fieldLayoutOf - écarte les entrées mal formées sans perdre le reste", () => {
  assertEquals(
    fieldLayoutOf({
      version: 1,
      preview: ["a", 3, "", "a", null],
      sections: [
        null,
        { label: 4, fields: ["x"] },
        { label: "Ok", fields: ["y", 5, ""] },
        { label: "Empty", fields: [] },
        { label: "Broken", fields: "z" },
      ],
      labels: { a: "A", b: 2, c: "" },
    }),
    {
      preview: ["a"],
      sections: [
        { label: null, fields: ["x"] },
        { label: "Ok", fields: ["y"] },
      ],
      labels: { a: "A" },
    },
  );
  // `labels` est facultatif.
  assertEquals(
    fieldLayoutOf({ version: 1, preview: [], sections: [] })?.labels,
    {},
  );
});

Deno.test("layoutDocumentFields - l'aperçu suit l'ordre du DocType, le reste suit les sections", () => {
  const layout = fieldLayoutOf(LAYOUT) as DocumentFieldLayout;
  const result = layoutDocumentFields(
    {
      scalars: fields({
        outstanding_amount: 12,
        po_no: "PO-9",
        grand_total: 100,
        company: "Acme",
        posting_date: "2026-10-01",
        customer_name: "Ada",
      }),
    },
    layout,
  );

  assertEquals(result.fields.map((field) => field.key), [
    "customer_name",
    "posting_date",
    "grand_total",
  ]);
  assertEquals(
    result.sections.map((section) => [
      section.label,
      section.fields.map((field) => field.key),
    ]),
    [
      [null, ["company"]],
      ["Totals", ["outstanding_amount"]],
      ["Notes", ["po_no"]],
    ],
  );
});

Deno.test("layoutDocumentFields - un champ d'aperçu sans valeur n'est pas affiché", () => {
  const layout = fieldLayoutOf(LAYOUT) as DocumentFieldLayout;
  const result = layoutDocumentFields(
    {
      scalars: fields({
        customer_name: "Ada",
        posting_date: null,
        grand_total: "",
      }),
    },
    layout,
  );
  assertEquals(result.fields.map((field) => field.key), ["customer_name"]);
  assertEquals(result.sections, []);
});

Deno.test("layoutDocumentFields - 0 et false sont des valeurs, null et vide non", () => {
  const layout = fieldLayoutOf({
    version: 1,
    preview: ["total"],
    sections: [{ label: "Flags", fields: ["is_pos", "rate", "note", "gone"] }],
    labels: {},
  }) as DocumentFieldLayout;
  const result = layoutDocumentFields(
    {
      scalars: fields({
        total: 0,
        is_pos: false,
        rate: 0,
        note: "",
        gone: null,
      }),
    },
    layout,
  );
  assertEquals(result.fields.map((field) => field.key), ["total"]);
  assertEquals(
    result.sections[0].fields.map((field) => field.key),
    ["is_pos", "rate"],
  );
});

Deno.test("layoutDocumentFields - les champs hors mise en page vont dans un dernier groupe sans libellé", () => {
  const layout = fieldLayoutOf(LAYOUT) as DocumentFieldLayout;
  const result = layoutDocumentFields(
    { scalars: fields({ custom_note: "x", po_no: "PO-9", other_custom: 1 }) },
    layout,
  );
  assertEquals(
    result.sections.map((section) => [
      section.key,
      section.label,
      section.fields.map((field) => field.key),
    ]),
    [
      ["section-2", "Notes", ["po_no"]],
      ["section-other", null, ["custom_note", "other_custom"]],
    ],
  );
});

Deno.test("layoutDocumentFields - un champ cité deux fois n'apparaît qu'une fois", () => {
  const layout = fieldLayoutOf({
    version: 1,
    preview: ["a", "a"],
    sections: [
      { label: "One", fields: ["b", "a"] },
      { label: "Two", fields: ["b", "c"] },
    ],
    labels: {},
  }) as DocumentFieldLayout;
  const result = layoutDocumentFields(
    { scalars: fields({ a: 1, b: 2, c: 3 }) },
    layout,
  );
  assertEquals(result.fields.map((field) => field.key), ["a"]);
  assertEquals(
    result.sections.map((section) => section.fields.map((f) => f.key)),
    [["b"], ["c"]],
  );
});

Deno.test("layoutDocumentFields - sans valeur, ni aperçu ni sections", () => {
  const layout = fieldLayoutOf(LAYOUT) as DocumentFieldLayout;
  assertEquals(layoutDocumentFields({ scalars: [] }, layout), {
    fields: [],
    longFields: [],
    sections: [],
  });
});

Deno.test("layoutLabelOf - seul un libellé propre à la mise en page compte", () => {
  const layout = fieldLayoutOf(LAYOUT) as DocumentFieldLayout;
  assertEquals(layoutLabelOf(layout, "customer_name"), "Customer Name");
  assertEquals(layoutLabelOf(layout, "unknown"), undefined);
  // Pas de fuite par la chaîne de prototypes.
  assertEquals(layoutLabelOf(layout, "constructor"), undefined);
  assertEquals(layoutLabelOf(layout, "toString"), undefined);
  assertEquals(layoutLabelOf(undefined, "customer_name"), undefined);
});

const LONG_LAYOUT = fieldLayoutOf({
  version: 1,
  preview: ["customer_name", "remarks"],
  sections: [
    { label: null, fields: ["customer_name", "company"] },
    { label: "Terms", fields: ["terms", "tc_name"] },
    { label: "Notes", fields: ["remarks", "internal_note"] },
  ],
  labels: {},
}) as DocumentFieldLayout;

Deno.test("layoutDocumentFields - un champ long hors aperçu se replie dans sa section ERPNext", () => {
  const result = layoutDocumentFields(
    {
      scalars: fields({ company: "Acme", tc_name: "Net 30" }),
      longFields: fields({ terms: "Line one\nLine two" }),
    },
    LONG_LAYOUT,
  );

  assertEquals(result.longFields, []);
  assertEquals(
    result.sections.map((section) => [
      section.key,
      section.label,
      section.fields.map((field) => field.key),
      section.longFields.map((field) => field.key),
    ]),
    [
      ["section-0", null, ["company"], []],
      // Le champ long suit l'ordre du DocType, avec les champs courts à côté.
      ["section-1", "Terms", ["tc_name"], ["terms"]],
    ],
  );
});

Deno.test("layoutDocumentFields - un champ long d'aperçu garde son traitement de champ long", () => {
  const result = layoutDocumentFields(
    {
      scalars: fields({ customer_name: "Ada" }),
      longFields: fields({ remarks: "Pinned\nnote", terms: "Folded\nterms" }),
    },
    LONG_LAYOUT,
  );

  assertEquals(result.fields.map((field) => field.key), ["customer_name"]);
  assertEquals(result.longFields.map((field) => field.key), ["remarks"]);
  // `remarks` n'est pas répété dans « Tous les champs ».
  assertEquals(
    result.sections.flatMap((section) =>
      section.longFields.map((field) => field.key)
    ),
    ["terms"],
  );
});

Deno.test("layoutDocumentFields - une section qui n'a que des champs longs est conservée", () => {
  const result = layoutDocumentFields(
    { scalars: [], longFields: fields({ internal_note: "a\nb" }) },
    LONG_LAYOUT,
  );
  assertEquals(
    result.sections.map((section) => [
      section.label,
      section.fields.length,
      section.longFields.length,
    ]),
    [["Notes", 0, 1]],
  );
});

Deno.test("layoutDocumentFields - un champ long hors mise en page clôt la liste, un champ long vide disparaît", () => {
  const result = layoutDocumentFields(
    {
      scalars: fields({ company: "Acme" }),
      longFields: fields({ custom_blob: "x\ny", terms: "", remarks: null }),
    },
    LONG_LAYOUT,
  );

  assertEquals(result.longFields, []);
  assertEquals(
    result.sections.map((section) => [
      section.key,
      section.fields.map((field) => field.key),
      section.longFields.map((field) => field.key),
    ]),
    [
      ["section-0", ["company"], []],
      ["section-other", [], ["custom_blob"]],
    ],
  );
});
