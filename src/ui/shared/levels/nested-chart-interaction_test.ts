import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import {
  addActiveContextSelection,
  reconcileActiveContextViewSelections,
  removeActiveContextSelection,
} from "../active-context.ts";
import { currentLocale, setLocaleSource } from "../format.ts";
import { translatorForLocale } from "../i18n.ts";
import {
  createStack,
  currentLevel,
  levelKey,
  navLevelPresentation,
  pushLevel,
} from "../nav-stack.ts";
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
  const chartId = nestedChartContextId("Sales");
  const item = nestedChartContextItem(chart, chartId, "Sales", 0, 0);

  assertEquals(chartId, "chart:Sales");
  assertEquals(item, {
    id: "chart:Sales:point:Laptop:Margin%20%25",
    view: "Sales",
    reconcileKey: "chart:Sales",
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
    nestedChartContextId("Sales"),
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

Deno.test("nested chart context - une sélection reste surlignée, actualisée et retirable après changement de langue", () => {
  const previousLocale = currentLocale();
  let locale = "en-US";
  setLocaleSource(() => locale);
  try {
    const chart = {
      labels: ["Laptop"],
      datasets: [{ label: "Gross Profit", values: [1234.5], currency: "EUR" }],
    };
    const key = levelKey({
      name: "erpnext_gross_profit_chart",
      args: { company: "Casys" },
    });
    const stack = pushLevel(createStack({ title: "Sales", kind: "root" }), {
      title: "Gross profit by item",
      titleKey: "doclist.hint.gross_profit_items",
      kind: "chart",
      key,
      body: chart,
    });
    const raw = currentLevel(stack);
    const english = navLevelPresentation(raw, translatorForLocale("en"));
    const chartId = nestedChartContextId(english.key ?? english.id);
    const selected = nestedChartContextItem(
      chart,
      chartId,
      english.title,
      0,
      0,
    )!;
    const other = {
      id: "record:Task:TASK-001",
      view: "Tasks",
      label: "TASK-001",
    };
    let basket = addActiveContextSelection([], "root:sales", selected);
    basket = addActiveContextSelection(basket, "root:sales", other);

    locale = "fr-FR";
    const french = navLevelPresentation(raw, translatorForLocale("fr"));
    const translatedId = nestedChartContextId(french.key ?? french.id);
    const translated = nestedChartContextItem(
      chart,
      translatedId,
      french.title,
      0,
      0,
    )!;
    assertNotEquals(french.title, english.title);
    assertNotEquals(translated.value, selected.value);
    assertEquals(translated.id, selected.id);
    assertEquals(translated.reconcileKey, selected.reconcileKey);
    assertEquals(
      basket.some((selection) => selection.item.id === translated.id),
      true,
    );
    basket = reconcileActiveContextViewSelections(
      basket,
      "root:sales",
      translatedId,
      nestedChartContextCandidates(chart, translatedId, french.title),
    );
    assertEquals(basket.length, 2);
    assertEquals(basket[0].item.view, "Marge par article");
    assertEquals(basket[0].item.value, translated.value);
    basket = removeActiveContextSelection(basket, {
      scopeKey: "root:sales",
      item: translated,
    });
    assertEquals(basket.map((selection) => selection.item.id), [other.id]);
  } finally {
    setLocaleSource(() => previousLocale);
  }
});

Deno.test("nested chart context - même titre métier et niveau sans clé gardent une identité stable au reformatage", () => {
  const previousLocale = currentLocale();
  let locale = "en-US";
  setLocaleSource(() => locale);
  try {
    const chart = {
      labels: ["Laptop"],
      datasets: [{ label: "Revenue", values: [1234.5], currency: "EUR" }],
    };
    const stack = pushLevel(createStack({ title: "Sales", kind: "root" }), {
      title: "Casys revenue",
      kind: "chart",
      body: chart,
    });
    const level = currentLevel(stack);
    const chartId = nestedChartContextId(level.key ?? level.id);
    const selected = nestedChartContextItem(chart, chartId, level.title, 0, 0)!;
    const basket = addActiveContextSelection([], "root:sales", selected);
    locale = "fr-FR";
    const candidates = nestedChartContextCandidates(
      chart,
      chartId,
      level.title,
    );
    const updated = reconcileActiveContextViewSelections(
      basket,
      "root:sales",
      chartId,
      candidates,
    );
    assertEquals(updated.length, 1);
    assertEquals(updated[0].item.id, selected.id);
    assertEquals(updated[0].item.view, selected.view);
    assertNotEquals(updated[0].item.value, selected.value);
  } finally {
    setLocaleSource(() => previousLocale);
  }
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
