import { assertEquals } from "@std/assert";
import { chartOf, listOf, recordOf } from "./bodies.ts";

Deno.test("recordOf - { data: {...} }, l'objet lui-même, jamais un tableau", () => {
  assertEquals(recordOf({ data: { name: "X" } }), { name: "X" });
  assertEquals(recordOf({ name: "X" }), { name: "X" });
  assertEquals(recordOf({ data: [1] }), null);
  assertEquals(recordOf(null), null);
  assertEquals(recordOf("x"), null);
});

Deno.test("chartOf - labels + values, ou la première série d'un outil graphique", () => {
  assertEquals(chartOf({ labels: ["a"], values: [1] })?.values, [1]);
  assertEquals(
    chartOf({
      labels: ["a", "b"],
      datasets: [{ values: [1, 2] }, { values: [3, 4] }],
    })
      ?.values,
    [1, 2],
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

Deno.test("listOf - seulement { data: [...] }", () => {
  assertEquals(listOf({ data: [] }) !== null, true);
  assertEquals(listOf({ data: {} }), null);
  assertEquals(listOf(null), null);
});
