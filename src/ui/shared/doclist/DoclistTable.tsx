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
import { DisclosureChevron } from "@mcpview/components/preact/controls";
import type { ContextInteractionTarget } from "~/shared/document/context-interaction";
import { useVisualItemGestures } from "@mcpview/components/preact/controls";
import { visualRowProps } from "~/shared/document/visual-row-props.ts";
import type { ViewerLayout } from "~/shared/useViewerLayout";
import { useT } from "~/shared/i18n-hook";
import { formatCell, isStatusField } from "./helpers";
import { pickNarrowColumns, shortenId } from "./columns";
import { StatusCell } from "./StatusCell";
import { doclistRowEvents } from "./selection.ts";
import { getBrowserPlatform } from "~/shared/platform.ts";
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
  open: boolean;
  interactionTarget?: ContextInteractionTarget;
  tone: Tone;
  struck: boolean;
}

interface CommonProps {
  columns: DoclistColumn[];
  rows: Record<string, unknown>[];
  rowId: (row: Record<string, unknown>, index: number) => string;
  selectedId: string | null;
  isFollowed?: (row: Record<string, unknown>) => boolean;
  /** La ligne qu'une action vient de changer : barrée sur place, pas rechargée. */
  struckId?: string | null;
  interactionTarget?: (
    row: Record<string, unknown>,
    index: number,
  ) => ContextInteractionTarget | undefined;
  /** Détail accordéon inséré immédiatement sous la ligne sélectionnée. */
  detail?: ComponentChildren;
  selection?: DoclistSelectionControls;
}

interface DoclistSelectionControls {
  pressedFor: (name: string) => boolean | "mixed";
  onToggle: (
    row: Record<string, unknown>,
    index: number,
    shiftKey: boolean,
  ) => void;
  onAdd: (
    rows: readonly { row: Record<string, unknown>; index: number }[],
  ) => void;
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
  const rowsById = new Map(common.rows.map((row, index) => [
    common.rowId(row, index),
    { row, index },
  ]));
  const visualItemsRef = useVisualItemGestures({
    onActivate: (id) => {
      const entry = rowsById.get(id);
      if (entry) {
        common.interactionTarget?.(entry.row, entry.index)?.onActivate();
      }
    },
    onToggle: (id) => {
      const entry = rowsById.get(id);
      if (entry) common.selection?.onToggle(entry.row, entry.index, false);
    },
    onAdd: (ids) => {
      const entries = ids.flatMap((id) => {
        const entry = rowsById.get(id);
        return entry ? [entry] : [];
      });
      if (entries.length) common.selection?.onAdd(entries);
    },
  });
  /** Le statut ne s'affiche qu'en large, mais il colore la ligne partout. */
  const statusKey = common.columns.find((c) => isStatusField(c.id))?.id;
  const shape = (row: Record<string, unknown>, index: number): RowShape => {
    const id = common.rowId(row, index);
    return {
      id,
      row,
      selected: common.selectedId === id,
      open: common.selectedId === id || Boolean(common.isFollowed?.(row)),
      interactionTarget: common.interactionTarget?.(row, index),
      struck: common.struckId === id,
      tone: statusKey ? toneForStatus(String(row[statusKey] ?? "")) : "neutral",
    };
  };

  const props = {
    ...common,
    shape,
    amountKey,
  };
  return (
    <div
      ref={visualItemsRef}
      data-visual-selection-surface={common.selection ? "" : undefined}
      class={common.selection ? "touch-pan-y" : undefined}
    >
      {layout === "mobile"
        ? <CompactTable {...props} />
        : layout === "panel"
        ? <StackedList {...props} />
        : (
          <WideTable
            {...props}
            statusKey={statusKey}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
        )}
      {common.rows.length === 0 && (
        <p class="px-4 py-10 text-center text-data text-ink-muted">
          {t("doclist.table.no_match")}
        </p>
      )}
    </div>
  );
}

function rowInteractionProps(
  target: ContextInteractionTarget | undefined,
  id: string,
  row: Record<string, unknown>,
  index: number,
  selection: DoclistSelectionControls | undefined,
) {
  return {
    ...visualRowProps(id, target, selection?.pressedFor(id)),
    ...doclistRowEvents({
      platform: getBrowserPlatform(),
      onToggle: selection
        ? (shiftKey) => selection.onToggle(row, index, shiftKey)
        : undefined,
    }),
  };
}

function RowIdentity({ interactive, open, children }: {
  interactive: boolean;
  open: boolean;
  children: ComponentChildren;
}) {
  return (
    <span class="inline-flex max-w-full items-center gap-1 align-middle">
      {interactive && <DisclosureChevron expanded={open} />}
      <span class="min-w-0 truncate">{children}</span>
    </span>
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

function columnLabel(columns: DoclistColumn[], key?: string): string {
  return columns.find((column) => column.id === key)?.label ?? "";
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

function wideColumnLayout(column: DoclistColumn, isIdentity: boolean) {
  const date = column.id === "date" || column.id.endsWith("_date");
  const numeric = !isIdentity && column.numeric;
  return {
    compact: !isIdentity && (numeric || date || isStatusField(column.id)),
    endAligned: !isIdentity && (numeric || date),
  };
}

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
    selection,
  }:
    & ModeProps
    & {
      statusKey?: string;
      sortKey: string | null;
      sortDir: SortDir;
      onSort: (key: string) => void;
    },
) {
  return (
    <table class="w-full table-auto border-collapse">
      <thead>
        <tr class="bg-sunken">
          {columns.map((column, index) => {
            const { compact, endAligned } = wideColumnLayout(
              column,
              index === 0,
            );
            return (
              <th
                key={column.id}
                scope="col"
                aria-sort={sortKey === column.id
                  ? (sortDir === "desc" ? "descending" : "ascending")
                  : "none"}
                class={[
                  "border-b border-line py-[7px] font-normal",
                  index === 0 ? "pl-4 pr-3.5" : "px-3.5",
                  compact && "w-px",
                  endAligned ? "text-right" : "text-left",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => onSort(column.id)}
                  class={`w-max max-w-[min(28ch,15vw)] [overflow-wrap:anywhere] [text-align:inherit] font-mono text-micro uppercase tracking-label transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((raw, index) => {
          const { id, row, selected, open, interactionTarget, tone, struck } =
            shape(
              raw,
              index,
            );
          const interactive = Boolean(interactionTarget);
          const {
            role,
            tabIndex,
            "aria-pressed": pressed,
            "aria-label": label,
            "aria-keyshortcuts": shortcuts,
            "aria-expanded": expanded,
            "aria-controls": controls,
            ...pointerProps
          } = rowInteractionProps(interactionTarget, id, raw, index, selection);
          return (
            <Fragment key={id}>
              <tr
                class={`border-b border-line-soft [@media(pointer:coarse)]:h-11 ${
                  rowClasses(open, interactive, struck)
                }`}
                {...pointerProps}
                data-mcp-view-context-row={pressed ? "selected" : "idle"}
                aria-current={open || undefined}
              >
                {columns.map((column, columnIndex) => {
                  const value = row[column.id];
                  const isFirst = columnIndex === 0;
                  const isLast = columnIndex === columns.length - 1;
                  const { compact, endAligned } = wideColumnLayout(
                    column,
                    isFirst,
                  );
                  const cell =
                    statusKey === column.id && typeof value === "string"
                      ? <StatusCell value={value} />
                      : value == null
                      ? <span class="text-ink-ghost">—</span>
                      : isFirst
                      ? shortenId(formatCell(value))
                      : formatCell(value);
                  return (
                    <td
                      key={column.id}
                      class={[
                        "py-2",
                        // Le liseré occupe 2 px du padding gauche de la 1re cellule.
                        isFirst
                          ? `border-l-2 ${TONE_RULE[tone]} pl-[14px] pr-3.5`
                          : "px-3.5",
                        // Et le bord de sélection 2 px de la dernière : sur <tr>
                        // il ne se peindrait pas en border-collapse.
                        isLast &&
                        selectionEdge(
                          open,
                          interactive,
                        ),
                        endAligned && "text-right font-mono tabular-nums",
                        isFirst ? "font-mono text-data" : "text-cell",
                        // La première cellule (ID) est en accent-text quand la ligne
                        // est sélectionnée : elle sert d'ancre visuelle. Les autres
                        // cellules restent en text-ink (légèrement plus clair).
                        isFirst && open
                          ? "text-accent-text"
                          : open
                          ? "text-ink"
                          : "text-ink-2",
                      ].filter(Boolean).join(" ")}
                    >
                      <div
                        class={compact
                          ? "max-w-[22ch] truncate"
                          : "[contain:inline-size]"}
                      >
                        {isFirst
                          ? (
                            <span
                              role={role}
                              tabIndex={tabIndex}
                              aria-pressed={pressed}
                              aria-label={label}
                              aria-keyshortcuts={shortcuts}
                              aria-expanded={expanded}
                              aria-controls={controls}
                              data-visual-activate
                              class="inline-block max-w-full rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              <RowIdentity
                                interactive={interactive}
                                open={open}
                              >
                                {cell}
                              </RowIdentity>
                            </span>
                          )
                          : <span class="block truncate">{cell}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
              {selected && detail && (
                <tr>
                  <td
                    class="p-0"
                    colSpan={columns.length}
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
 * L'identifiant et la valeur finale sont plafonnés. Le libellé reçoit
 * l'espace restant dans la même grille pour l'en-tête et les lignes.
 */
const MOBILE_GRID = "grid-cols-[min(27%,92px)_minmax(0,1fr)_min(23%,78px)]";
const MOBILE_GRID_WITHOUT_TRAILING = "grid-cols-[min(27%,92px)_minmax(0,1fr)]";

const MOBILE_HEAD =
  "truncate font-mono text-nano uppercase tracking-label text-ink-faint";

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
    selection,
  }: ModeProps,
) {
  const t = useT();
  const { idKey, labelKey, trailingKey: proposedTrailing } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );
  const trailingKey = proposedTrailing === idKey ? undefined : proposedTrailing;
  const trailingIsAmount = trailingKey !== undefined &&
    trailingKey === amountKey;
  const mobileGrid = labelKey
    ? (trailingKey ? MOBILE_GRID : MOBILE_GRID_WITHOUT_TRAILING)
    : trailingKey
    ? "grid-cols-[minmax(0,1fr)_min(23%,78px)]"
    : "grid-cols-1";

  return (
    <div>
      <div class="flex items-center border-y border-line bg-sunken px-[2px]">
        <div class={`grid ${mobileGrid} min-w-0 flex-1 px-3 py-1.5`}>
          <span class={MOBILE_HEAD}>
            {amountKey
              ? t("doclist.table.header.id")
              : columnLabel(columns, idKey)}
          </span>
          {labelKey && (
            <span class={MOBILE_HEAD}>
              {amountKey
                ? t("doclist.table.header.party")
                : columnLabel(columns, labelKey)}
            </span>
          )}
          {trailingKey && (
            <span class={`${MOBILE_HEAD} text-right`}>
              {amountKey
                ? t("doclist.table.header.due")
                : columnLabel(columns, trailingKey)}
            </span>
          )}
        </div>
      </div>

      <ul>
        {rows.map((raw, index) => {
          const { id, row, selected, open, interactionTarget, tone, struck } =
            shape(
              raw,
              index,
            );
          const interactive = Boolean(interactionTarget);
          const trailingValue = trailingIsAmount
            ? dueValue(row, amountKey)
            : trailingKey
            ? row[trailingKey]
            : undefined;

          return (
            <li
              key={id}
              data-mcp-view-context-row={selection?.pressedFor(id)
                ? "selected"
                : "idle"}
              data-mcp-view-context-row-break={selected && detail
                ? ""
                : undefined}
            >
              <div
                class={[
                  "flex min-h-10 items-stretch [@media(pointer:coarse)]:min-h-[45px]",
                  `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                  // Ici la ligne est une div : le bord droit tient dessus.
                  selectionEdge(
                    open,
                    interactive,
                  ),
                  open ? "bg-row-selected" : "hover:bg-row-hover",
                ].join(" ")}
              >
                <div
                  class={`grid ${mobileGrid} min-w-0 flex-1 items-center px-3 ${
                    rowClasses(open, interactive, struck)
                  }`}
                  data-mcp-view-context-row-outline
                  {...rowInteractionProps(
                    interactionTarget,
                    id,
                    raw,
                    index,
                    selection,
                  )}
                  aria-current={open || undefined}
                >
                  <span
                    class={`min-w-0 truncate font-mono text-data ${
                      open ? "text-accent-text" : "text-ink-2"
                    }`}
                  >
                    <RowIdentity interactive={interactive} open={open}>
                      {idKey ? shortenId(formatCell(row[idKey]), 10, 1) : ""}
                    </RowIdentity>
                  </span>
                  {labelKey && (
                    <span class="truncate pr-2 text-data text-ink-muted">
                      {formatCell(row[labelKey])}
                    </span>
                  )}
                  {trailingKey && (
                    <span
                      class={`truncate text-right font-mono text-data ${
                        trailingIsAmount ? "tabular-nums" : ""
                      } ${
                        trailingValue == null
                          ? "text-ink-dim"
                          : trailingIsAmount
                          ? `font-medium ${TONE_AMOUNT[tone]}`
                          : "text-ink-muted"
                      }`}
                    >
                      {trailingValue == null ? "—" : formatCell(trailingValue)}
                    </span>
                  )}
                </div>
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
    selection,
  }: ModeProps,
) {
  const { idKey, labelKey, trailingKey } = pickNarrowColumns(
    columns,
    amountKey,
    isStatusField,
  );
  const trailingIsAmount = trailingKey !== undefined &&
    trailingKey === amountKey;

  return (
    <>
      <ul class="flex flex-col">
        {rows.map((raw, index) => {
          const { id, row, selected, open, interactionTarget, tone, struck } =
            shape(
              raw,
              index,
            );
          const interactive = Boolean(interactionTarget);
          const trailingValue = trailingIsAmount
            ? dueValue(row, amountKey)
            : trailingKey
            ? row[trailingKey]
            : undefined;

          return (
            <li
              key={id}
              data-mcp-view-context-row={selection?.pressedFor(id)
                ? "selected"
                : "idle"}
              data-mcp-view-context-row-break={selected && detail
                ? ""
                : undefined}
            >
              <div
                class={[
                  "flex min-h-10 items-stretch [@media(pointer:coarse)]:min-h-[45px]",
                  `border-b border-line-soft border-l-2 ${TONE_RULE[tone]}`,
                  selectionEdge(
                    open,
                    interactive,
                  ),
                  open ? "bg-row-selected" : "hover:bg-row-hover",
                ].join(" ")}
              >
                <div
                  class={`flex min-w-0 flex-1 items-center justify-between gap-2.5 px-3 py-[9px] ${
                    rowClasses(open, interactive, struck)
                  }`}
                  data-mcp-view-context-row-outline
                  {...rowInteractionProps(
                    interactionTarget,
                    id,
                    raw,
                    index,
                    selection,
                  )}
                  aria-current={open || undefined}
                >
                  <div class="flex min-w-0 flex-col gap-px">
                    <span
                      class={`truncate font-mono text-note ${
                        open ? "text-accent-text" : "text-ink-2"
                      }`}
                    >
                      <RowIdentity interactive={interactive} open={open}>
                        {idKey ? shortenId(formatCell(row[idKey])) : ""}
                      </RowIdentity>
                    </span>
                    {labelKey && (
                      <span class="truncate text-note text-ink-muted">
                        {formatCell(row[labelKey])}
                      </span>
                    )}
                  </div>
                  {trailingKey && (
                    <span
                      class={`max-w-[45%] shrink-0 truncate font-mono text-cell ${
                        trailingIsAmount ? "tabular-nums" : ""
                      } ${
                        trailingValue == null
                          ? "text-ink-ghost"
                          : trailingIsAmount
                          ? `font-medium ${TONE_AMOUNT[tone]}`
                          : "text-ink-muted"
                      }`}
                    >
                      {trailingValue == null ? "—" : formatCell(trailingValue)}
                    </span>
                  )}
                </div>
              </div>
              {selected && detail}
            </li>
          );
        })}
      </ul>
    </>
  );
}
