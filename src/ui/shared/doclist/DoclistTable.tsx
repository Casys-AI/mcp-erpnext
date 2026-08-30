/** @jsxImportSource preact */
/**
 * La liste de documents, dans les trois mises en page de la maquette.
 *
 *   wide   — tableau complet, toutes les colonnes retenues par le DocType
 *   mobile — tableau compact : trois colonnes, lignes de 40 px, en-têtes gardés
 *   panel  — lignes empilées, sans en-têtes, pour un panneau latéral étroit
 *
 * Le mobile garde un tableau, contrairement à ce qu'on attendrait : la maquette
 * y insiste (« Les listes restent des tableaux »), et le panneau latéral —
 * pourtant plus étroit de 10 px — est le seul à empiler. Ce n'est pas une
 * échelle de largeurs mais deux contextes ; voir shared/useViewerLayout.ts.
 *
 * Le liseré de statut de 2 px est le seul signal d'état qui survit partout : en
 * étroit le badge disparaît, la couleur du bord reste.
 */

import {
  type Tone,
  TONE_AMOUNT,
  TONE_RULE,
  toneForStatus,
} from "~/shared/status";
import { type ComponentChildren, Fragment } from "preact";
import type { ClickIntentArbiter } from "~/shared/click-intent";
import { DetailToggleButton } from "~/shared/DetailToggleButton.tsx";
import {
  contextInteractionProps,
  type ContextInteractionTarget,
} from "~/shared/document/context-interaction";
import type { ViewerLayout } from "~/shared/useViewerLayout";
import { useClickIntent } from "~/shared/useClickIntent";
import { useT } from "~/shared/i18n-hook";
import { formatCell, isStatusField } from "./helpers";
import { pickNarrowColumns, shortenId } from "./columns";
import { StatusCell } from "./StatusCell";
import type { SortDir } from "./types";

export interface DoclistColumn {
  id: string;
  label: string;
  numeric: boolean;
}

interface RowShape {
  id: string;
  row: Record<string, unknown>;
  selected: boolean;
  interactionTarget?: ContextInteractionTarget;
  tone: Tone;
  struck: boolean;
}

interface CommonProps {
  columns: DoclistColumn[];
  rows: Record<string, unknown>[];
  rowId: (row: Record<string, unknown>, index: number) => string;
  selectedId: string | null;
  /** La ligne qu'une action vient de changer : barrée sur place, pas rechargée. */
  struckId?: string | null;
  interactionTarget?: (
    row: Record<string, unknown>,
    index: number,
  ) => ContextInteractionTarget | undefined;
  /** Détail accordéon inséré immédiatement sous la ligne sélectionnée. */
  detail?: ComponentChildren;
}

type ModeProps = CommonProps & {
  shape: (row: Record<string, unknown>, index: number) => RowShape;
  amountKey?: string;
  clickIntent: ClickIntentArbiter;
  hasDetailControls: boolean;
};

export function DoclistTable(
  { layout, amountKey, sortKey, sortDir, onSort, ...common }:
    & CommonProps
    & {
      layout: ViewerLayout;
      amountKey?: string;
      sortKey: string | null;
      sortDir: SortDir;
      onSort: (key: string) => void;
    },
) {
  const t = useT();
  const clickIntent = useClickIntent();
  if (common.rows.length === 0) {
    return (
      <p class="px-4 py-10 text-center text-data text-ink-muted">
        {t("doclist.table.no_match")}
      </p>
    );
  }

  /** Le statut ne s'affiche qu'en large, mais il colore la ligne partout. */
  const statusKey = common.columns.find((c) => isStatusField(c.id))?.id;
  const hasDetailControls = common.rows.some((row, index) =>
    Boolean(common.interactionTarget?.(row, index)?.onDoubleActivate)
  );

  const shape = (row: Record<string, unknown>, index: number): RowShape => {
    const id = common.rowId(row, index);
    return {
      id,
      row,
      selected: common.selectedId === id,
      interactionTarget: common.interactionTarget?.(row, index),
      struck: common.struckId === id,
      tone: statusKey ? toneForStatus(String(row[statusKey] ?? "")) : "neutral",
    };
  };

  if (layout === "mobile") {
    return (
      <CompactTable
        {...common}
        shape={shape}
        amountKey={amountKey}
        clickIntent={clickIntent}
        hasDetailControls={hasDetailControls}
      />
    );
  }
  if (layout === "panel") {
    return (
      <StackedList
        {...common}
        shape={shape}
        amountKey={amountKey}
        clickIntent={clickIntent}
        hasDetailControls={hasDetailControls}
      />
    );
  }
  return (
    <WideTable
      {...common}
      shape={shape}
      statusKey={statusKey}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      clickIntent={clickIntent}
      hasDetailControls={hasDetailControls}
    />
  );
}

function RowDetailToggle({
  target,
  touch = false,
}: {
  target?: ContextInteractionTarget;
  touch?: boolean;
}) {
  const onToggle = target?.onDoubleActivate;
  if (!onToggle) return null;
  return (
    <DetailToggleButton
      expanded={Boolean(target.expanded)}
      label={target.detailLabel ?? target.label}
      controls={target.controls}
      onToggle={onToggle}
      touch={touch}
    />
  );
}

/**
 * Un solde nul est une absence, pas une valeur : la maquette y met un tiret.
 * Restreint à outstanding_amount — ailleurs, zéro veut dire quelque chose.
 */
function dueValue(row: Record<string, unknown>, amountKey?: string) {
  const amount = amountKey ? row[amountKey] : undefined;
  return amountKey === "outstanding_amount" && amount === 0 ? null : amount;
}

/**
 * Le langage de ligne.
 *
 * La maquette lui donne une grammaire à deux bords : **le bord gauche dit ce
 * que la ligne EST** — son statut, porté par TONE_RULE — et **le bord droit dit
 * ce que l'utilisateur a FAIT**, pressé puis sélectionné. Les deux ne se
 * disputent jamais, puisqu'ils ne parlent pas de la même chose.
 *
 * Cinq états : repos, survol (fond), pressé (fond + bord droit sourd),
 * sélectionné (fond + bord droit accent), focus clavier (contour accent).
 */
function rowClasses(
  selected: boolean,
  interactive: boolean,
  struck = false,
): string {
  return [
    "transition-colors",
    struck && "line-through text-ink-faint",
    interactive && "cursor-pointer",
    selected ? "bg-row-selected" : "hover:bg-row-hover",
    // Le fond de sélection s'allume dès l'enfoncement, avant le relâchement :
    // la ligne accuse le geste au moment où il est fait, pas quand il aboutit.
    interactive && !selected && "active:bg-row-selected",
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
  ].filter(Boolean).join(" ");
}

/**
 * Le bord droit de sélection.
 *
 * Les 2 px sont réservés en transparent au repos : sans cette réserve, la ligne
 * se décalerait de deux pixels à l'instant où on la sélectionne.
 *
 * En tableau large ces classes vont sur la DERNIÈRE CELLULE, pas sur la ligne —
 * un `border-right` posé sur `<tr>` ne se peint pas en `border-collapse`, même
 * raison que pour le liseré de statut à gauche. En mobile et en panneau, où la
 * ligne est une div, elles vont sur la ligne.
 */
function selectionEdge(selected: boolean, interactive: boolean): string {
  return [
    "border-r-2",
    selected ? "border-r-accent" : "border-r-transparent",
    // L'état pressé se distingue de la sélection par un accent plus sourd.
    interactive && !selected && "active:border-r-accent-edge",
  ].filter(Boolean).join(" ");
}

/* ── Large ────────────────────────────────────────────────────────── */

function WideTable(
  {
    columns,
    rows,
    shape,
    statusKey,
    sortKey,
    sortDir,
    onSort,
    detail,
    clickIntent,
    hasDetailControls,
  }:
    & ModeProps
    & {
      statusKey?: string;
      sortKey: string | null;
      sortDir: SortDir;
      onSort: (key: string) => void;
    },
) {
  const t = useT();
  return (
    <table class="w-full table-fixed border-collapse">
      <thead>
        <tr class="bg-sunken">
          {columns.map((column, index) => (
            <th
              key={column.id}
              scope="col"
              aria-sort={sortKey === column.id
                ? (sortDir === "desc" ? "descending" : "ascending")
                : "none"}
              class={[
                "border-b border-line py-[7px] font-normal",
                index === 0 ? "pl-4 pr-3.5" : "px-3.5",
                column.numeric ? "text-right" : "text-left",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onSort(column.id)}
                class={`font-mono text-micro uppercase tracking-label transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  sortKey === column.id ? "text-accent" : "text-ink-faint"
                }`}
              >
                {column.label}
                {sortKey === column.id && (
                  <svg
                    aria-hidden="true"
                    width="7"
                    height="5"
                    viewBox="0 0 7 5"
                    fill="none"
                    class="ml-1 inline-block text-accent"
                  >
                    {sortDir === "asc"
                      ? (
                        <path
                          d="M1 4L3.5 1L6 4"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      )
                      : (
                        <path
                          d="M1 1L3.5 4L6 1"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      )}
                  </svg>
                )}
              </button>
            </th>
          ))}
          {hasDetailControls && (
            <th scope="col" class="w-10 border-b border-line bg-sunken">
              <span class="sr-only">
                {t("doclist.detail.inspector_label")}
              </span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((raw, index) => {
          const { id, row, selected, interactionTarget, tone, struck } = shape(
            raw,
            index,
          );
          const active = selected || Boolean(interactionTarget?.selected);
          const interactive = Boolean(interactionTarget);
          return (
            <Fragment key={id}>
              <tr
                class={`border-b border-line-soft ${
                  rowClasses(active, interactive, struck)
                }`}
                {...contextInteractionProps(interactionTarget, {
                  arbiter: clickIntent,
                  key: `doclist-row:${id}`,
                })}
                role="row"
                aria-pressed={undefined}
                aria-selected={interactionTarget?.selected}
              >
                {columns.map((column, columnIndex) => {
                  const value = row[column.id];
                  const isFirst = columnIndex === 0;
                  const isLast = columnIndex === columns.length - 1;
                  return (
                    <td
                      key={column.id}
                      class={[
                        "truncate py-2",
                        // Le liseré occupe 2 px du padding gauche de la 1re cellule.
                        isFirst
                          ? `border-l-2 ${TONE_RULE[tone]} pl-[14px] pr-3.5`
                          : "px-3.5",
                        // Et le bord de sélection 2 px de la dernière : sur <tr>
                        // il ne se peindrait pas en border-collapse.
                        isLast && !hasDetailControls &&
                        selectionEdge(
                          Boolean(interactionTarget?.selected),
                          interactive,
                        ),
                        column.numeric
                          ? "text-right font-mono text-cell tabular-nums"
                          : isFirst
                          ? "font-mono text-data"
                          : "text-cell",
                        // La première cellule (ID) est en accent-text quand la ligne
                        // est sélectionnée : elle sert d'ancre visuelle. Les autres
                        // cellules restent en text-ink (légèrement plus clair).
                        isFirst && active
                          ? "text-accent-text"
                          : active
                          ? "text-ink"
                          : "text-ink-2",
                      ].filter(Boolean).join(" ")}
                    >
                      {statusKey === column.id && typeof value === "string"
                        ? <StatusCell value={value} />
                        : value == null
                        ? <span class="text-ink-ghost">—</span>
                        // La première colonne porte l'identifiant : elle se
                        // tronque par la gauche, seule la fin distingue les pièces.
                        : isFirst
                        ? shortenId(formatCell(value))
                        : formatCell(value)}
                    </td>
                  );
                })}
                {hasDetailControls && (
                  <td
                    class={`w-10 p-0 text-center ${
                      selectionEdge(
                        Boolean(interactionTarget?.selected),
                        interactive,
                      )
                    }`}
                  >
                    <RowDetailToggle target={interactionTarget} />
                  </td>
                )}
              </tr>
              {selected && detail && (
                <tr>
                  <td
                    class="p-0"
                    colSpan={columns.length + (hasDetailControls ? 1 : 0)}
                  >
                    {detail}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Mobile ───────────────────────────────────────────────────────── */

/**
 * Grille fixe : l'identifiant et le montant ont une largeur arrêtée, le tiers
 * prend ce qui reste et s'ellipse. Écrite en dur plutôt que calculée — Tailwind
 * scanne du texte source, une classe composée à l'exécution ne produirait rien.
 */
const MOBILE_GRID = "grid-cols-[92px_1fr_78px]";

const MOBILE_HEAD =
  "font-mono text-nano uppercase tracking-label text-ink-faint";

/**
 * Le tableau compact du mobile.
 *
 * Les lignes font 40 px de haut : c'est une cible tactile, pas une décision
 * typographique. L'identifiant tombe à son dernier segment (`…00046`) — à 92 px
 * il n'y a pas la place pour l'exercice, et c'est le numéro qui distingue.
 */
function CompactTable(
  {
    columns,
    rows,
    shape,
    amountKey,
    detail,
    clickIntent,
    hasDetailControls,
  }: ModeProps,
) {
  const t = useT();
  const { idKey, labelKey } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );

  return (
    <div>
      <div class="flex border-y border-line bg-sunken">
        <div class={`grid ${MOBILE_GRID} min-w-0 flex-1 px-3 py-1.5`}>
          <span class={MOBILE_HEAD}>{t("doclist.table.header.id")}</span>
          <span class={MOBILE_HEAD}>{t("doclist.table.header.party")}</span>
          <span class={`${MOBILE_HEAD} text-right`}>
            {t("doclist.table.header.due")}
          </span>
        </div>
        {hasDetailControls && <span aria-hidden="true" class="w-10" />}
      </div>

      <ul>
        {rows.map((raw, index) => {
          const { id, row, selected, interactionTarget, tone, struck } = shape(
            raw,
            index,
          );
          const active = selected || Boolean(interactionTarget?.selected);
          const interactive = Boolean(interactionTarget);
          const due = dueValue(row, amountKey);

          return (
            <li key={id}>
              <div
                class={[
                  "flex min-h-10 items-stretch",
                  `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                  // Ici la ligne est une div : le bord droit tient dessus.
                  selectionEdge(
                    Boolean(interactionTarget?.selected),
                    interactive,
                  ),
                  active ? "bg-row-selected" : "hover:bg-row-hover",
                ].join(" ")}
              >
                <div
                  class={`grid ${MOBILE_GRID} min-w-0 flex-1 items-center px-3 ${
                    rowClasses(active, interactive, struck)
                  }`}
                  {...contextInteractionProps(interactionTarget, {
                    arbiter: clickIntent,
                    key: `doclist-row:${id}`,
                  })}
                >
                  <span
                    class={`font-mono text-data ${
                      active ? "text-accent-text" : "text-ink-2"
                    }`}
                  >
                    {idKey ? shortenId(formatCell(row[idKey]), 10, 1) : ""}
                  </span>
                  <span class="truncate pr-2 text-data text-ink-muted">
                    {labelKey ? formatCell(row[labelKey]) : ""}
                  </span>
                  <span
                    class={`text-right font-mono text-data tabular-nums ${
                      due == null
                        ? "text-ink-dim"
                        : `font-medium ${TONE_AMOUNT[tone]}`
                    }`}
                  >
                    {due == null ? "—" : formatCell(due)}
                  </span>
                </div>
                {hasDetailControls && (
                  <RowDetailToggle target={interactionTarget} touch />
                )}
              </div>
              {selected && detail}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Panneau latéral ──────────────────────────────────────────────── */

/**
 * Les lignes empilées du panneau latéral.
 *
 * Seul mode à renoncer au tableau : un panneau de 380 px collé à une
 * application de bureau sert à parcourir, pas à comparer, et deux lignes
 * lisibles y valent mieux que trois colonnes serrées.
 */
function StackedList(
  {
    columns,
    rows,
    shape,
    amountKey,
    detail,
    clickIntent,
    hasDetailControls,
  }: ModeProps,
) {
  const { idKey, labelKey } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );

  return (
    <ul class="flex flex-col">
      {rows.map((raw, index) => {
        const { id, row, selected, interactionTarget, tone, struck } = shape(
          raw,
          index,
        );
        const active = selected || Boolean(interactionTarget?.selected);
        const interactive = Boolean(interactionTarget);
        const due = dueValue(row, amountKey);

        return (
          <li key={id}>
            <div
              class={[
                "flex min-h-10 items-stretch",
                `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                selectionEdge(
                  Boolean(interactionTarget?.selected),
                  interactive,
                ),
                active ? "bg-row-selected" : "hover:bg-row-hover",
              ].join(" ")}
            >
              <div
                class={`flex min-w-0 flex-1 items-center justify-between gap-2.5 px-3 py-[9px] ${
                  rowClasses(active, interactive, struck)
                }`}
                {...contextInteractionProps(interactionTarget, {
                  arbiter: clickIntent,
                  key: `doclist-row:${id}`,
                })}
              >
                <div class="flex min-w-0 flex-col gap-px">
                  <span
                    class={`truncate font-mono text-note ${
                      active ? "text-accent-text" : "text-ink-2"
                    }`}
                  >
                    {idKey ? shortenId(formatCell(row[idKey])) : ""}
                  </span>
                  {labelKey && (
                    <span class="truncate text-note text-ink-muted">
                      {formatCell(row[labelKey])}
                    </span>
                  )}
                </div>
                <span
                  class={`shrink-0 font-mono text-cell tabular-nums ${
                    due == null
                      ? "text-ink-ghost"
                      : `font-medium ${TONE_AMOUNT[tone]}`
                  }`}
                >
                  {due == null ? "—" : formatCell(due)}
                </span>
              </div>
              {hasDetailControls && (
                <RowDetailToggle target={interactionTarget} touch />
              )}
            </div>
            {selected && detail}
          </li>
        );
      })}
    </ul>
  );
}
