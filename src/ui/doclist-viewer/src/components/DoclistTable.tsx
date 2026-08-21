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
import type { ViewerLayout } from "~/shared/useViewerLayout";
import { useT } from "~/shared/i18n-hook";
import { formatCell, isStatusField } from "../helpers";
import { pickNarrowColumns, shortenId } from "../columns";
import { StatusCell } from "./StatusCell";
import type { SortDir } from "../types";

export interface DoclistColumn {
  id: string;
  label: string;
  numeric: boolean;
}

interface RowShape {
  id: string;
  row: Record<string, unknown>;
  selected: boolean;
  tone: Tone;
}

interface CommonProps {
  columns: DoclistColumn[];
  rows: Record<string, unknown>[];
  rowId: (row: Record<string, unknown>, index: number) => string;
  selectedId: string | null;
  onSelect?: (row: Record<string, unknown>) => void;
}

type ModeProps = CommonProps & {
  shape: (row: Record<string, unknown>, index: number) => RowShape;
  amountKey?: string;
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
  if (common.rows.length === 0) {
    return (
      <p class="px-4 py-10 text-center text-data text-ink-muted">
        {t("doclist.table.no_match")}
      </p>
    );
  }

  /** Le statut ne s'affiche qu'en large, mais il colore la ligne partout. */
  const statusKey = common.columns.find((c) => isStatusField(c.id))?.id;

  const shape = (row: Record<string, unknown>, index: number): RowShape => {
    const id = common.rowId(row, index);
    return {
      id,
      row,
      selected: common.selectedId === id,
      tone: statusKey ? toneForStatus(String(row[statusKey] ?? "")) : "neutral",
    };
  };

  if (layout === "mobile") {
    return <CompactTable {...common} shape={shape} amountKey={amountKey} />;
  }
  if (layout === "panel") {
    return <StackedList {...common} shape={shape} amountKey={amountKey} />;
  }
  return (
    <WideTable
      {...common}
      shape={shape}
      statusKey={statusKey}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
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
function rowClasses(selected: boolean, interactive: boolean): string {
  return [
    "transition-colors",
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

/** Active une ligne au clavier comme au clic, sans avaler les autres touches. */
function activationHandlers(onActivate?: () => void) {
  if (!onActivate) return {};
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onActivate();
    },
  };
}

/* ── Large ────────────────────────────────────────────────────────── */

function WideTable(
  { columns, rows, shape, statusKey, sortKey, sortDir, onSort, onSelect }:
    & ModeProps
    & {
      statusKey?: string;
      sortKey: string | null;
      sortDir: SortDir;
      onSort: (key: string) => void;
    },
) {
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
        </tr>
      </thead>
      <tbody>
        {rows.map((raw, index) => {
          const { id, row, selected, tone } = shape(raw, index);
          return (
            <tr
              key={id}
              aria-selected={onSelect ? selected : undefined}
              class={`border-b border-line-soft ${
                rowClasses(selected, !!onSelect)
              }`}
              {...activationHandlers(onSelect && (() => onSelect(row)))}
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
                      isLast && selectionEdge(selected, !!onSelect),
                      column.numeric
                        ? "text-right font-mono text-cell tabular-nums"
                        : isFirst
                        ? "font-mono text-data"
                        : "text-cell",
                      // La première cellule (ID) est en accent-text quand la ligne
                      // est sélectionnée : elle sert d'ancre visuelle. Les autres
                      // cellules restent en text-ink (légèrement plus clair).
                      isFirst && selected
                        ? "text-accent-text"
                        : selected
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
            </tr>
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
  { columns, rows, shape, amountKey, onSelect }: ModeProps,
) {
  const t = useT();
  const { idKey, labelKey } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );

  return (
    <div>
      <div
        class={`grid ${MOBILE_GRID} border-y border-line bg-sunken px-3 py-1.5`}
      >
        <span class={MOBILE_HEAD}>{t("doclist.table.header.id")}</span>
        <span class={MOBILE_HEAD}>{t("doclist.table.header.party")}</span>
        <span class={`${MOBILE_HEAD} text-right`}>
          {t("doclist.table.header.due")}
        </span>
      </div>

      <ul>
        {rows.map((raw, index) => {
          const { id, row, selected, tone } = shape(raw, index);
          const due = dueValue(row, amountKey);

          return (
            <li key={id}>
              <div
                role={onSelect ? "button" : undefined}
                aria-pressed={onSelect ? selected : undefined}
                class={[
                  `grid ${MOBILE_GRID} min-h-10 items-center px-3`,
                  `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                  // Ici la ligne est une div : le bord droit tient dessus.
                  selectionEdge(selected, !!onSelect),
                  rowClasses(selected, !!onSelect),
                ].join(" ")}
                {...activationHandlers(onSelect && (() => onSelect(row)))}
              >
                <span
                  class={`font-mono text-data ${
                    selected ? "text-accent-text" : "text-ink-2"
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
  { columns, rows, shape, amountKey, onSelect }: ModeProps,
) {
  const { idKey, labelKey } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );

  return (
    <ul class="flex flex-col">
      {rows.map((raw, index) => {
        const { id, row, selected, tone } = shape(raw, index);
        const due = dueValue(row, amountKey);

        return (
          <li key={id}>
            <div
              role={onSelect ? "button" : undefined}
              aria-pressed={onSelect ? selected : undefined}
              class={[
                "flex items-center justify-between gap-2.5 px-3 py-[9px]",
                `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                selectionEdge(selected, !!onSelect),
                rowClasses(selected, !!onSelect),
              ].join(" ")}
              {...activationHandlers(onSelect && (() => onSelect(row)))}
            >
              <div class="flex min-w-0 flex-col gap-px">
                <span
                  class={`truncate font-mono text-note ${
                    selected ? "text-accent-text" : "text-ink-2"
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
          </li>
        );
      })}
    </ul>
  );
}
