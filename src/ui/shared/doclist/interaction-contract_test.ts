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
