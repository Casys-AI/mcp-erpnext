/** @jsxImportSource preact */
import { cx } from "~/shared/ui";
import { TONE_BADGE, toneForStatus } from "~/shared/status";

/**
 * Badge de statut Direction B v2 — JetBrains Mono 10px uppercase, radius 3px,
 * padding 2px 7px, fond alpha par statut.
 *
 * Délègue à toneForStatus() + TONE_BADGE de shared/status.ts pour rester
 * cohérent avec doclist-viewer et les autres vues.
 */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      class={cx(
        "rounded-badge py-[2px] px-[7px]",
        "font-mono text-micro uppercase tracking-chip",
        TONE_BADGE[toneForStatus(status)],
      )}
    >
      {status}
    </span>
  );
}
