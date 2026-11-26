/** @jsxImportSource preact */

import { cx } from "./ui.tsx";

interface ContextPinButtonProps {
  label: string;
  pressed: boolean | "mixed";
  onToggle(shiftKey: boolean): void;
  disabled?: boolean;
  class?: string;
}

/** A pin is a separate action, even inside a navigable row or a draggable card. */
export function ContextPinButton(
  { label, pressed, onToggle, disabled, class: extraClass }:
    ContextPinButtonProps,
) {
  return (
    <button
      type="button"
      data-context-pin=""
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
          if (event.repeat) event.preventDefault();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail <= 1) onToggle(event.shiftKey);
      }}
      onDblClick={(event) => event.stopPropagation()}
      class={cx(
        "inline-flex size-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-chip transition-colors hover:bg-control focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
        pressed === false ? "text-ink-faint hover:text-accent" : "text-accent",
        extraClass,
      )}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
      >
        <path
          d="M10 3v14"
          transform={pressed === false ? "rotate(36 10 10)" : undefined}
          stroke-dasharray={pressed === "mixed" ? "5.5 3 5.5" : undefined}
        />
      </svg>
    </button>
  );
}
