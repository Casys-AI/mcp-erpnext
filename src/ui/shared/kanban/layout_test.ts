import { assertEquals } from "jsr:@std/assert";
import {
  clampKanbanFocusIndex,
  shouldUseKanbanColumnFocus,
} from "./layout.ts";

Deno.test("kanban layout - enables column focus only on narrow viewports with multiple columns", () => {
  assertEquals(shouldUseKanbanColumnFocus(1280, 4), false);
  assertEquals(shouldUseKanbanColumnFocus(900, 4), true);
  assertEquals(shouldUseKanbanColumnFocus(900, 1), false);
});

Deno.test("kanban layout - clamps focus index to available column bounds", () => {
  assertEquals(clampKanbanFocusIndex(-1, 3), 0);
  assertEquals(clampKanbanFocusIndex(1, 3), 1);
  assertEquals(clampKanbanFocusIndex(5, 3), 2);
  assertEquals(clampKanbanFocusIndex(2, 0), 0);
});
