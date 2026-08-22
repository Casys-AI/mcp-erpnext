/** @jsxImportSource preact */
/** Badge de statut : mono, capitales, fond translucide dans le ton du statut. */

import type { ComponentChildren } from "preact";
import { type Tone, TONE_BADGE, toneForStatus } from "~/shared/status";

export function StatusCell({ value }: { value: string }) {
  return <StatusBadge tone={toneForStatus(value)}>{value}</StatusBadge>;
}

export function StatusBadge(
  { tone, children, pill }: {
    tone: Tone;
    children: ComponentChildren;
    /** En narrow (mobile/panel) le badge prend la forme pill (radius-pill = 13px). */
    pill?: boolean;
  },
) {
  return (
    <span
      class={`inline-flex shrink-0 font-mono text-micro uppercase tracking-chip ${
        pill ? "rounded-pill py-[3px] px-2" : "rounded-badge px-[7px] py-0.5"
      } ${TONE_BADGE[tone]}`}
    >
      {children}
    </span>
  );
}
