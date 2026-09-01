import {
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "@std/assert";
import { doclistDetailPanelId } from "./detail-panel.ts";

Deno.test("doclist detail id is stable and safe for aria-controls", () => {
  assertEquals(
    doclistDetailPanelId("ACC-SINV/2026 0001"),
    "doclist-row-ACC-SINV%2F2026%200001-detail",
  );
  assertNotEquals(
    doclistDetailPanelId("ACC-SINV/2026 0001"),
    doclistDetailPanelId("ACC-SINV 2026/0001"),
  );
});

Deno.test("doclist re-scrolls the internal scroller when the detail envelope arrives", async () => {
  const body = await Deno.readTextFile(
    new URL("./DoclistBody.tsx", import.meta.url),
  );

  // Le chemin asynchrone pose `{ id, loading: true }` puis l'enveloppe :
  // `id` ne change pas, `loading` si. Sans ça le scroll vise le squelette.
  assertStringIncludes(body, "[expanded.id, expanded.loading]");
  assertStringIncludes(body, "nearestScrollDelta(");
  assertStringIncludes(body, "scroller.scrollTo({");
  assertStringIncludes(body, "ref={scrollerRef}");
  assertStringIncludes(
    body,
    'class="scroll-slim min-h-0 flex-1 overflow-y-auto"',
  );
  assertEquals(
    body.includes(".scrollIntoView") || body.includes("scrollIntoView("),
    false,
    "scrollIntoView remonterait jusqu'à l'iframe hôte",
  );
});

Deno.test("doclist closes detail when the expanded row leaves the current page", async () => {
  const body = await Deno.readTextFile(
    new URL("./DoclistBody.tsx", import.meta.url),
  );

  // Le tableau rend `pageRows` ; la fermeture doit chercher au même endroit.
  // Chercher dans `rows` laisserait `expandedId` sur un panneau démonté.
  assertStringIncludes(
    body,
    "const row = pageRows.find((r, i) =>",
  );
  assertStringIncludes(body, "rows={list.pageRows}");
  assertEquals(
    body.includes("const row = rows.find((r, i) =>"),
    false,
    "la ligne ouverte se cherche dans pageRows, pas dans rows",
  );
  assertStringIncludes(body, "list.setExpandedId(null)");
});

Deno.test("doclist wires every layout chevron to the real inline panel", async () => {
  const body = await Deno.readTextFile(
    new URL("./DoclistBody.tsx", import.meta.url),
  );
  const table = await Deno.readTextFile(
    new URL("./DoclistTable.tsx", import.meta.url),
  );
  const detail = await Deno.readTextFile(
    new URL("./InlineDetailPanel.tsx", import.meta.url),
  );

  assertStringIncludes(
    body,
    "controls: isInspectable ? doclistDetailPanelId(rowId) : undefined",
  );
  assertStringIncludes(body, "<div id={doclistDetailPanelId(expandedId)}>");
  assertStringIncludes(body, "reconcileView(listContextKey, candidates)");
  assertStringIncludes(body, "contextKey={listContextKey}");
  assertStringIncludes(
    detail,
    "const childRowsContextKey = documentChildRowsReconcileKey(envelope)",
  );
  assertStringIncludes(detail, "rowIndex,\n            childRowsContextKey,");
  assertEquals(
    [...table.matchAll(/<RowDetailToggle target=\{interactionTarget\}/g)]
      .length,
    3,
  );
});
