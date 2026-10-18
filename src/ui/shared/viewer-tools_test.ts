import { assertEquals } from "@std/assert";
import { createActiveContextController } from "./active-context-controller.ts";
import { activeContextChipNotices } from "./active-context-chip.ts";
import {
  canCallViewerTool,
  hasAvailableTool,
  hasExplicitAvailableTool,
  readAvailableTools,
} from "./viewer-tools.ts";

Deno.test("viewer tools : distingue payload 3.0.x et manifeste moderne invalide", () => {
  assertEquals(readAvailableTools(undefined), undefined);
  assertEquals(readAvailableTools({}), undefined);
  assertEquals(readAvailableTools({ _availableTools: "erpnext_doc_get" }), []);
  assertEquals(hasAvailableTool(undefined, "erpnext_doc_get"), true);
  assertEquals(hasAvailableTool([], "erpnext_doc_get"), false);
});

Deno.test("viewer tools : garde uniquement les noms valides et déduplique", () => {
  const tools = readAvailableTools({
    _availableTools: ["erpnext_doc_get", 42, "", "erpnext_doc_get"],
  });
  assertEquals(tools, ["erpnext_doc_get"]);
  assertEquals(hasAvailableTool(tools, "erpnext_doc_get"), true);
  assertEquals(hasAvailableTool(tools, "erpnext_doc_update"), false);
});

Deno.test("viewer tools : proxy et nom exact sont tous deux obligatoires", () => {
  const tools = ["erpnext_doc_get"];
  assertEquals(canCallViewerTool(true, tools, "erpnext_doc_get"), true);
  assertEquals(canCallViewerTool({}, tools, "erpnext_doc_get"), true);
  assertEquals(canCallViewerTool(false, tools, "erpnext_doc_get"), false);
  assertEquals(canCallViewerTool(undefined, tools, "erpnext_doc_get"), false);
  assertEquals(canCallViewerTool(true, tools, "erpnext_doc_update"), false);
  assertEquals(canCallViewerTool(true, undefined, "erpnext_doc_get"), true);
});

Deno.test("viewer tools : requête modèle exige un manifeste explicite, sans proxy hôte", () => {
  assertEquals(hasExplicitAvailableTool(undefined, "erpnext_doc_list"), false);
  assertEquals(hasExplicitAvailableTool([], "erpnext_doc_list"), false);
  assertEquals(
    hasExplicitAvailableTool(["erpnext_doc_list"], "erpnext_doc_list"),
    true,
  );
  assertEquals(
    hasExplicitAvailableTool(["erpnext_doc_list_extra"], "erpnext_doc_list"),
    false,
  );
});

Deno.test("viewer tools : neuf lignes deviennent une requête modèle sans serverTools", async () => {
  const capabilities = { updateModelContext: { structuredContent: {} } };
  const manifest = ["erpnext_doc_list"];
  const controller = createActiveContextController({
    getHostCapabilities: () => capabilities,
    updateModelContext: () => Promise.resolve({}),
    sendMessage: () => Promise.resolve({}),
  }, "root");
  assertEquals(
    canCallViewerTool(undefined, manifest, "erpnext_doc_list"),
    false,
  );
  await controller.actionsForScope("root").setGroupMembers(
    {
      reconcileKey: "invoices",
      doctype: "Sales Invoice",
      view: "Invoices",
      fields: ["name"],
      queryAvailable: hasExplicitAvailableTool(manifest, "erpnext_doc_list"),
    },
    Array.from(
      { length: 9 },
      (_, i) => ({
        name: `INV-${i}`,
        label: `INV-${i}`,
        fieldsSource: "row" as const,
      }),
    ),
  );
  const snapshot = controller.getSnapshot();
  assertEquals(snapshot.selections.length, 1);
  assertEquals(snapshot.selections[0].item.query?.selectedCount, 9);
  assertEquals(
    activeContextChipNotices(snapshot.selections, snapshot.selection).some((
      notice,
    ) => notice.startsWith("partly shared")),
    false,
  );
});

Deno.test("viewer tools : manifeste malformé ne permet jamais une requête", () => {
  for (
    const malformed of [
      "prefix_erpnext_doc_list_suffix",
      { includes: () => true },
      null,
      42,
    ]
  ) {
    assertEquals(
      hasExplicitAvailableTool(malformed, "erpnext_doc_list"),
      false,
    );
  }
});
