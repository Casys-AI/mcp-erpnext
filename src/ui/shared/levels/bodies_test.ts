import { assertEquals } from "@std/assert";
import {
  chartHintAt,
  chartOf,
  chartSeriesFormat,
  chartSeriesType,
  listOf,
  recordOf,
} from "./bodies.ts";

Deno.test("recordOf - { data: {...} }, l'objet lui-même, jamais un tableau", () => {
  assertEquals(recordOf({ data: { name: "X" } }), { name: "X" });
  assertEquals(recordOf({ name: "X" }), { name: "X" });
  assertEquals(recordOf({ data: [1] }), null);
  assertEquals(recordOf(null), null);
  assertEquals(recordOf("x"), null);
});

Deno.test("chartOf - labels + values devient une série simple", () => {
  assertEquals(
    chartOf({ title: "Total", labels: ["a"], values: [1] })?.datasets,
    [
      {
        label: "Total",
        values: [1],
        color: undefined,
        type: undefined,
        stack: undefined,
        yAxisId: undefined,
        showDots: undefined,
        strokeStyle: undefined,
        unit: undefined,
        currency: undefined,
      },
    ],
  );
});

Deno.test("chartOf - conserve toutes les séries et leur présentation", () => {
  assertEquals(
    chartOf({
      labels: ["a", "b"],
      datasets: [
        { label: "Income", values: [1, 2], color: "#4ade80" },
        { label: "Expenses", values: [3, 4], color: "#f87171" },
        {
          label: "Net Profit",
          values: [-2, 2],
          color: "#60a5fa",
          type: "line",
          yAxisId: "right",
          showDots: true,
        },
      ],
      type: "composed",
      currency: "EUR",
      xAxisLabel: "Month",
      yAxisLabel: "Amount",
      rightAxisLabel: "Net Profit",
      showRightAxis: true,
    }),
    {
      labels: ["a", "b"],
      datasets: [
        {
          label: "Income",
          values: [1, 2],
          color: "#4ade80",
          type: undefined,
          stack: undefined,
          yAxisId: undefined,
          showDots: undefined,
          strokeStyle: undefined,
          unit: undefined,
          currency: undefined,
        },
        {
          label: "Expenses",
          values: [3, 4],
          color: "#f87171",
          type: undefined,
          stack: undefined,
          yAxisId: undefined,
          showDots: undefined,
          strokeStyle: undefined,
          unit: undefined,
          currency: undefined,
        },
        {
          label: "Net Profit",
          values: [-2, 2],
          color: "#60a5fa",
          type: "line",
          stack: undefined,
          yAxisId: "right",
          showDots: true,
          strokeStyle: undefined,
          unit: undefined,
          currency: undefined,
        },
      ],
      type: "composed",
      unit: undefined,
      currency: "EUR",
      xAxisLabel: "Month",
      yAxisLabel: "Amount",
      rightAxisLabel: "Net Profit",
      showRightAxis: true,
      pointJumps: undefined,
      seriesPointJumps: undefined,
    },
  );
});

Deno.test("chartOf - ignore une série mal formée et normalise ses valeurs", () => {
  assertEquals(
    chartOf({
      labels: ["a", "b"],
      datasets: [
        null,
        { label: "Broken" },
        { label: "Valid", values: ["2", "not-a-number"] },
      ],
    })?.datasets,
    [{
      label: "Valid",
      values: [2, 0],
      color: undefined,
      type: undefined,
      stack: undefined,
      yAxisId: undefined,
      showDots: undefined,
      strokeStyle: undefined,
      unit: undefined,
      currency: undefined,
    }],
  );
  assertEquals(chartOf({ labels: ["a"] }), null);
  assertEquals(chartOf({ values: [1] }), null);
});

Deno.test("chartOf - garde les sauts par libellé du serveur", () => {
  const body = {
    labels: ["Aug 26"],
    values: [1],
    _pointJumps: {
      "Aug 26": { label: "Aug 26", tool: "erpnext_doc_list", args: {} },
    },
  };
  assertEquals(chartOf(body)?.pointJumps?.["Aug 26"].tool, "erpnext_doc_list");
  assertEquals(chartOf({ labels: ["a"], values: [1] })?.pointJumps, undefined);
});

Deno.test("chartOf - P&L garde les sauts exacts Income/Expenses par série", () => {
  const income = { label: "Income", tool: "erpnext_doc_list", args: {} };
  const expenses = { label: "Expenses", tool: "erpnext_doc_list", args: {} };
  const chart = chartOf({
    type: "composed",
    labels: ["Aug 26"],
    datasets: [
      { label: "Income", values: [20], type: "bar" },
      { label: "Expenses", values: [7], type: "bar" },
      {
        label: "Net Profit",
        values: [13],
        type: "line",
        yAxisId: "right",
      },
    ],
    _seriesPointJumps: {
      "Aug 26": { Income: income, Expenses: expenses },
    },
  })!;

  assertEquals(chartHintAt(chart, 0, 0), income);
  assertEquals(chartHintAt(chart, 0, 1), expenses);
  assertEquals(chartHintAt(chart, 0, 2), undefined);
  assertEquals(chartSeriesType(chart, chart.datasets[2]), "line");
});

Deno.test("chartOf - Gross Profit garde Margin comme ligne droite en pourcentage", () => {
  const chart = chartOf({
    type: "composed",
    labels: ["Laptop"],
    datasets: [
      { label: "Revenue", values: [5000], type: "bar", stack: "sales" },
      {
        label: "Margin %",
        values: [40],
        type: "line",
        yAxisId: "right",
        showDots: true,
      },
    ],
    currency: "EUR",
    yAxisLabel: "Revenue",
    rightAxisLabel: "Margin %",
    showRightAxis: true,
  })!;

  assertEquals(chart.type, "composed");
  assertEquals(chart.datasets[0].stack, "sales");
  assertEquals(chartSeriesType(chart, chart.datasets[0]), "bar");
  assertEquals(chartSeriesType(chart, chart.datasets[1]), "line");
  assertEquals(chart.datasets[1].yAxisId, "right");
  assertEquals(chartSeriesFormat(chart, chart.datasets[0]), {
    currency: "EUR",
  });
  assertEquals(chartSeriesFormat(chart, chart.datasets[1]), { unit: "%" });
});

Deno.test("listOf - seulement { data: [...] }", () => {
  assertEquals(listOf({ data: [] }) !== null, true);
  assertEquals(listOf({ data: {} }), null);
  assertEquals(listOf(null), null);
});
