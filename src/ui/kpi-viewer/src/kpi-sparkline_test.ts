import { assertEquals } from "@std/assert";
import {
  ACTIVE_CONTEXT_VERSION,
  activeContextSnapshot,
} from "../../shared/active-context.ts";
import {
  kpiBarPeriods,
  kpiInspectedIndex,
  kpiSparklinePeriod,
  kpiSparklinePoints,
  kpiTrendContextResource,
} from "./kpi-sparkline.ts";

Deno.test("kpi sparkline - pairs each value with its explicit month", () => {
  const points = kpiSparklinePoints({
    sparkline: [120, 180, 210],
    sparklineLabels: ["Jun 26", "Jul 26", "Aug 26"],
  });

  assertEquals(points, [
    { index: 0, label: "Jun 26", value: 120 },
    { index: 1, label: "Jul 26", value: 180 },
    { index: 2, label: "Aug 26", value: 210 },
  ]);
  assertEquals(kpiSparklinePeriod(points), "Jun 26 – Aug 26");
});

Deno.test("kpi sparkline - never invents labels for a legacy or malformed payload", () => {
  assertEquals(kpiSparklinePoints({ sparkline: [120, 180] }), []);
  assertEquals(
    kpiSparklinePoints({
      sparkline: [120, 180],
      sparklineLabels: ["Aug 26"],
    }),
    [],
  );
  assertEquals(kpiSparklinePeriod([]), undefined);
  assertEquals(
    kpiTrendContextResource({
      label: "Revenue MTD",
      sparkline: [120, 180],
    }),
    undefined,
  );
  assertEquals(
    kpiTrendContextResource({
      label: "Revenue MTD",
      sparkline: [120, 180],
      sparklineLabels: ["Aug 26"],
    }),
    undefined,
  );
});

Deno.test("kpi sparkline - whole trend shares aligned labels, values and provenance", () => {
  const data = {
    label: "Revenue MTD",
    sparkline: [120, 180, 210.5],
    sparklineLabels: ["Jun 26", "Jul 26", "Aug 26"],
    currency: "EUR",
  };
  const resource = kpiTrendContextResource(data);
  assertEquals(resource?.mimeType, "application/json");
  assertEquals(
    resource?.uri,
    "ui://mcp-erpnext/kpi-viewer/context/kpi%3ARevenue%20MTD%3Atrend",
  );

  const payload = JSON.parse(
    new TextDecoder().decode(resource?.bytes ?? new Uint8Array()),
  );
  assertEquals(payload, {
    title: "Revenue MTD",
    subtitle: "Jun 26 – Aug 26",
    type: "line",
    labels: ["Jun 26", "Jul 26", "Aug 26"],
    datasets: [{
      label: "Revenue MTD",
      values: [120, 180, 210.5],
      currency: "EUR",
    }],
  });
  assertEquals(payload.datasets[0].values, data.sparkline);
  assertEquals(resource?.textFallback, JSON.stringify(payload));

  const snapshot = activeContextSnapshot([{
    id: "kpi:Revenue MTD:trend",
    view: "KPI",
    label: "Revenue MTD · trend →",
    value: "Jun 26 – Aug 26 · 210,50 €",
    resource,
  }]);
  assertEquals(snapshot.version, ACTIVE_CONTEXT_VERSION);
  assertEquals(snapshot.items.map((item) => item.id), [
    "kpi:Revenue MTD:trend",
  ]);
  assertEquals("resource" in snapshot.items[0], false);
  assertEquals(JSON.stringify(snapshot).includes("textFallback"), false);
  assertEquals(JSON.stringify(snapshot).includes("210.5"), false);
});

Deno.test("kpi sparkline - unit-only series keeps the declared unit, never a currency", () => {
  const resource = kpiTrendContextResource({
    label: "Win rate",
    sparkline: [40, 55],
    sparklineLabels: ["Jul 26", "Aug 26"],
    unit: "%",
  });
  const payload = JSON.parse(
    new TextDecoder().decode(resource?.bytes ?? new Uint8Array()),
  );
  assertEquals(payload.datasets[0], {
    label: "Win rate",
    values: [40, 55],
    unit: "%",
  });
  assertEquals("currency" in payload.datasets[0], false);
});

Deno.test("inspecting a KPI point follows identity across refresh and never treats a combined or expired period as a month", () => {
  const labels = ["Oct 26", "Nov 26"];
  const october = { date_from: "2026-10-01", date_to: "2026-10-31" };
  const november = { date_from: "2026-11-01", date_to: "2026-11-26" };
  const range = { date_from: october.date_from, date_to: november.date_to };
  const months = kpiBarPeriods([october, november], 2);
  assertEquals(kpiInspectedIndex(labels, months, undefined, labels[1]), 1);
  assertEquals(
    kpiInspectedIndex(labels.slice(1), undefined, undefined, labels[1]),
    0,
  );
  assertEquals(kpiInspectedIndex(labels, months, october, labels[1]), 0);
  assertEquals(kpiInspectedIndex(labels, months, null, labels[1]), -1);
  assertEquals(kpiInspectedIndex(labels, months, range, labels[1]), -1);
  assertEquals(
    kpiInspectedIndex(
      labels,
      months,
      { ...november, date_to: "2026-11-27" },
      labels[1],
    ),
    -1,
  );
  assertEquals(kpiBarPeriods([october], 2), undefined);
  assertEquals(
    kpiBarPeriods([october, { ...november, date_to: "2026-11-31" }], 2),
    undefined,
  );
});
