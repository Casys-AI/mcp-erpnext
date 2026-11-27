import { visualItemProps } from "@mcpview/components/preact/controls";
import type { ContextInteractionTarget } from "./context-interaction.ts";

export function visualRowProps(
  id: string,
  detail: ContextInteractionTarget | undefined,
  selected: boolean | "mixed" | undefined,
  groupSelection = selected !== undefined,
) {
  return visualItemProps({
    id,
    activation: detail,
    pressed: selected,
    selectionStart: groupSelection,
  });
}
