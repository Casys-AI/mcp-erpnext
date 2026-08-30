import { assertEquals, assertMatch } from "@std/assert";
import {
  nestedChartContextCandidates,
  nestedChartContextId,
  nestedChartContextItem,
} from "./nested-chart-interaction.ts";

Deno.test("nested chart context - stable identity and compact formatted point", () => {
  const chart = {
    labels: ["Laptop"],
    datasets: [{ label: "Margin %", values: [40], unit: "%" }],
  };
  const chartId = nestedChartContextId("Sales", "Gross Profit");
  const item = nestedChartContextItem(chart, chartId, "Sales", 0, 0);

  assertEquals(chartId, "chart:Sales:Gross%20Profit");
  assertEquals(item, {
    id: "chart:Sales:Gross%20Profit:point:Laptop:Margin%20%25",
    view: "Sales",
    reconcileKey: "chart:Sales:Gross%20Profit",
    label: "Laptop · Margin %",
    value: "40%",
  });
});

Deno.test("nested chart context - all label and series pairs are candidates", () => {
  const chart = {
    labels: ["A", "B"],
    datasets: [
      { label: "Revenue", values: [10, 20], currency: "EUR" },
      { label: "Units", values: [1, 2] },
    ],
  };
  const candidates = nestedChartContextCandidates(
    chart,
    nestedChartContextId("Sales", "Mix"),
    "Sales",
  );

  assertEquals(candidates.length, 4);
  assertEquals(candidates.map((candidate) => candidate.label), [
    "A · Revenue",
    "A · Units",
    "B · Revenue",
    "B · Units",
  ]);
  assertMatch(candidates[0].value!, /10/);
});

Deno.test("nested chart context - invalid coordinates do not invent a point", () => {
  const chart = {
    labels: ["A"],
    datasets: [{ label: "Revenue", values: [10] }],
  };
  assertEquals(
    nestedChartContextItem(chart, "chart:test", "Sales", 1, 0),
    null,
  );
  assertEquals(
    nestedChartContextItem(chart, "chart:test", "Sales", 0, 1),
    null,
  );
});
