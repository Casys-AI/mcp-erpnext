import { assertEquals } from "@std/assert";
import {
  bodyFromResult,
  canJump,
  fillTemplate,
  hasUnfilledTemplate,
  hintLabel,
  jumpFromHint,
  jumpLabel,
  levelFromJump,
  loadLevelBody,
} from "./jumps.ts";
import { setLangSource, translatorForLocale } from "./i18n.ts";
import { navLevelSubtitle, navLevelTitle } from "./nav-stack.ts";

const HINT = {
  key: "payments",
  label: "Payments",
  message: "Show payment entries for invoice {id}",
  tool: "erpnext_doc_list",
  args: {
    doctype: "Payment Entry",
    filters: [["Payment Entry Reference", "reference_name", "=", "{id}"]],
  },
};

Deno.test("jumps : l'hôte doit relayer les outils", () => {
  assertEquals(canJump({ serverTools: {} }), true);
  assertEquals(canJump({}), false);
  assertEquals(canJump(undefined), false);
});

Deno.test("jumps : fillTemplate remplit chaînes et tableaux, laisse l'inconnu", () => {
  assertEquals(
    fillTemplate({ a: "{id}", b: [["x", "{id}"]], c: "{nope}", n: 1 }, {
      id: "X",
    }),
    { a: "X", b: [["x", "X"]], c: "{nope}", n: 1 },
  );
});

Deno.test("jumps : un hint avec outil devient un saut, libellé traduit", () => {
  setLangSource(() => "fr-FR");
  const jump = jumpFromHint(HINT, { id: "SINV-1" }, "liées à SINV-1");
  assertEquals(jump?.label, "Paiements");
  assertEquals(jump?.kind, "list");
  assertEquals(jump?.tool.args.filters, [[
    "Payment Entry Reference",
    "reference_name",
    "=",
    "SINV-1",
  ]]);
  assertEquals(jump?.message, "Show payment entries for invoice SINV-1");
  assertEquals(jump?.subtitle, "liées à SINV-1");
  assertEquals(hintLabel({ label: "Custom", message: "m" }), "Custom");
});

Deno.test("jumps : un hint sans outil reste une question", () => {
  assertEquals(
    jumpFromHint({ label: "Ask", message: "Tell me {id}" }, { id: "1" }),
    null,
  );
});

Deno.test("jumps : le niveau d'un saut part vide et en chargement", () => {
  const jump = jumpFromHint(HINT, { id: "SINV-1" })!;
  const level = levelFromJump(jump);
  assertEquals(level.title, "Paiements");
  assertEquals(level.kind, "list");
  assertEquals(level.loading, true);
  assertEquals(level.tool?.name, "erpnext_doc_list");
});

Deno.test("jumps : le corps se lit dans la réponse, le compte aussi", () => {
  setLangSource(() => "fr-FR");
  const ok = bodyFromResult({
    content: [{
      type: "text",
      text: JSON.stringify({ doctype: "X", count: 2, data: [{}, {}] }),
    }],
  });
  assertEquals(ok.count, 2);
  assertEquals((ok.body as { doctype: string }).doctype, "X");
  const noCount = bodyFromResult({
    content: [{ type: "text", text: JSON.stringify({ data: [{}, {}, {}] }) }],
  });
  assertEquals(noCount.count, 3);
  assertEquals(
    bodyFromResult({
      isError: true,
      content: [{ type: "text", text: "refusé" }],
    }).error,
    "refusé",
  );
  assertEquals(
    bodyFromResult({ content: [] }).error,
    "Aucun contenu renvoyé par l'outil",
  );
  assertEquals(
    bodyFromResult({ content: [{ type: "text", text: "{oops" }] }).error !==
      undefined,
    true,
  );
});

Deno.test("jumps : loadLevelBody n'appelle qu'une fois et absorbe les rejets", async () => {
  const calls: string[] = [];
  const host = {
    callServerTool: (p: { name: string }) => {
      calls.push(p.name);
      return Promise.resolve({
        content: [{
          type: "text" as const,
          text: JSON.stringify({ count: 1, data: [{}] }),
        }],
      });
    },
  };
  const loaded = await loadLevelBody(host, {
    name: "erpnext_doc_list",
    args: {},
  });
  assertEquals(loaded.count, 1);
  assertEquals(calls, ["erpnext_doc_list"]);
  const failing = { callServerTool: () => Promise.reject(new Error("boom")) };
  assertEquals(
    (await loadLevelBody(failing, { name: "x", args: {} })).error,
    "boom",
  );
});

Deno.test("jumpFromHint - un gabarit que vars ne remplit pas : pas de saut", () => {
  const hint = {
    label: "Customer",
    tool: "erpnext_customer_get",
    args: { name: "{party}" },
    kind: "record" as const,
  };
  assertEquals(jumpFromHint(hint, { id: "SINV-1" }), null);
  assertEquals(jumpFromHint(hint, { id: "SINV-1", party: "" }), null);
  assertEquals(jumpFromHint(hint, { party: "Atlas SA" })?.tool.args, {
    name: "Atlas SA",
  });
});

Deno.test("hasUnfilledTemplate - cherche dans les chaînes, tableaux et objets", () => {
  assertEquals(hasUnfilledTemplate("{id}"), true);
  assertEquals(hasUnfilledTemplate({ filters: [["a", "=", "{id}"]] }), true);
  assertEquals(hasUnfilledTemplate({ limit: 20, name: "SO-1" }), false);
  assertEquals(hasUnfilledTemplate(null), false);
});

Deno.test("stored timesheet navigation translates after opening without changing the task query", () => {
  setLangSource(() => "fr");
  const jump = jumpFromHint({
    key: "timesheets",
    label: "Timesheets",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Timesheet",
      filters: [["Timesheet Detail", "task", "=", "{id}"]],
    },
  }, { id: "TASK-001" })!;
  const before = JSON.stringify(jump.tool);
  const level = levelFromJump(jump);
  assertEquals(jumpLabel(jump, translatorForLocale("en")), "Timesheets");
  assertEquals(navLevelTitle(level, translatorForLocale("en")), "Timesheets");
  assertEquals(
    navLevelTitle(level, translatorForLocale("fr")),
    "Feuilles de temps",
  );
  assertEquals(JSON.stringify(jump.tool), before);
  assertEquals(level.title, "Feuilles de temps");
});

Deno.test("stored navigation localization preserves custom labels and parameters", () => {
  const english = translatorForLocale("en");
  assertEquals(
    jumpLabel({
      label: "Casys Industries",
      kind: "record",
      tool: { name: "erpnext_doc_get", args: {} },
    }, english),
    "Casys Industries",
  );
  assertEquals(
    navLevelTitle({ title: "Custom", titleKey: "absent.key" }, english),
    "Custom",
  );
  assertEquals(
    navLevelTitle({
      title: "Old title",
      titleKey: "nav.linked_to",
      titleParams: { id: "TASK-{literal}" },
    }, english),
    "linked to TASK-{literal}",
  );
});

Deno.test("stored timesheet navigation subtitle follows locale and preserves a literal document identity", () => {
  const taskId = "TASK-{literal}-001";
  const jump = jumpFromHint(
    {
      key: "timesheets",
      label: "Timesheets",
      tool: "erpnext_doc_list",
      args: { doctype: "Timesheet" },
    },
    {},
    "liées à " + taskId,
    { key: "nav.linked_to", params: { id: taskId } },
  )!;
  const level = levelFromJump(jump);
  const original = JSON.stringify(level);
  assertEquals(
    navLevelSubtitle(level, translatorForLocale("fr")),
    "liées à " + taskId,
  );
  assertEquals(
    navLevelSubtitle(level, translatorForLocale("en")),
    "linked to " + taskId,
  );
  assertEquals(JSON.stringify(level), original);
  assertEquals(
    navLevelSubtitle({ subtitle: taskId }, translatorForLocale("fr")),
    taskId,
  );
  assertEquals(
    navLevelSubtitle(
      { subtitle: taskId, subtitleKey: "absent.key" },
      translatorForLocale("en"),
    ),
    taskId,
  );
});
