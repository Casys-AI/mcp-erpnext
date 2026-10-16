import { assert, assertEquals } from "@std/assert";
import { setLocaleSource } from "../../shared/format.ts";
import { translatorForLocale } from "../../shared/i18n.ts";
import { analyticsTools } from "../../../tools/analytics.ts";
import type { FrappeClient } from "../../../api/frappe-client.ts";
import {
  currencySymbol,
  formatDeltaPercent,
  formatDeltaValue,
  kpiCaption,
  kpiMainText,
  kpiParts,
  kpiSecondary,
  kpiSecondaryText,
} from "./kpi-format.ts";
import type { KpiData } from "./types.ts";

const en = translatorForLocale("en-US");
const fr = translatorForLocale("fr-FR");

/** Espaces fines et insécables normalisées : Intl varie selon l'ICU. */
function plain(text: string | undefined): string {
  return (text ?? "").replace(/[  ]/g, " ");
}

function withLocale<T>(locale: string, run: () => T): T {
  setLocaleSource(() => locale);
  try {
    return run();
  } finally {
    setLocaleSource(() => undefined);
  }
}

function handlerFor(name: string) {
  const tool = analyticsTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool.handler;
}

async function payload(
  name: string,
  rows: Record<string, unknown>[],
): Promise<KpiData> {
  const client = {
    list: () => Promise.resolve(rows),
  } as unknown as FrappeClient;
  return await handlerFor(name)({}, { client }) as unknown as KpiData;
}

// ── Contrat payload → rendu (payloads réels des handlers) ────────────────────

Deno.test("kpi contract - order growth stays in percent from handler to badge", async () => {
  for (
    const [currentCount, previousCount, expectedDelta, expectedText] of [
      [37, 36, 2.8, "2.8%"],
      [36, 37, -2.7, "2.7%"],
    ] as const
  ) {
    let reads = 0;
    const client = {
      list: () =>
        Promise.resolve(
          Array.from(
            { length: reads++ === 0 ? currentCount : previousCount },
            () => ({}),
          ),
        ),
    } as unknown as FrappeClient;
    const data = await handlerFor("erpnext_kpi_orders")({}, {
      client,
    }) as KpiData;
    assertEquals(data.delta, expectedDelta);
    withLocale("en-US", () => {
      assertEquals(formatDeltaPercent(data.delta), expectedText);
    });
    withLocale("fr-FR", () => {
      assertEquals(
        plain(formatDeltaPercent(data.delta)),
        expectedText.replace(".", ",").replace("%", " %"),
      );
    });
  }
});

Deno.test("kpi delta percent - whole, fractional, zero and absent values stay localized", () => {
  withLocale("en-US", () => {
    assertEquals(formatDeltaPercent(0), "0%");
    assertEquals(formatDeltaPercent(-100), "100%");
    assertEquals(formatDeltaPercent(2.83), "2.8%");
    assertEquals(formatDeltaPercent(null), "—");
    assertEquals(formatDeltaPercent(NaN), "—");
  });
});

Deno.test("kpi contract - stable overdue keeps its amount in the formattedValue fallback", async () => {
  const data = await payload("erpnext_kpi_overdue", [
    { outstanding_amount: 1500, due_date: "2026-01-01" },
    { outstanding_amount: 800.5, due_date: "2025-12-15" },
    { outstanding_amount: 0.5, due_date: "2025-11-01" },
  ]);

  assertEquals(data.value, 3);
  assertEquals(data.secondary, undefined);
  assertEquals(data.formattedValue, "3 inv. / €2,301.00");
  for (const [locale, t] of [["en-US", en], ["fr-FR", fr]] as const) {
    withLocale(locale, () => {
      const parts = kpiParts(data);
      assertEquals(parts, { amount: "3", unit: "" });
      assertEquals(kpiSecondary(data, t), undefined);
      assertEquals(kpiSecondaryText(data, t), undefined);
      assertEquals(kpiCaption(data, parts, t), "3 inv. / €2,301.00");
    });
  }
});

Deno.test("kpi contract - stable outstanding keeps its invoice count in the formattedValue fallback", async () => {
  const data = await payload("erpnext_kpi_outstanding", [
    { outstanding_amount: 2000 },
    { outstanding_amount: 300 },
    { outstanding_amount: 0.5 },
  ]);

  assertEquals(data.value, 2300.5);
  assertEquals(data.secondary, undefined);
  assertEquals(data.formattedValue, "3 inv. / €2,300.50");
  withLocale("en-US", () => {
    const parts = kpiParts(data);
    assertEquals(parts, { amount: "2,300.50", unit: "€" });
    assertEquals(kpiSecondary(data, en), undefined);
    assertEquals(kpiCaption(data, parts, en), "3 inv. / €2,300.50");
  });
  withLocale("fr-FR", () => {
    const parts = kpiParts(data);
    assertEquals(plain(parts.amount), "2 300,50");
    assertEquals(parts.unit, "€");
    assertEquals(kpiSecondary(data, fr), undefined);
    assertEquals(kpiCaption(data, parts, fr), "3 inv. / €2,300.50");
  });
});

Deno.test("kpi contract - empty stable invoice payloads keep their zero amount and count", async () => {
  for (const name of ["erpnext_kpi_overdue", "erpnext_kpi_outstanding"]) {
    const data = await payload(name, []);
    withLocale("en-US", () => {
      assertEquals(data.value, 0);
      assertEquals(kpiSecondary(data, en), undefined);
      assertEquals(kpiCaption(data, kpiParts(data), en), "0 inv. / €0.00");
    });
  }
});

Deno.test("kpi format - orders payload, percentage and currency metrics keep their main text", async () => {
  const orders = await payload("erpnext_kpi_orders", [
    { grand_total: 1 },
    { grand_total: 2 },
    { grand_total: 3 },
  ]);
  withLocale("en-US", () => {
    const parts = kpiParts(orders);
    assertEquals(kpiMainText(parts), "3 orders");
    assertEquals(kpiSecondary(orders, en), undefined);
    // formattedValue "3 orders" est déjà lu dans le grand chiffre.
    assertEquals(orders.formattedValue, "3 orders");
    assertEquals(kpiCaption(orders, parts, en), undefined);
  });
  withLocale("en-US", () => {
    assertEquals(kpiParts({ value: 40, unit: "%" } as KpiData), {
      amount: "40",
      unit: "%",
    });
    assertEquals(
      kpiParts({ value: 40.5, unit: "%" } as KpiData).amount,
      "40.5",
    );
    assertEquals(kpiParts({ value: 6200, currency: "EUR" } as KpiData), {
      amount: "6,200.00",
      unit: "€",
    });
  });
});

Deno.test("kpi secondary - optional amount and invoice count remain localized", () => {
  const amount = {
    secondary: { kind: "amount", value: 2300.5, currency: "EUR" },
  } as KpiData;
  const count = {
    secondary: { kind: "invoice_count", value: 3 },
  } as KpiData;

  withLocale("en-US", () => {
    assertEquals(kpiSecondary(amount, en), {
      label: "Amount",
      value: "€2,300.50",
    });
    assertEquals(kpiSecondaryText(amount, en), "Amount: €2,300.50");
    assertEquals(kpiSecondary(count, en), { label: "Invoices", value: "3" });
  });
  withLocale("fr-FR", () => {
    const line = kpiSecondary(amount, fr);
    assertEquals(line?.label, "Montant");
    assertEquals(plain(line?.value), "2 300,50 €");
    assertEquals(plain(kpiSecondaryText(amount, fr)), "Montant: 2 300,50 €");
    assertEquals(kpiSecondary(count, fr), { label: "Factures", value: "3" });
  });
});

// ── Repli formattedValue ─────────────────────────────────────────────────────

Deno.test("kpi caption - an older server without secondary falls back to formattedValue", () => {
  withLocale("en-US", () => {
    const legacyOverdue = {
      value: 3,
      formattedValue: "3 inv. / €2,300.50",
    } as KpiData;
    assertEquals(
      kpiCaption(legacyOverdue, kpiParts(legacyOverdue), en),
      "3 inv. / €2,300.50",
    );
  });
});

Deno.test("kpi caption - hidden once a valid secondary line is shown, or when redundant", () => {
  withLocale("en-US", () => {
    const withSecondary = {
      value: 3,
      formattedValue: "3 inv. / €2,300.50",
      secondary: { kind: "amount", value: 2300.5, currency: "EUR" },
    } as KpiData;
    assertEquals(
      kpiCaption(withSecondary, kpiParts(withSecondary), en),
      undefined,
    );

    // Secondary invalide : la légende reprend le relais plutôt que de tout masquer.
    const invalid = {
      value: 3,
      formattedValue: "3 inv. / €2,300.50",
      secondary: { kind: "mystery", value: 1 },
    } as unknown as KpiData;
    assertEquals(
      kpiCaption(invalid, kpiParts(invalid), en),
      "3 inv. / €2,300.50",
    );

    const blank = { value: 1, formattedValue: "   " } as KpiData;
    assertEquals(kpiCaption(blank, kpiParts(blank), en), undefined);
    const absent = { value: 1 } as KpiData;
    assertEquals(kpiCaption(absent, kpiParts(absent), en), undefined);
  });
});

// ── Cas limites ──────────────────────────────────────────────────────────────

Deno.test("kpi secondary - unknown kind, non finite value, missing currency and negative count yield no line", () => {
  const bad: unknown[] = [
    undefined,
    null,
    "amount",
    {},
    { kind: "mystery", value: 1 },
    { kind: "invoice_count", value: NaN },
    { kind: "invoice_count", value: "many" },
    { kind: "invoice_count", value: null },
    { kind: "invoice_count", value: -1 },
    { kind: "amount", value: 10 },
    { kind: "amount", value: 10, currency: "" },
    { kind: "amount", value: 10, currency: 42 },
    { kind: "amount", value: Infinity, currency: "EUR" },
  ];
  withLocale("en-US", () => {
    for (const secondary of bad) {
      assertEquals(
        kpiSecondary({ secondary } as unknown as KpiData, en),
        undefined,
        JSON.stringify(secondary),
      );
    }
  });
});

Deno.test("kpi secondary - a zero count and a zero amount are real values", () => {
  withLocale("en-US", () => {
    assertEquals(
      kpiSecondary(
        { secondary: { kind: "invoice_count", value: 0 } } as KpiData,
        en,
      ),
      { label: "Invoices", value: "0" },
    );
    assertEquals(
      kpiSecondary(
        { secondary: { kind: "amount", value: 0, currency: "EUR" } } as KpiData,
        en,
      ),
      { label: "Amount", value: "€0.00" },
    );
  });
});

Deno.test("kpi format - malformed currency never throws, on the value, the delta and the secondary amount", () => {
  withLocale("en-US", () => {
    assertEquals(currencySymbol("EURO"), "EURO");
    assertEquals(currencySymbol("€"), "€");
    assertEquals(currencySymbol("eur"), "€");
    assertEquals(kpiParts({ value: 12, currency: "EURO" } as KpiData), {
      amount: "12.00",
      unit: "EURO",
    });
    assertEquals(
      formatDeltaValue({ deltaValue: 5655, currency: "EURO" }),
      "5,655.00 EURO",
    );
    assertEquals(
      kpiSecondary(
        {
          secondary: { kind: "amount", value: 9, currency: "EURO" },
        } as KpiData,
        en,
      )?.value,
      "9.00 EURO",
    );
  });
});

Deno.test("kpi format - null, NaN and string values degrade to zero or a dash, never an exception", () => {
  withLocale("en-US", () => {
    assertEquals(kpiParts({ value: null } as unknown as KpiData).amount, "0");
    assertEquals(kpiParts({ value: NaN } as KpiData).amount, "0");
    assertEquals(
      kpiParts({ value: "1200.5" } as unknown as KpiData).amount,
      "1,200.50",
    );
    assertEquals(formatDeltaValue({ deltaValue: undefined }), "");
    assertEquals(
      formatDeltaValue({ deltaValue: null as unknown as number }),
      "",
    );
  });
});

Deno.test("kpi format - locale follows the host, never a constant", () => {
  const data = { value: 6200, currency: "EUR" } as KpiData;
  assertEquals(withLocale("en-US", () => kpiParts(data).amount), "6,200.00");
  assertEquals(
    plain(withLocale("fr-FR", () => kpiParts(data).amount)),
    "6 200,00",
  );
});

Deno.test("kpi secondary - every locale resolves both labels (no raw key leaks)", () => {
  for (const locale of ["en", "fr", "zh", "zh-Hant", "hi", "bn", "ta", "ur"]) {
    const tr = translatorForLocale(locale);
    const count = kpiSecondary(
      { secondary: { kind: "invoice_count", value: 3 } } as KpiData,
      tr,
    );
    const amount = kpiSecondary(
      { secondary: { kind: "amount", value: 3, currency: "EUR" } } as KpiData,
      tr,
    );
    assert(count && !count.label.startsWith("kpi."), locale);
    assert(amount && !amount.label.startsWith("kpi."), locale);
  }
});
