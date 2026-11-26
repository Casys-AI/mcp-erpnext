/** A full pin on a card or column requires every selected identity to have reached the host. */
export function kanbanPinCoverage<T extends { id: string }>(
  cards: readonly T[],
  isSelected: (card: T) => boolean,
  sharedNames: ReadonlySet<string>,
) {
  const selected = cards.filter(isSelected);
  const allSelected = selected.length > 0 && selected.length === cards.length;
  const shared = selected.filter((card) => sharedNames.has(card.id)).length;
  const pressed: boolean | "mixed" = allSelected && shared === selected.length
    ? true
    : selected.length
    ? "mixed"
    : false;
  return { pressed, allSelected, selected: selected.length, shared };
}
