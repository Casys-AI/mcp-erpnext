import { assertEquals } from "@std/assert";
import {
  canCallViewerTool,
  hasAvailableTool,
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
