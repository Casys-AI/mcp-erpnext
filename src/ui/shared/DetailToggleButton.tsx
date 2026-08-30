/** @jsxImportSource preact */

import { useT } from "./i18n-hook";
import { cx } from "./ui";
import { acceptsDetailToggleClick } from "./detail-toggle";

export interface DetailToggleButtonProps {
  /** Absent pour une action de repli (message), qui n'ouvre aucun panneau. */
  expanded?: boolean;
  label: string;
  onToggle: () => void;
  controls?: string;
  touch?: boolean;
  hintSide?: "left" | "right";
  class?: string;
}

/**
 * Voie explicite vers le detail, complementaire au double-clic de la donnee.
 * Le second `click` natif d'un double-clic est ignore pour ne pas replier le
 * detail que le premier vient d'ouvrir.
 */
export function DetailToggleButton({
  expanded,
  label,
  onToggle,
  controls,
  touch = false,
  hintSide = "left",
  class: klass,
}: DetailToggleButtonProps) {
  const t = useT();
  const disclosure = expanded !== undefined;
  const actionLabel = t(
    expanded === true ? "interaction.detail.close" : "interaction.detail.open",
    { label },
  );
  const hint = t(
    expanded === true
      ? "interaction.detail.close_hint"
      : "interaction.detail.open_hint",
  );

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-expanded={disclosure ? expanded : undefined}
      aria-controls={controls}
      data-detail-hint={hint}
      data-detail-hint-side={hintSide}
      onClick={(event) => {
        event.stopPropagation();
        if (!acceptsDetailToggleClick(event.detail)) return;
        onToggle();
      }}
      onDblClick={(event) => event.stopPropagation()}
      class={cx(
        "detail-toggle group/detail inline-flex shrink-0 items-center justify-center rounded-chip text-ink-faint transition-colors hover:bg-control hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
        touch ? "size-10" : "size-7",
        klass,
      )}
    >
      <span
        aria-hidden="true"
        class={cx(
          "select-none font-mono text-[14px] leading-none transition-transform duration-150",
          expanded === true && "rotate-90 text-accent",
        )}
      >
        {disclosure ? "›" : "↗"}
      </span>
    </button>
  );
}
