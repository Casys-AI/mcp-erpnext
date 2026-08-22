/**
 * Le fil — la seule barre nouvelle du chrome, entre l'en-tête et le corps.
 *
 * 36 px sur `sunken`, comme la maquette « Pile de navigation » : « ‹ » pour
 * un niveau en arrière (24 px de cible, jamais désactivé — au niveau 1 la
 * barre n'existe pas), « …N » pour les niveaux élidés (cliquable : la liste
 * s'ouvre et nomme ce que la pile garde), deux parents au plus en ink-muted,
 * le courant seul en ink pleine, puis le type du corps — en brand quand ce
 * n'est pas une liste, c'est le seul signal qui prépare le retour — et le
 * compte. Pendant un appel d'outil, un point accent et « appel ».
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "./i18n-hook";
import type { ViewerLayout } from "./useViewerLayout";
import type { TFunction } from "./i18n-hook";
import { type Crumb, crumbs, type NavLevel, type NavStack } from "./nav-stack";
import { cx } from "./ui";

/** Ce que la pile garde d'un niveau, dit en une ligne : « tri nom ↑ · page 2 · CUST-42 active ». */
export function describeLevel(level: NavLevel, t: TFunction): string {
  const parts: string[] = [];
  if (level.kind === "record") parts.push(t("nav.kind.record"));
  if (level.kind === "chart") parts.push(t("nav.kind.chart"));
  if (level.subtitle) parts.push(level.subtitle);
  const ui = level.ui;
  if (typeof ui.sortKey === "string" && ui.sortKey) {
    parts.push(t("nav.ui.sort", {
      key: ui.sortKey.replace(/_/g, " "),
      dir: ui.sortDir === "desc" ? "↓" : "↑",
    }));
  }
  if (typeof ui.filter === "string" && ui.filter) {
    parts.push(t("nav.ui.filter", { q: ui.filter }));
  }
  for (const [col, value] of Object.entries(ui.chipFilters ?? {})) {
    if (value) {
      parts.push(
        t("nav.ui.filter", { q: `${col.replace(/_/g, " ")} ${value}` }),
      );
    }
  }
  if (typeof ui.page === "number" && ui.page > 0) {
    parts.push(t("nav.ui.page", { n: ui.page + 1 }));
  }
  if (typeof ui.expandedId === "string" && ui.expandedId) {
    parts.push(t("nav.ui.active", { id: ui.expandedId }));
  }
  return parts.join(" · ");
}

const SEP = <span class="font-mono text-[11px] text-line-hover">/</span>;

export function PathBar(
  { stack, onBack, onJump, loading, layout }: {
    stack: NavStack;
    onBack: () => void;
    /** Saut direct vers un parent (index dans la pile). */
    onJump: (index: number) => void;
    loading?: boolean;
    /** En étroit : marges réduites, cible de retour ≥ 40 px. */
    layout?: ViewerLayout;
  },
) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const c = crumbs(stack);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => setOpen(false), [stack.levels.length]);
  if (!c.showBar) return null;
  const level = c.current.level;
  const kindLabel = level.kind === "chart"
    ? t("nav.kind.chart")
    : level.kind === "record"
    ? t("nav.kind.record")
    : t("nav.kind.list");
  return (
    <nav
      aria-label={t("nav.trail")}
      class="relative shrink-0 border-b border-line bg-sunken"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <div
        class={cx(
          "flex h-9 min-w-0 items-center gap-[9px]",
          layout && layout !== "wide" ? "px-3" : "px-4",
        )}
      >
        <button
          type="button"
          aria-label={t("nav.back")}
          title={t("nav.back")}
          onClick={onBack}
          class={cx(
            // 24 px en large (maquette) ; en mobile la cible passe à 40 px.
            layout === "mobile" ? "size-10 -ml-2" : "size-6",
            "flex shrink-0 items-center justify-center rounded-[4px] font-mono text-[15px] font-medium text-accent transition-colors hover:bg-accent/12 active:bg-accent/20 active:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          )}
        >
          ‹
        </button>
        {c.elided.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label={t("nav.elided_title")}
              onClick={() => setOpen((v) => !v)}
              class={cx(
                "rounded-[3px] border px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                open
                  ? "border-accent bg-accent/12 text-ink"
                  : "border-dotted border-line-modal text-ink-dim hover:border-line-hover hover:text-ink",
              )}
            >
              {t("nav.elided", { n: c.elided.length })}
            </button>
            {SEP}
          </>
        )}
        {c.parents.map((crumb) => (
          <Parent key={crumb.level.id} crumb={crumb} onJump={onJump} />
        ))}
        <span
          aria-current="page"
          class="truncate font-mono text-[11.5px] font-medium text-ink"
        >
          {level.title}
        </span>
        <div class="flex-1" />
        {loading
          ? (
            <span class="flex items-center gap-1.5">
              <span class="size-[5px] rounded-full bg-accent" />
              <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
                {t("nav.loading")}
              </span>
            </span>
          )
          : (
            <>
              <span
                class={cx(
                  "rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.09em]",
                  // Seul le graphique passe en brand : c'est le signal qui
                  // prépare un retour vers autre chose qu'une liste.
                  level.kind === "chart"
                    ? "border-brand/40 text-brand"
                    : "border-line text-ink-faint",
                )}
              >
                {kindLabel}
              </span>
              {level.count !== undefined && level.kind === "list" && (
                <span class="rounded-[3px] bg-count px-[7px] py-0.5 font-mono text-[11px] text-ink-muted">
                  {level.count}
                </span>
              )}
            </>
          )}
      </div>
      {open && (
        <div
          ref={popoverRef}
          role="menu"
          class="absolute left-4 top-9 z-20 w-[300px] overflow-hidden rounded-b-[6px] border border-line-modal bg-control shadow-modal"
        >
          {c.elided.map((crumb) => (
            <button
              type="button"
              role="menuitem"
              key={crumb.level.id}
              onClick={() => onJump(crumb.index)}
              class="flex w-full items-baseline gap-2.5 border-b border-line-soft px-3.5 py-[9px] text-left transition-colors last:border-b-0 hover:bg-row-hover"
            >
              <span class="w-[10px] shrink-0 font-mono text-[10px] text-ink-faint">
                {crumb.index + 1}
              </span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate font-mono text-[11.5px] text-ink">
                  {crumb.level.title}
                </span>
                <span class="font-sans text-[11px] text-ink-dim">
                  {describeLevel(crumb.level, t)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

function Parent(
  { crumb, onJump }: { crumb: Crumb; onJump: (index: number) => void },
) {
  const t = useT();
  const stale = crumb.level.stale;
  return (
    <>
      <button
        type="button"
        onClick={() => onJump(crumb.index)}
        title={stale ? t("nav.stale_values", { at: stale.at }) : undefined}
        class={cx(
          "truncate border-b border-transparent pb-px font-mono text-[11.5px] transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          // L'origine garde la couleur de sa nature : brand quand le niveau 1 est un graphique.
          crumb.level.origin === "chart" ? "text-brand" : "text-ink-muted",
        )}
      >
        {stale && (
          <span
            aria-hidden="true"
            class="mr-1.5 inline-block size-[5px] rounded-full bg-warn align-middle"
          />
        )}
        {crumb.level.title}
      </button>
      {SEP}
    </>
  );
}
