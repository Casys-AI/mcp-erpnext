/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { useT } from "../i18n-hook";
import { TONE_BADGE, toneForStatus } from "../status";
import type { ViewerLayout } from "../useViewerLayout";
import { cx, Label, LiveDot } from "../ui";

export interface DocumentHeaderProps {
  doctype: string;
  name: string;
  title: string;
  status?: string;
  docstatus?: number;
  layout: ViewerLayout;
  /** Retour ou fil d'Ariane fourni par la coque qui héberge la fiche. */
  navigation?: ComponentChildren;
  /** Refresh, JSON ou toute autre action propre à la coque. */
  trailing?: ComponentChildren;
  live?: boolean;
}

function StatusBadge(
  { status, pill }: { status: string; pill?: boolean },
) {
  return (
    <span
      class={cx(
        "inline-flex shrink-0 font-mono text-micro uppercase tracking-chip",
        pill ? "rounded-pill px-2 py-[3px]" : "rounded-badge px-[7px] py-0.5",
        TONE_BADGE[toneForStatus(status)],
      )}
    >
      {status}
    </span>
  );
}

export function DocumentHeader({
  doctype,
  name,
  title,
  status,
  docstatus,
  layout,
  navigation,
  trailing,
  live,
}: DocumentHeaderProps) {
  const t = useT();
  const narrow = layout !== "wide";

  if (narrow) {
    return (
      <header aria-label={t("document.header")} class="shrink-0">
        <div class="flex min-h-10 items-center justify-between gap-2.5 px-3 py-2">
          <div class="min-w-0 flex-1">{navigation}</div>
          <Label class="max-w-[45%] truncate text-center">{doctype}</Label>
          <div class="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            {trailing}
            {live && (
              <span aria-hidden="true" class="size-1.5 rounded-full bg-ok" />
            )}
          </div>
        </div>

        <div class="flex flex-col gap-1.5 border-b border-line px-3 pb-3 pt-1">
          <span class="truncate font-mono text-nano uppercase tracking-label text-ink-faint">
            {name}
          </span>
          <h2 class="text-pretty font-display text-card-title font-semibold text-ink">
            {title}
          </h2>
          {(status || docstatus !== undefined) && (
            <div class="flex flex-wrap items-center gap-[7px]">
              {status && <StatusBadge status={status} pill />}
              {docstatus !== undefined && (
                <span class="font-mono text-chip text-ink-faint">
                  {t("document.docstatus", { value: docstatus })}
                </span>
              )}
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <header
      aria-label={t("document.header")}
      class="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-[13px]"
    >
      <div class="flex min-w-0 items-start gap-3">
        {navigation && <div class="shrink-0 pt-0.5">{navigation}</div>}
        <div class="flex min-w-0 flex-col gap-1">
          <span class="truncate font-mono text-micro uppercase tracking-label text-ink-faint">
            {doctype} · {name}
          </span>
          <h2 class="truncate font-display text-title font-semibold tracking-title text-ink">
            {title}
          </h2>
          {(status || docstatus !== undefined || live) && (
            <div class="flex flex-wrap items-center gap-[7px]">
              {status && <StatusBadge status={status} />}
              {docstatus !== undefined && (
                <span class="font-mono text-chip text-ink-faint">
                  {t("document.docstatus", { value: docstatus })}
                </span>
              )}
              {live && <LiveDot />}
            </div>
          )}
        </div>
      </div>
      {trailing && (
        <div class="flex shrink-0 items-center gap-1.5">{trailing}</div>
      )}
    </header>
  );
}
