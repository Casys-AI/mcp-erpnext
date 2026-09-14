import { assert, assertEquals } from "@std/assert";
import { taskKanbanAdapter } from "../../../kanban/adapters/task.ts";
import { opportunityKanbanAdapter } from "../../../kanban/adapters/opportunity.ts";
import { issueKanbanAdapter } from "../../../kanban/adapters/issue.ts";
import { translatorForLocale } from "../../shared/i18n.ts";
import { kanbanBadgeLabel } from "../../shared/kanban/labels.ts";
import type { KanbanCardData } from "../../shared/kanban/types.ts";
import { cardDeadlinePresentation } from "./card-deadline.ts";

const NOW = Date.UTC(2020, 0, 13, 12);
const DUE_DATE = "2020-01-10";

function customCard(overrides: Partial<KanbanCardData> = {}): KanbanCardData {
  return {
    id: "CARD-{label}/1",
    title: "Casys custom card",
    columnId: "open",
    ...overrides,
  };
}

Deno.test("Kanban deadlines honor Task, Opportunity, and Issue adapter contracts without duplicating their dates", () => {
  const examples = [
    {
      adapter: taskKanbanAdapter,
      row: {
        name: "TASK-001",
        status: "Open",
        exp_end_date: DUE_DATE,
        progress: 25,
        expected_time: 8,
      },
      metric: "Due",
      badge: "Overdue",
    },
    {
      adapter: opportunityKanbanAdapter,
      row: {
        name: "OPP-001",
        status: "Open",
        expected_closing: DUE_DATE,
        opportunity_amount: 12500,
        currency: "EUR",
      },
      metric: "Closing",
      badge: "Overdue",
    },
    {
      adapter: issueKanbanAdapter,
      row: {
        name: "ISS-001",
        status: "Open",
        resolution_by: `${DUE_DATE} 09:30:00`,
        priority: "High",
        raised_by: "alice@example.com",
      },
      metric: "SLA",
      badge: "SLA breach",
    },
  ];
  for (const { adapter, row, metric, badge } of examples) {
    const card = adapter.buildCards([row])[0];
    const snapshot = structuredClone(card);
    assert(card.metrics?.some((entry) => entry.label === metric));
    assert(card.badges?.some((entry) => entry.label === badge));
    assertEquals(cardDeadlinePresentation(card, NOW), {
      isOverdue: true,
      overdueDays: 3,
      needsDueDateFallback: false,
    });
    assertEquals(card, snapshot);
  }
});

Deno.test("Kanban SLA breach retains its translated badge alongside the translated day counter", () => {
  const card = issueKanbanAdapter.buildCards([{
    name: "ISS-001",
    status: "Open",
    resolution_by: `${DUE_DATE} 09:30:00`,
  }])[0];
  const t = translatorForLocale("fr-FR");
  const deadline = cardDeadlinePresentation(card, NOW);
  assertEquals(deadline.isOverdue, true);
  assertEquals(
    t("kanban.card.overdue", { n: deadline.overdueDays }),
    "retard 3 j",
  );
  assertEquals(card.badges?.map((badge) => kanbanBadgeLabel(badge.label, t)), [
    "SLA dépassé",
  ]);
  assertEquals(card.badges, [{ label: "SLA breach", tone: "error" }]);
});

Deno.test("Kanban closed records do not become overdue merely because their date passed", () => {
  for (
    const card of [
      taskKanbanAdapter.buildCards([{
        name: "TASK-001",
        status: "Completed",
        exp_end_date: DUE_DATE,
      }])[0],
      opportunityKanbanAdapter.buildCards([{
        name: "OPP-001",
        status: "Converted",
        expected_closing: DUE_DATE,
      }])[0],
      issueKanbanAdapter.buildCards([{
        name: "ISS-001",
        status: "Resolved",
        resolution_by: DUE_DATE,
      }])[0],
    ]
  ) {
    assertEquals(cardDeadlinePresentation(card, NOW), {
      isOverdue: false,
      overdueDays: null,
      needsDueDateFallback: false,
    });
  }
});

Deno.test("Kanban date fallback recognizes only canonical deadline metrics and preserves custom metrics", () => {
  for (const label of ["Due", "due", "Closing", "SLA"]) {
    assertEquals(
      cardDeadlinePresentation(
        customCard({
          dueDate: DUE_DATE,
          metrics: [{ label, value: "Jan 10" }],
        }),
        NOW,
      ).needsDueDateFallback,
      false,
    );
  }
  const card = customCard({
    dueDate: DUE_DATE,
    metrics: [
      { label: "Created", value: "Jan 10" },
      { label: "Custom review date", value: "Jan 10" },
      { label: "Amount", value: "EUR 12500" },
    ],
  });
  const snapshot = structuredClone(card);
  assertEquals(cardDeadlinePresentation(card, NOW).needsDueDateFallback, true);
  assertEquals(card, snapshot);
  assertEquals(
    cardDeadlinePresentation(customCard({ dueDate: DUE_DATE }), NOW)
      .needsDueDateFallback,
    true,
  );
});

Deno.test("Kanban missing and invalid dates never produce an invalid day counter", () => {
  assertEquals(cardDeadlinePresentation(customCard(), NOW), {
    isOverdue: false,
    overdueDays: null,
    needsDueDateFallback: false,
  });
  for (const dueDate of [undefined, "", "not-a-date"]) {
    const result = cardDeadlinePresentation(
      customCard({
        dueDate,
        badges: [{ label: "SLA breach", tone: "error" }],
      }),
      NOW,
    );
    assertEquals(result.isOverdue, true);
    assertEquals(result.overdueDays, null);
    assertEquals(result.needsDueDateFallback, Boolean(dueDate));
  }
});

Deno.test("Kanban a future marked deadline retains the warning without a day counter", () => {
  assertEquals(
    cardDeadlinePresentation(
      customCard({
        dueDate: "2020-01-20 09:30:00",
        badges: [{ label: "SLA breach", tone: "error" }],
        metrics: [{ label: "SLA", value: "Jan 20" }],
      }),
      NOW,
    ),
    {
      isOverdue: true,
      overdueDays: null,
      needsDueDateFallback: false,
    },
  );
});
