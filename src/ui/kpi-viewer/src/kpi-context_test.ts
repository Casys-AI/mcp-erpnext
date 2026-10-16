import { assertEquals } from "@std/assert";
import { translatorForLocale } from "../../shared/i18n.ts";
import { setLocaleSource } from "../../shared/format.ts";
import { kpiContextCandidates, kpiTrendContext } from "./kpi-context.ts";

Deno.test("KPI scalar has no redundant root selection", () => {
  assertEquals(
    kpiContextCandidates(
      { label: "Orders", value: 3 },
      translatorForLocale("en"),
    ),
    [],
  );
});

Deno.test("KPI selection identities survive locale changes and refresh values", () => {
  const data = {
    label: "Revenue",
    value: 210.5,
    currency: "EUR",
    sparkline: [120, 210.5],
    sparklineLabels: ["Jul 26", "Aug 26"],
  };
  try {
    setLocaleSource(() => "en-US");
    const initial = kpiContextCandidates(data, translatorForLocale("en"));
    setLocaleSource(() => "fr-FR");
    const localized = kpiContextCandidates(
      { ...data, sparkline: [120, 215] },
      translatorForLocale("fr"),
    );
    assertEquals(
      initial.map((item) => item.id),
      localized.map((item) => item.id),
    );
    assertEquals(initial.at(-1)?.value, "210.50 €");
    assertEquals(localized.at(-1)?.value, "215,00 €");
    assertEquals(initial.at(-1)?.label, "Revenue · Aug 26");
  } finally {
    setLocaleSource(() => undefined);
  }
});

Deno.test("KPI legacy trend stays selectable without inventing month identities", () => {
  const data = { label: "Revenue", value: 210, sparkline: [120, 210] };
  const t = translatorForLocale("en");
  const candidates = kpiContextCandidates(data, t);
  assertEquals(candidates.map((item) => item.id), [
    "kpi:Revenue:value",
    "kpi:Revenue:trend",
  ]);
  assertEquals(kpiTrendContext(data, t).resource, undefined);
});
