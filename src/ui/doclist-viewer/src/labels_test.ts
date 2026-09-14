import { assertEquals } from "@std/assert";
import { translatorForLocale } from "../../shared/i18n.ts";
import {
  fieldLabel,
  hintLabel,
  hintMessage,
  priorityLabel,
  statusLabel,
} from "./labels.ts";

Deno.test("stable document presentation translates known labels and preserves custom values", () => {
  const en = translatorForLocale("en");
  const fr = translatorForLocale("fr");
  assertEquals(statusLabel("Completed", fr), fr("kanban.status.completed"));
  assertEquals(statusLabel("Paid", fr), fr("invoice.status.paid"));
  assertEquals(statusLabel("Unpaid", fr), fr("invoice.status.unpaid"));
  assertEquals(statusLabel("Working", fr), fr("kanban.status.working"));
  assertEquals(
    statusLabel("Customer's special workflow", fr),
    "Customer's special workflow",
  );
  assertEquals(fieldLabel("grand_total", fr), fr("invoice.totals.grand_total"));
  assertEquals(
    fieldLabel("custom_data.project", fr),
    `custom data > ${fr("kanban.field.project")}`,
  );
  assertEquals(hintLabel("Tasks", fr), fr("doclist.hint.tasks"));
  assertEquals(
    hintLabel("Private report TASK-123", fr),
    "Private report TASK-123",
  );
  assertEquals(statusLabel("Completed", en), "Completed");
  assertEquals(priorityLabel("Low", en), "Low");
  assertEquals(priorityLabel("Low", fr), fr("kanban.select.priority.Low"));
  assertEquals(priorityLabel("Account-specific", fr), "Account-specific");
  assertEquals(
    hintMessage("Private {doctype} report {id}", "TASK-001", "Task", fr),
    "Private Task report TASK-001",
  );
});

Deno.test("stable known labels resolve anew across script and direction changes", () => {
  for (const locale of ["fr-FR", "zh-TW", "hi-IN", "ur-PK", "en-US"]) {
    const t = translatorForLocale(locale);
    assertEquals(statusLabel("Cancelled", t), t("kanban.status.cancelled"));
    assertEquals(fieldLabel("status", t), t("kanban.field.status"));
    assertEquals(hintLabel("Timesheets", t), t("doclist.hint.timesheets"));
  }
});

Deno.test("stable custom labels matching object properties remain literal strings", () => {
  const t = translatorForLocale("fr-FR");
  for (const value of ["constructor", "toString", "__proto__"]) {
    assertEquals(statusLabel(value, t), value);
    assertEquals(fieldLabel(value, t), value.replace(/_/g, " "));
    assertEquals(hintLabel(value, t), value);
    assertEquals(hintMessage(value, "TASK-001", "Task", t), value);
    assertEquals(priorityLabel(value, t), value);
    assertEquals(t(value, { id: "TASK-001" }), value);
  }
});
