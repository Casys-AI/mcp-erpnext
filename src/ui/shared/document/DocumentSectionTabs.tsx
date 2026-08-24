/** @jsxImportSource preact */

import type { JSX } from "preact";
import { useT } from "../i18n-hook";
import type { ViewerLayout } from "../useViewerLayout";
import { cx } from "../ui";

export interface DocumentSectionTab {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface DocumentSectionTabsProps {
  tabs: readonly DocumentSectionTab[];
  activeId: string;
  onChange: (id: string) => void;
  layout: ViewerLayout;
  idPrefix?: string;
}

export function DocumentSectionTabs({
  tabs,
  activeId,
  onChange,
  layout,
  idPrefix = "document",
}: DocumentSectionTabsProps) {
  const t = useT();

  function moveFrom(
    event: JSX.TargetedKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const enabled = tabs
      .map((tab, tabIndex) => ({ tab, tabIndex }))
      .filter(({ tab }) => !tab.disabled);
    if (enabled.length === 0) return;

    const current = enabled.findIndex(({ tabIndex }) => tabIndex === index);
    const target = event.key === "Home"
      ? enabled[0]
      : event.key === "End"
      ? enabled[enabled.length - 1]
      : enabled[
        (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) %
        enabled.length
      ];
    onChange(target.tab.id);
    document.getElementById(`${idPrefix}-tab-${target.tab.id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t("document.sections")}
      class={cx(
        "drag-scroll flex shrink-0 gap-1.5 overflow-x-auto border-b border-line",
        layout === "mobile" ? "px-3 py-2.5" : "px-3.5 py-2.5",
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => moveFrom(event, index)}
            class={cx(
              "shrink-0 border font-mono text-chip uppercase tracking-chip transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              layout === "mobile"
                ? "rounded-pill px-2.5 py-1"
                : "rounded-control px-2.5 py-[5px]",
              active
                ? "border-accent bg-accent/14 text-accent-text"
                : "border-line bg-control text-ink-muted hover:border-line-hover hover:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span class="ml-1.5 text-ink-faint">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
