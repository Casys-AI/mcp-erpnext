import { assertEquals } from "@std/assert";
import { projectedRecordNames } from "../active-context-chip.ts";
import {
  emptySelectionState,
  projectedSelectionEntries,
  setSelectionGroupMembers,
} from "../selection-projection.ts";
import { kanbanPinCoverage } from "./pin-coverage.ts";

Deno.test("column and card pins report only the acknowledged identities in bounded groups", () => {
  for (
    const [count, queryAvailable, expected] of [[12, false, 8], [
      230,
      true,
      100,
    ], [2, false, 2]] as const
  ) {
    const cards = Array.from(
      { length: count },
      (_, index) => ({ id: `TASK-${index}` }),
    );
    const group = setSelectionGroupMembers(emptySelectionState(), {
      scopeKey: "board",
      reconcileKey: "cards",
      doctype: "Task",
      view: "My tasks",
      fields: ["name"],
      queryAvailable,
    }, cards.map(({ id }) => ({ name: id, label: id, fieldsSource: "row" })));
    const names = projectedRecordNames(
      projectedSelectionEntries(group),
      "board",
      "Task",
    );
    const body = kanbanPinCoverage(cards, () => true, names);
    assertEquals(body, {
      pressed: expected === count ? true : "mixed",
      allSelected: true,
      selected: count,
      shared: expected,
    });
    for (const card of cards) {
      assertEquals(
        kanbanPinCoverage([card], () => true, names).pressed,
        names.has(card.id) ? true : "mixed",
      );
    }
    assertEquals(kanbanPinCoverage(cards, () => false, names).pressed, false);
    assertEquals(
      projectedRecordNames(
        projectedSelectionEntries(group),
        "other board",
        "Task",
      ).size,
      0,
    );
    assertEquals(
      projectedRecordNames(projectedSelectionEntries(group), "board", "Issue")
        .size,
      0,
    );
  }
});
