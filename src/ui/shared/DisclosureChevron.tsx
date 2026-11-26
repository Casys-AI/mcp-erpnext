/** @jsxImportSource preact */

import { cx } from "./ui.tsx";

/** The containing row owns activation, its accessible name and expanded state. */
export function DisclosureChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cx(
        "inline-block shrink-0 text-ink-muted motion-safe:transition-transform",
        expanded && "rotate-90 text-accent",
      )}
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
    </svg>
  );
}
