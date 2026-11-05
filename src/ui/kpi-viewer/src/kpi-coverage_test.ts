import { assert, assertEquals } from "@std/assert";
import type { ValuationCoverage } from "../../kpi-coverage.ts";
import { setLocaleSource } from "../../shared/format.ts";
import { SUPPORTED_LANGS, translatorForLocale } from "../../shared/i18n.ts";
import {
  KPI_PARTIAL_MARGIN_FIXTURE,
  KPI_PARTIAL_ZERO_FIXTURE,
} from "./fixture.ts";
import { hasValuationCoverage, valuationCoverage } from "./kpi-coverage.ts";
import {
  kpiLabel,
  kpiNumberSummary,
  kpiParts,
  kpiSecondary,
  kpiSecondaryText,
} from "./kpi-format.ts";
import type { KpiData } from "./types.ts";

const en = translatorForLocale("en-US");
const fr = translatorForLocale("fr-FR");
function payload(overrides: Partial<ValuationCoverage> = {}): KpiData {
  return {
    ...KPI_PARTIAL_MARGIN_FIXTURE,
    secondary: {
      ...KPI_PARTIAL_MARGIN_FIXTURE.secondary!,
      ...overrides,
    } as KpiData["secondary"],
  };
}

Deno.test("partial KPI - visible qualification travels with the number into model context", () => {
  const data = payload();
  const secondary = kpiSecondary(data, en)!;
  assertEquals(secondary, {
    label: "Revenue covered",
    value: "75% of revenue · 25% uncosted",
  });
  const context = kpiNumberSummary(data, en);
  assertEquals(context.label, "Margin on costed lines");
  assertEquals(
    context.value,
    "35 % · Revenue covered: 75% of revenue · 25% uncosted",
  );
  assert(context.value.includes(kpiSecondaryText(data, en)!));
  assertEquals(kpiParts({ ...data, value: 0 }), { amount: "0", unit: "%" });
});

Deno.test("partial KPI - zero-price excluded lines remain explicit at 100 percent revenue coverage", () => {
  const text = kpiSecondaryText(KPI_PARTIAL_ZERO_FIXTURE, en)!;
  assert(text.includes("100% of revenue"));
  assert(text.includes("Lines without a known cost: 2"));
  assertEquals(
    kpiLabel(KPI_PARTIAL_ZERO_FIXTURE, en),
    "Margin on costed lines",
  );
  assert(kpiNumberSummary(KPI_PARTIAL_ZERO_FIXTURE, en).value.includes(text));
});

Deno.test("partial KPI - small positive excluded revenue never rounds into full coverage", () => {
  for (const uncostedRevenue of [0.01, 1e-300]) {
    const costedRevenue = 30_000;
    const data = payload({
      value: costedRevenue / (costedRevenue + uncostedRevenue) * 100,
      costedRevenue,
      uncostedRevenue,
      missingValuations: [
        {
          item_code: "SMALL",
          warehouse: "WAREHOUSE",
          stock_uom: "Nos",
          revenue: uncostedRevenue,
          lineCount: 100,
        },
      ],
      missingValuationCount: 1,
      missingItemCount: 1,
    });
    const text = kpiSecondaryText(data, en)!;
    assert(text.includes(">99.9% of revenue"));
    assert(text.includes("<0.1% uncosted"));
  }
});

Deno.test("partial KPI - coverage remains localized in the displayed and model text", () => {
  setLocaleSource(() => "fr-FR");
  try {
    const context = kpiNumberSummary(payload(), fr);
    assertEquals(context.label, "Marge sur les lignes valorisées");
    assert(context.value.includes("75 % du CA"));
    assert(context.value.includes("25 % sans coût connu"));
    const data = payload({
      value: 75.5,
      costedRevenue: 30_200,
      uncostedRevenue: 9_800,
      missingValuations: [
        {
          item_code: "SKU",
          warehouse: "WH",
          stock_uom: "Nos",
          revenue: 9_800,
          lineCount: 100,
        },
      ],
      missingItemCount: 1,
      missingValuationCount: 1,
    });
    assert(kpiSecondaryText(data, fr)?.includes("75,5"));
  } finally {
    setLocaleSource(() => undefined);
  }
});

Deno.test("partial KPI - malformed coverage never presents an unqualified margin", () => {
  const invalid: Record<string, unknown>[] = [
    { value: null },
    { value: NaN },
    { value: 101 },
    { value: 25 },
    { currency: "" },
    { costedRevenue: 0 },
    { uncostedRevenue: -1 },
    { uncostedLineCount: 0 },
    { costedLineCount: 1.5 },
    { missingItemCount: 3 },
    { missingValuationCount: 101 },
    { missingValuations: undefined },
    { missingValuations: [] },
    { omittedValuationCount: 1 },
    {
      missingValuations: [{
        item_code: "SKU",
        warehouse: "WH",
        stock_uom: "Nos",
        revenue: null,
        lineCount: 100,
      }],
    },
  ];
  for (const fields of invalid) {
    const data = payload(fields as Partial<ValuationCoverage>);
    assert(hasValuationCoverage(data));
    assertEquals(valuationCoverage(data), undefined);
    assertEquals(kpiParts(data), { amount: "—", unit: "" });
    assertEquals(kpiSecondaryText(data, en), "Partial: Coverage unavailable");
    assert(kpiNumberSummary(data, en).value.includes("Coverage unavailable"));
  }
  assertEquals(kpiParts({ ...payload(), value: null as unknown as number }), {
    amount: "—",
    unit: "",
  });
});

Deno.test("partial KPI - bounded detail list carries complete totals without claiming all items are shown", () => {
  const data = payload({
    missingValuationCount: 21,
    missingItemCount: 21,
    omittedValuationCount: 19,
    missingValuations: [
      {
        item_code: "A",
        warehouse: "WH",
        stock_uom: "Nos",
        revenue: 8_000,
        lineCount: 40,
      },
      {
        item_code: "B",
        warehouse: "WH",
        stock_uom: "Nos",
        revenue: 2_000,
        lineCount: 40,
      },
    ],
  });
  assert(valuationCoverage(data));
  assertEquals(
    kpiNumberSummary(data, en).value,
    kpiNumberSummary(payload(), en).value,
  );
  const repeated = structuredClone(payload());
  const coverage = repeated.secondary as ValuationCoverage;
  coverage.missingValuations[1] = { ...coverage.missingValuations[0] };
  assertEquals(valuationCoverage(repeated), undefined);
});

Deno.test("partial KPI - every supported language resolves coverage without raw key leaks", () => {
  for (const locale of SUPPORTED_LANGS) {
    const t = translatorForLocale(locale);
    const context = kpiNumberSummary(payload(), t);
    assert(!context.label.startsWith("kpi."));
    assert(!context.value.includes("kpi.coverage"));
    assert(!context.value.includes("{covered}"));
    assert(!context.value.includes("{uncovered}"));
  }
});

Deno.test("partial KPI - ordinary and unknown secondary cards preserve their contract", () => {
  const full: KpiData = {
    label: "Gross Margin",
    value: 35,
    unit: "%",
    trend: "up",
  };
  assertEquals(kpiNumberSummary(full, en), {
    label: "Gross Margin",
    value: "35 %",
  });
  assertEquals(hasValuationCoverage(full), false);
  const unknown = {
    ...full,
    secondary: { kind: "future", value: 75 },
  } as unknown as KpiData;
  assertEquals(kpiSecondary(unknown, en), undefined);
  assertEquals(kpiNumberSummary(unknown, en), kpiNumberSummary(full, en));
});
