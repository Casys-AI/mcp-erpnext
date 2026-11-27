import { assertEquals } from "@std/assert";
import { projectedRecordNames } from "../record-pin-coverage.ts";
import {
  emptySelectionState,
  projectedSelectionEntries,
  setSelectionGroupMembers,
} from "../selection-projection.ts";

Deno.test("Kanban context shares record identities within group bounds", () => {
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
    assertEquals(names.size, expected);
    assertEquals(
      [...names].every((name) => cards.some(({ id }) => id === name)),
      true,
    );
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
