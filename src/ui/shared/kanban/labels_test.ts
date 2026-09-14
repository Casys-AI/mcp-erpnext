import { assertEquals } from "@std/assert";
import { translatorForLocale } from "../i18n.ts";
import {
  kanbanBadgeLabel,
  kanbanMetricLabel,
  kanbanStatusLabel,
  kanbanTransitionLabel,
} from "./labels.ts";

Deno.test("kanban presentation labels follow the requested locale without changing raw values", () => {
  const raw = {
    status: "Working",
    action: "Start work",
    priority: "Low",
    metric: "Actual",
  };
  const before = { ...raw };
  const french = translatorForLocale("fr-FR");
  const chinese = translatorForLocale("zh-CN");
  assertEquals(kanbanStatusLabel(raw.status, french), "En cours");
  assertEquals(kanbanTransitionLabel(raw.action, french), "Démarrer");
  assertEquals(kanbanBadgeLabel(raw.priority, french), "Faible");
  assertEquals(kanbanMetricLabel(raw.metric, french), "Réel");
  assertEquals(kanbanStatusLabel(raw.status, chinese), "进行中");
  assertEquals(kanbanTransitionLabel(raw.action, chinese), "开始工作");
  assertEquals(kanbanBadgeLabel(raw.priority, chinese), "低");
  assertEquals(kanbanMetricLabel(raw.metric, chinese), "实际");
  assertEquals(raw, before);
});

Deno.test("kanban presentation preserves custom server labels and absent translations", () => {
  const french = translatorForLocale("fr");
  for (
    const label of [
      "Waiting for compliance",
      "Casys Industries",
      "__proto__",
      "toString",
      "",
    ]
  ) {
    assertEquals(kanbanStatusLabel(label, french), label);
    assertEquals(kanbanTransitionLabel(label, french), label);
    assertEquals(kanbanBadgeLabel(label, french), label);
    assertEquals(kanbanMetricLabel(label, french), label);
  }
  assertEquals(kanbanStatusLabel("Working", (key) => key), "Working");
  assertEquals(kanbanTransitionLabel("Start work", (key) => key), "Start work");
  assertEquals(kanbanTransitionLabel("Open", french), "Ouvert");
});
