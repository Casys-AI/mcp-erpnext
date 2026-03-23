export const KANBAN_COLUMN_FOCUS_MAX_VIEWPORT_WIDTH = 920;

export function shouldUseKanbanColumnFocus(
  viewportWidth: number,
  columnCount: number,
): boolean {
  return columnCount > 1 &&
    viewportWidth <= KANBAN_COLUMN_FOCUS_MAX_VIEWPORT_WIDTH;
}

export function clampKanbanFocusIndex(
  index: number,
  columnCount: number,
): number {
  if (columnCount <= 0) return 0;
  if (index < 0) return 0;
  if (index >= columnCount) return columnCount - 1;
  return index;
}
