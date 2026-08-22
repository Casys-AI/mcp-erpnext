/**
 * Les sorties d'un niveau : les sauts « › » (cyan, restent dans la vue) et,
 * dessous, les questions « ~ » (pointillé, sortent vers le modèle).
 */

import type { Jump } from "../jumps";
import { cx } from "../ui";

export function JumpList(
  { jumps, asks, onJump, onAsk, narrow }: {
    jumps: Jump[];
    asks: { label: string; message: string }[];
    onJump?: (jump: Jump) => void;
    onAsk?: (message: string) => void;
    /** En étroit : cible tactile de 44 px, chevron toujours visible. */
    narrow?: boolean;
  },
) {
  return (
    <div class="flex flex-col gap-2">
      {jumps.map((jump) => (
        <button
          key={jump.label}
          type="button"
          disabled={!onJump}
          onClick={() => onJump?.(jump)}
          class={cx(
            "group focus-visible:outline-2 focus-visible:outline-accent flex w-full items-center justify-between gap-2 rounded-[5px] border border-line-modal bg-count px-2.5 py-[7px] text-left font-mono text-[11.5px] text-ink transition-colors hover:border-accent hover:bg-control disabled:cursor-not-allowed disabled:opacity-50",
            narrow && "min-h-[44px]",
          )}
        >
          <span class="truncate">{jump.label}</span>
          <span
            aria-hidden="true"
            class={cx(
              "shrink-0 text-[13px] text-accent",
              !narrow &&
                "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          >
            ›
          </span>
        </button>
      ))}
      {asks.length > 0 && (
        <div class="flex flex-col gap-[9px] pt-1">
          {asks.map((ask) => (
            <button
              key={ask.label}
              type="button"
              disabled={!onAsk}
              onClick={() => onAsk?.(ask.message)}
              class={cx(
                "focus-visible:outline-2 focus-visible:outline-accent flex items-center gap-[7px] self-start font-mono text-[11px] text-ink-muted disabled:cursor-not-allowed disabled:opacity-50",
                narrow && "min-h-[44px]",
              )}
            >
              <span class="border-b border-dotted border-ink-faint transition-colors hover:border-ink-muted hover:text-ink">
                {ask.label}
              </span>
              <span aria-hidden="true" class="text-ink-faint">~</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
