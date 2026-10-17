import { assert, assertEquals } from "@std/assert";
import { allTools } from "./mod.ts";
import { withUiRefreshRequest } from "./ui-refresh.ts";
import {
  modelVisiblePayload,
  splitViewerResult,
  VIEWER_ONLY_RESULT_KEYS,
} from "./model-visible.ts";

Deno.test("model visible - drops viewer keys and keeps domain data", () => {
  const result = {
    doctype: "Sales Invoice",
    count: 1,
    data: [{ name: "SINV-001", _assign: "[]" }],
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    refreshRequest: { toolName: "erpnext_sales_invoice_list", arguments: {} },
    _availableTools: ["erpnext_sales_invoice_get"],
  };

  assertEquals(modelVisiblePayload(result), {
    doctype: "Sales Invoice",
    count: 1,
    // Les champs ERPNext imbriqués (`_assign`…) sont des données : intacts.
    data: [{ name: "SINV-001", _assign: "[]" }],
  });
  // Le résultat de la vue n'est pas muté.
  assert(result._availableTools);
});

Deno.test("split viewer result - data keeps domain keys, viewer keeps enrichment", () => {
  const result = {
    doctype: "Sales Invoice",
    data: [{ name: "SINV-001" }],
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    refreshRequest: { toolName: "erpnext_sales_invoice_list", arguments: {} },
    _availableTools: ["erpnext_sales_invoice_get"],
    _jumps: { number: { label: "Open", tool: "t", args: {}, kind: "list" } },
  };

  const { data, viewer } = splitViewerResult(result);

  assertEquals(data, {
    doctype: "Sales Invoice",
    data: [{ name: "SINV-001" }],
  });
  // Exactement les clés viewer présentes, `_meta` excepté.
  assertEquals(viewer, {
    refreshRequest: { toolName: "erpnext_sales_invoice_list", arguments: {} },
    _availableTools: ["erpnext_sales_invoice_get"],
    _jumps: { number: { label: "Open", tool: "t", args: {}, kind: "list" } },
  });
  // Le résultat d'origine n'est pas muté.
  assert(result.refreshRequest);
  assert(result._meta);
});

Deno.test("split viewer result - no enrichment yields an empty viewer block", () => {
  const { data, viewer } = splitViewerResult({ data: { name: "BOM-001" } });
  assertEquals(data, { data: { name: "BOM-001" } });
  assertEquals(viewer, {});
});

Deno.test("model visible - every key the viewer enrichment adds is viewer-only", () => {
  const now = new Date(2026, 9, 17);
  const names = new Set(allTools.map((tool) => tool.name));
  const added = new Set<string>();

  for (const tool of allTools) {
    const resourceUri = tool._meta?.ui?.resourceUri;
    if (!resourceUri) continue;
    const payloads = [
      // Liste, graphique, KPI, funnel, kanban. « Oct 26 » est un mois du
      // compte de résultat à `now` : il produit les sauts par série.
      { doctype: "Sales Invoice", data: [], labels: ["Oct 26"], value: 1 },
      // Fiche (`_get`) : le doctype est porté par le document.
      { data: { doctype: "Sales Invoice", name: "SINV-001" } },
    ];
    for (const payload of payloads) {
      const result = { ...payload, _meta: { ui: { resourceUri } } };
      const enriched = withUiRefreshRequest(
        result,
        tool.name,
        {},
        now,
        names,
      ) as Record<string, unknown>;
      for (const key of Object.keys(enriched)) {
        if (!(key in result)) added.add(key);
      }
    }
  }

  const viewerOnly = new Set<string>(VIEWER_ONLY_RESULT_KEYS);
  for (const key of added) {
    assert(
      viewerOnly.has(key),
      `${key} is added for the viewer but would leak into the model text`,
    );
  }
  // Garde-fou : le balayage exerce bien les enrichissements principaux.
  for (
    const key of [
      "refreshRequest",
      "_availableTools",
      "_rowAction",
      "_sendMessageHints",
      "_drillDown",
      "_trendDrillDown",
      "_jumps",
      "_stageJumps",
      "_pointJumps",
      "_seriesPointJumps",
    ]
  ) {
    assert(added.has(key), `sweep never produced ${key}`);
  }
});
