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

Deno.test("generic doclist detail only exposes explicit relation asks", async () => {
  const detail = await Deno.readTextFile(
    new URL("./InlineDetailPanel.tsx", import.meta.url),
  );

  assertStringIncludes(
    detail,
    "const hints = envelope.sendMessageHints ?? [];",
  );
  assertStringIncludes(detail, "? hints.flatMap((hint) => {");
  assertStringIncludes(
    detail,
    "if (!hint.message || rootJumpForHint(hint)) return [];",
  );
  assertStringIncludes(
    detail,
    "const message = fillTemplate(hint.message, vars);",
  );
  assertEquals(
    detail.includes("asks.push("),
    false,
    "a generic detail must not manufacture a prompt-producing fallback",
  );
  assertEquals(
    detail.includes('t("doclist.detail.full_detail_message"'),
    false,
    "Company and other generic details stay local when no relation hint exists",
  );
});

Deno.test("non-financial narrow lists use real columns without a fake due field", async () => {
  const table = await Deno.readTextFile(
    new URL("./DoclistTable.tsx", import.meta.url),
  );

  assertStringIncludes(
    table,
    "const mobileGrid = trailingKey ? MOBILE_GRID : MOBILE_GRID_WITHOUT_TRAILING;",
  );
  assertStringIncludes(table, ": columnLabel(columns, idKey)");
  assertStringIncludes(table, ": columnLabel(columns, labelKey)");
  assertStringIncludes(table, ": columnLabel(columns, trailingKey)");
  assertStringIncludes(
    table,
    "const trailingIsAmount = trailingKey !== undefined &&",
  );
  assertStringIncludes(table, "{trailingKey && (");
});

Deno.test("doclist checkbox selection uses the filtered sort before pagination and the group controller", async () => {
  const body = await Deno.readTextFile(
    new URL("./DoclistBody.tsx", import.meta.url),
  );
  assertStringIncludes(body, "list.sorted.flatMap(");
  assertStringIncludes(body, "context?.supported && data.doctype");
  assertStringIncludes(body, '"erpnext_doc_list"');
  assertStringIncludes(body, "context.toggleGroupMember(groupConfig, member)");
  assertStringIncludes(body, "context.addGroupMembers(");
  assertStringIncludes(body, "context.removeGroupMembers(");
  assertStringIncludes(body, "extendDoclistRange(");
  assertStringIncludes(body, "doclistFilteredSelectionOperation(");
  assertEquals(body.includes("if (context.pending) return"), false);
  assertStringIncludes(body, "context.isSelected(item)");
  assertEquals(body.includes("context.isGroupMemberSelected("), false);
  assertStringIncludes(body, "hasExplicitAvailableTool(");
  assertStringIncludes(body, "complete: isDoclistResultComplete(data)");
  // Les gestes de ligne restent ceux de la sélection unitaire et du détail.
  assertStringIncludes(body, "context?.toggleReversible(item)");
  assertStringIncludes(body, "context?.toggle(item)");
});

Deno.test("doclist exposes isolated native checkboxes in every layout", async () => {
  const table = await Deno.readTextFile(
    new URL("./DoclistTable.tsx", import.meta.url),
  );
  assertStringIncludes(table, 'type="checkbox"');
  assertStringIncludes(
    table,
    'aria-checked={indeterminate ? "mixed" : checked}',
  );
  assertStringIncludes(table, "input.indeterminate = indeterminate");
  assertStringIncludes(table, "doclistCheckboxEvents(");
  assertStringIncludes(table, "`Select ${name}`");
  assertStringIncludes(
    table,
    "`Select all ${selection.totalCount} filtered rows`",
  );
  assertEquals([...table.matchAll(/<RowSelectionCheckbox\s/g)].length, 3);
  assertEquals([...table.matchAll(/<HeaderSelectionCheckbox\s/g)].length, 3);
  assertStringIncludes(
    table.replace(/\s+/g, " "),
    "columns.length + (hasDetailControls ? 1 : 0) + (selection ? 1 : 0)",
  );
});

Deno.test("doclist checkbox hit areas cover the cell and remain active during ACK", async () => {
  const table = await Deno.readTextFile(
    new URL("./DoclistTable.tsx", import.meta.url),
  );
  assertStringIncludes(table, "<label");
  assertStringIncludes(table, "min-h-10 min-w-10");
  assertStringIncludes(table, "[&>label]:absolute [&>label]:inset-0");
  assertEquals(table.includes("disabled={selection.pending"), false);
  assertEquals(table.includes("selection.pending ||"), false);
  assertStringIncludes(table, "doclistCheckboxEvents(() => {})");
  assertStringIncludes(table, "checked={selection.isSelected(row, index)}");
});

Deno.test("all viewer context adapters expose relative group actions", async () => {
  for (
    const viewer of [
      "chart",
      "doc",
      "doclist",
      "funnel",
      "invoice",
      "kanban",
      "kpi",
      "stock",
    ]
  ) {
    const className = viewer === "kpi"
      ? "Kpi"
      : viewer[0].toUpperCase() + viewer.slice(1);
    const source = await Deno.readTextFile(
      new URL(
        `../../${viewer}-viewer/src/${className}Viewer.tsx`,
        import.meta.url,
      ),
    );
    assertEquals(
      source.includes("addGroupMembers: activeContext.addGroupMembers"),
      true,
      `${viewer} forwards addGroupMembers`,
    );
    assertEquals(
      source.includes("removeGroupMembers: activeContext.removeGroupMembers"),
      true,
      `${viewer} forwards removeGroupMembers`,
    );
    assertEquals(
      source.includes("onRemoveGroup={activeContext.removeGroup}"),
      true,
      `${viewer} forwards group removal`,
    );
  }
});

Deno.test("doclist row modifiers share checkbox actions and platform detection in every layout", async () => {
  const table = await Deno.readTextFile(
    new URL("./DoclistTable.tsx", import.meta.url),
  );
  const body = await Deno.readTextFile(
    new URL("./DoclistBody.tsx", import.meta.url),
  );
  assertEquals(
    [...table.matchAll(
      /\.\.\.rowInteractionProps\(\s*interactionTarget,\s*id,\s*raw,\s*index,\s*selection,\s*clickIntent,?\s*\)/g,
    )].length,
    3,
  );
  assertStringIncludes(table, "doclistRowEvents(");
  assertStringIncludes(table, "platform: getBrowserPlatform()");
  assertStringIncludes(table, "selection.onToggle(row, index, shiftKey)");
  assertStringIncludes(
    body,
    "selectionAnchor.current = { key: listContextKey, name: member.name }",
  );
  assertStringIncludes(body, "filteredMembers,");
  assertStringIncludes(body, "context.addGroupMembers(");
  assertStringIncludes(body, "context.toggleGroupMember(groupConfig, member)");
});
