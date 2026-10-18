/** @jsxImportSource preact */

import type { JSX } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { ActiveContextSelection } from "./active-context.ts";
import { activeContextAttachmentNotice } from "./active-context-attachment.ts";
import {
  activeContextChipEntries,
  type ActiveContextChipEntry,
  activeContextChipNotices,
  activeContextRemovalFocus,
} from "./active-context-chip.ts";
import type { SelectionState } from "./selection-projection.ts";
import { useT } from "./i18n-hook.ts";
import { cx } from "./ui.tsx";

type ContextMutation = () => unknown | Promise<unknown>;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function mutationAccepted(result: unknown): boolean {
  return result === "shared" || result === "cleared";
}

function adjacentFocusableOutside(
  wrapper: HTMLElement | null,
  current: Element | null,
): HTMLElement | null {
  if (!wrapper) return null;
  const focusables = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  const start = current ? focusables.indexOf(current as HTMLElement) : -1;
  for (let index = start + 1; index < focusables.length; index++) {
    if (!wrapper.contains(focusables[index])) return focusables[index];
  }
  for (let index = start - 1; index >= 0; index--) {
    if (!wrapper.contains(focusables[index])) return focusables[index];
  }
  return focusables.find((element) => !wrapper.contains(element)) ?? null;
}

function afterDomUpdate(callback: () => void) {
  queueMicrotask(() => {
    if (typeof requestAnimationFrame !== "function") {
      callback();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(callback));
  });
}

function selectionKey(selection: ActiveContextSelection): string {
  return `${selection.scopeKey}:${selection.item.id}`;
}

/**
 * Signal inline du panier actif, volontairement plus discret qu'une action.
 * Le viewer parent garde l'état et porte les mutations distantes.
 */
export function ActiveContextChip(
  {
    selections,
    selection,
    failed = false,
    pending = false,
    evictedLabel,
    onRemove,
    onRemoveGroup,
    onClear,
    compact = false,
    popoverAlign = "end",
    class: klass,
  }: {
    selections: readonly ActiveContextSelection[];
    selection?: SelectionState;
    failed?: boolean;
    pending?: boolean;
    evictedLabel?: string | null;
    onRemove?: (
      selection: ActiveContextSelection,
    ) => unknown | Promise<unknown>;
    onRemoveGroup?: (
      reconcileKey: string,
      scopeKey: string,
    ) => unknown | Promise<unknown>;
    onClear: ContextMutation;
    compact?: boolean;
    popoverAlign?: "start" | "end";
    class?: string;
  },
): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const singleRemoveRef = useRef<HTMLButtonElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const popoverId = useId();
  const activeSelections = selections;
  const chipEntries = activeContextChipEntries(activeSelections, selection);
  const renderedSelectionsRef = useRef(chipEntries);
  renderedSelectionsRef.current = chipEntries;
  const count = chipEntries.length;
  const notices = activeContextChipNotices(activeSelections, selection);
  const singleItem = count === 1 ? chipEntries[0] : undefined;
  const attachmentNotices = activeSelections.flatMap((selection) => {
    const notice = activeContextAttachmentNotice(selection.item);
    return notice ? [{ key: selectionKey(selection), notice }] : [];
  });

  useEffect(() => {
    if (count <= 1) setOpen(false);
  }, [count]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasContent = count > 0 || attachmentNotices.length > 0 ||
    notices.length > 0 || failed || pending || !!evictedLabel;

  const remove = async (
    entry: ActiveContextChipEntry,
    index: number,
  ) => {
    const external = adjacentFocusableOutside(
      wrapperRef.current,
      document.activeElement,
    );
    let result: unknown;
    try {
      result = await (entry.kind === "group"
        ? onRemoveGroup?.(entry.group.reconcileKey, entry.group.scopeKey)
        : onRemove
        ? onRemove(entry.selection)
        : onClear());
    } catch {
      return;
    }
    if (!mutationAccepted(result)) return;

    afterDomUpdate(() => {
      // La projection peut changer après l'ACK ; le focus suit les puces visibles.
      const focus = activeContextRemovalFocus(
        renderedSelectionsRef.current,
        index,
      );
      if (focus.kind === "outside") {
        if (external?.isConnected) external.focus({ preventScroll: true });
        return;
      }
      if (focus.kind === "single") {
        singleRemoveRef.current?.focus({ preventScroll: true });
        return;
      }
      const target = removeRefs.current.get(focus.selection.key) ??
        triggerRef.current;
      target?.focus({
        preventScroll: true,
      });
    });
  };

  const clearAll = async () => {
    const external = adjacentFocusableOutside(
      wrapperRef.current,
      document.activeElement,
    );
    if (external) external.focus({ preventScroll: true });
    setOpen(false);
    try {
      const result = await onClear();
      if (!mutationAccepted(result)) return;
      afterDomUpdate(() => {
        if (external?.isConnected) external.focus({ preventScroll: true });
      });
    } catch {
      // Le hook parent conserve le dernier panier confirmé et expose l'échec.
    }
  };

  return (
    <span
      data-context-slot
      ref={wrapperRef}
      aria-busy={pending || undefined}
      class={cx(
        "relative flex h-8 w-full shrink-0 min-w-0 items-center",
        popoverAlign === "start" ? "justify-start" : "justify-end",
        "font-mono text-chip text-ink-muted",
        klass,
      )}
    >
      {hasContent && (
        <span
          data-context-chip
          class="inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-chip border border-accent-edge bg-accent/8 pl-2 pr-0.5"
        >
          {count > 1 && (
            <button
              ref={triggerRef}
              type="button"
              class={cx(
                "inline-flex shrink-0 items-center gap-1 rounded-badge px-1 py-0.5 text-accent-text transition-colors",
                "hover:bg-accent/12 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              )}
              aria-expanded={open}
              aria-controls={popoverId}
              aria-haspopup="dialog"
              onClick={() => setOpen((value) => !value)}
            >
              <span aria-live="polite" aria-atomic="true">
                {t("context.active.label")} · {count}
              </span>
              <span aria-hidden="true" class="text-ink-faint">
                {open ? "▴" : "▾"}
              </span>
            </button>
          )}
          <span
            role="group"
            aria-label={t("context.active.label")}
            tabIndex={0}
            class="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-accent"
          >
            {count === 1 && (
              <span
                class="inline-flex min-w-0 items-center gap-1"
                aria-live="polite"
                aria-atomic="true"
              >
                <span
                  class={cx("shrink-0 text-accent-text", compact && "sr-only")}
                >
                  {t("context.active.label")}
                </span>
                <span class="truncate text-ink" title={singleItem?.label}>
                  {singleItem?.label}
                </span>
                {singleItem?.summary && (
                  <span
                    class="truncate text-micro text-ink-muted"
                    title={singleItem.summary}
                  >
                    {singleItem.summary}
                  </span>
                )}
              </span>
            )}
            <span
              data-context-notices
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class="inline-flex shrink-0 items-center gap-1"
            >
              {[...attachmentNotices.map(({ notice }) => notice), ...notices]
                .map((notice, index) => (
                  <span
                    key={index}
                    class="shrink-0 whitespace-nowrap rounded-badge bg-accent/12 px-1.5 py-0.5 text-micro text-ink-muted"
                  >
                    {notice}
                  </span>
                ))}
            </span>
            {pending && (
              <span
                role="status"
                aria-live="polite"
                class="inline-flex shrink-0 items-center gap-1 text-ink-muted"
                title={t("context.active.pending")}
              >
                <span aria-hidden="true" class="shrink-0 animate-spin">◌</span>
                <span class="truncate">{t("context.active.pending")}</span>
              </span>
            )}
            {failed && (
              <span
                role="status"
                class="inline-flex shrink-0 items-center gap-1 text-bad"
                title={t("context.active.error")}
              >
                <span aria-hidden="true">!</span>
                <span class={compact && count > 0 ? "sr-only" : undefined}>
                  {t("context.active.error")}
                </span>
              </span>
            )}
            {evictedLabel && (
              <span
                role="status"
                aria-live="polite"
                class={cx(
                  "truncate text-micro text-ink-muted",
                  compact ? "max-w-24" : "max-w-36",
                )}
                title={t("context.active.evicted", { label: evictedLabel })}
              >
                {t("context.active.evicted", { label: evictedLabel })}
              </span>
            )}
          </span>
          {count === 1 && (
            <button
              ref={singleRemoveRef}
              type="button"
              onClick={() => void remove(chipEntries[0], 0)}
              class={cx(
                "-my-0.5 grid size-6 shrink-0 place-items-center rounded-badge",
                "text-[14px] leading-none text-ink-faint transition-colors",
                "hover:bg-accent/12 hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              )}
              aria-label={t("context.active.clear", {
                label: singleItem?.label ?? chipEntries[0].label,
              })}
              title={t("context.active.clear", {
                label: singleItem?.label ?? chipEntries[0].label,
              })}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </span>
      )}
      {count > 1 && open && (
        <span
          id={popoverId}
          role="dialog"
          aria-label={t("context.active.items")}
          class={cx(
            "absolute top-full z-30 mt-1.5 w-56 max-w-[calc(100vw-24px)]",
            popoverAlign === "start" ? "left-0" : "right-0",
            "rounded-card border border-line-modal bg-control p-1.5 shadow-modal",
          )}
        >
          <span class="flex max-h-64 flex-col overflow-y-auto">
            {chipEntries.map((entry, index) => {
              const display = entry;
              return (
                <span
                  key={entry.key}
                  class="flex min-w-0 items-center gap-2 rounded-badge px-1.5 py-1 hover:bg-sunken"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-chip text-ink">
                      {display.label}
                    </span>
                    {display.summary && (
                      <span class="block whitespace-normal break-words text-micro text-ink-faint">
                        {display.summary}
                      </span>
                    )}
                    {!display.summary && (
                      <span class="block truncate text-micro text-ink-faint">
                        {entry.view}
                        {entry.value ? ` · ${entry.value}` : ""}
                      </span>
                    )}
                  </span>
                  <button
                    ref={(element) => {
                      const key = entry.key;
                      if (element) removeRefs.current.set(key, element);
                      else removeRefs.current.delete(key);
                    }}
                    type="button"
                    class={cx(
                      "grid size-6 shrink-0 place-items-center rounded-badge",
                      "text-[14px] leading-none text-ink-faint transition-colors",
                      "hover:bg-accent/12 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
                    )}
                    aria-label={t("context.active.clear", {
                      label: display.label,
                    })}
                    title={t("context.active.clear", {
                      label: display.label,
                    })}
                    onClick={() => void remove(entry, index)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              );
            })}
          </span>
          <button
            type="button"
            class={cx(
              "mt-1 w-full rounded-badge border-t border-line-soft px-1.5 pt-1.5 text-left",
              "text-micro text-ink-faint hover:text-bad focus-visible:outline-2 focus-visible:outline-accent",
            )}
            onClick={() => {
              void clearAll();
            }}
          >
            {t("context.active.clear_all")}
          </button>
        </span>
      )}
    </span>
  );
}
