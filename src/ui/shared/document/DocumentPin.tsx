/** @jsxImportSource preact */

import { ContextPinButton } from "../ContextPinButton.tsx";
import { useT } from "../i18n-hook.ts";
import type { ContextInteractionTarget } from "./context-interaction.ts";

/** A record or child-row pin is independent of its navigation surface. */
export function DocumentPin({ target }: { target?: ContextInteractionTarget }) {
  const t = useT();
  if (target?.selected === undefined) return null;
  return (
    <ContextPinButton
      label={t(target.selected ? "context.pin.remove" : "context.pin.add", {
        label: target.label,
      })}
      pressed={target.selected}
      onToggle={() => {
        void target.onActivate();
      }}
    />
  );
}
