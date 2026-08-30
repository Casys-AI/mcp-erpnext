/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { DetailToggleButton } from "../DetailToggleButton.tsx";
import { formatNumber } from "../format";
import { type TFunction, useT } from "../i18n-hook";
import { useClickIntent } from "../useClickIntent.ts";
import type { ViewerLayout } from "../useViewerLayout";
import { CountBadge, cx, Label, TotalRow } from "../ui";
import {
  childTableColumnsForLayout,
  childTableHiddenEntries,
} from "./child-table-model.ts";
import type {
  ChildTableColumn,
  ChildTableModel,
  ChildTableRow,
  DocumentDisplayValue,
  DocumentFieldModel,
} from "./types.ts";
import { DocumentFieldValue } from "./ScalarFields";
import {
  contextInteractionProps,
  type ContextInteractionTarget,
} from "./context-interaction.ts";

export interface ChildTableSectionProps {
  table: ChildTableModel;
  layout: ViewerLayout;
  idPrefix?: string;
  class?: string;
  /** Actions permanentes d'une ligne (navigation, contexte), jamais un détail imbriqué. */
  renderRowActions?: (
    table: ChildTableModel,
    row: ChildTableRow,
    rowIndex: number,
  ) => ComponentChildren;
  /** Dans un détail déjà ouvert, les actions restent visibles sans disclosure. */
  rowActionsPlacement?: "disclosure" | "visible";
  /** La ligne elle-même rejoint le contexte ; ses boutons restent de la navigation. */
  renderRowContextTarget?: (
    table: ChildTableModel,
    row: ChildTableRow,
    rowIndex: number,
  ) => ContextInteractionTarget | undefined;
  /** Les fiches complètes peuvent révéler les colonnes cachées ; un accordéon non. */
  childRowsExpandable?: boolean;
  /** Disclosure unique, partage par toutes les tables de la fiche. */
  activeDisclosure: ChildRowDisclosure | null;
  onDisclosureChange: (next: ChildRowDisclosure | null) => void;
}

export interface ChildRowDisclosure {
  tableKey: string;
  rowIndex: number;
}

function valueText(value: DocumentDisplayValue | undefined, t: TFunction) {
  if (value === undefined || value === null || value === "") {
    return t("document.empty_value");
  }
  if (typeof value === "boolean") {
    return t(value ? "document.boolean.true" : "document.boolean.false");
  }
  if (typeof value === "number") {
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  return value;
}

function gridClass(layout: ViewerLayout, count: number): string {
  if (layout === "mobile") {
    if (count >= 3) return "grid-cols-[minmax(0,1fr)_52px_82px]";
    if (count === 2) return "grid-cols-[minmax(0,1fr)_82px]";
    return "grid-cols-1";
  }
  if (count >= 4) {
    return "grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(52px,0.7fr)_minmax(72px,0.8fr)]";
  }
  if (count === 3) {
    return "grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_minmax(72px,0.8fr)]";
  }
  if (count === 2) return "grid-cols-[minmax(0,1fr)_minmax(72px,0.6fr)]";
  return "grid-cols-1";
}

function cells(
  row: ChildTableRow,
  columns: readonly ChildTableColumn[],
  t: TFunction,
): ComponentChildren {
  return columns.map((column) => (
    <span
      key={column.key}
      class={cx(
        "min-w-0 truncate text-cell text-ink-2",
        column.numeric && "text-right font-mono tabular-nums",
      )}
      title={String(row[column.key] ?? "")}
    >
      {valueText(row[column.key], t)}
    </span>
  ));
}

function HiddenRowFields(
  { fields, layout }: {
    fields: readonly DocumentFieldModel[];
    layout: ViewerLayout;
  },
) {
  if (fields.length === 0) return null;
  return (
    <dl
      class={cx(
        "grid gap-x-4 gap-y-2 border-b border-line-soft bg-row-selected px-3 py-2.5",
        layout === "panel" ? "grid-cols-1" : "grid-cols-3",
      )}
    >
      {fields.map((field) => (
        <div key={field.key} class="flex min-w-0 flex-col gap-1">
          <dt class="font-mono text-nano uppercase tracking-label text-ink-faint">
            {field.label}
          </dt>
          <dd class="min-w-0 truncate text-data text-ink-2">
            <DocumentFieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function hasContent(value: ComponentChildren): boolean {
  return value !== undefined && value !== null && value !== false;
}

function RowDisclosurePanel({
  id,
  expanded,
  fields,
  actions,
  layout,
  panel,
}: {
  id: string;
  expanded: boolean;
  fields: readonly DocumentFieldModel[];
  actions: ComponentChildren;
  layout: ViewerLayout;
  panel: boolean;
}) {
  return (
    <div id={id} hidden={!expanded}>
      {fields.length > 0 && <HiddenRowFields fields={fields} layout={layout} />}
      {hasContent(actions) && (
        <div
          class={cx(
            "flex flex-wrap gap-1.5 border-b border-line-soft bg-sunken",
            panel ? "px-3.5 py-2" : "justify-end px-4 py-1.5",
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export function ChildTableSection({
  table,
  layout,
  idPrefix = "document-table",
  class: klass,
  renderRowActions,
  rowActionsPlacement = "disclosure",
  renderRowContextTarget,
  childRowsExpandable = true,
  activeDisclosure,
  onDisclosureChange,
}: ChildTableSectionProps) {
  const t = useT();
  const clickIntent = useClickIntent();
  const columns = childTableColumnsForLayout(table, layout);
  const tableId = `${idPrefix}-${table.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const panel = layout === "panel";
  const hasDisclosureColumn = childRowsExpandable ||
    (rowActionsPlacement === "disclosure" && Boolean(renderRowActions));

  function rowPresentation(row: ChildTableRow, rowIndex: number) {
    const hidden = childRowsExpandable
      ? childTableHiddenEntries(table, rowIndex, layout)
      : [];
    const rowActions = renderRowActions?.(table, row, rowIndex);
    const disclosedActions = rowActionsPlacement === "disclosure"
      ? rowActions
      : undefined;
    const visibleActions = rowActionsPlacement === "visible"
      ? rowActions
      : undefined;
    const canDisclose = hidden.length > 0 || hasContent(disclosedActions);
    const expanded = canDisclose &&
      activeDisclosure?.tableKey === table.key &&
      activeDisclosure.rowIndex === rowIndex;
    const rowPanelId = `${tableId}-row-${rowIndex}-details`;
    const contextTarget = renderRowContextTarget?.(table, row, rowIndex);
    const fallbackLabel = String(
      row[columns[0]?.key ?? ""] ?? `${table.label} ${rowIndex + 1}`,
    );
    const detailLabel = contextTarget?.detailLabel ?? fallbackLabel;
    const toggle = () =>
      onDisclosureChange(
        expanded ? null : { tableKey: table.key, rowIndex },
      );
    const interactionTarget: ContextInteractionTarget | undefined = canDisclose
      ? {
        ...(contextTarget ?? { onActivate: () => {} }),
        label: t(
          contextTarget?.selected !== undefined
            ? (expanded
              ? "document.row.close_detail"
              : "document.row.open_detail")
            : (expanded
              ? "document.row.close_detail_only"
              : "document.row.open_detail_only"),
          { label: detailLabel },
        ),
        detailLabel,
        expanded,
        controls: rowPanelId,
        onDoubleActivate: toggle,
      }
      : contextTarget;
    return {
      hidden,
      rowActions: disclosedActions,
      visibleActions,
      canDisclose,
      expanded,
      rowPanelId,
      interactionTarget,
      detailLabel,
      toggle,
    };
  }

  return (
    <section
      aria-label={table.label}
      class={cx("flex min-w-0 flex-col", klass)}
    >
      <div class="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
        <Label>{table.label}</Label>
        <CountBadge narrow>{table.rows.length}</CountBadge>
      </div>

      {columns.length === 0
        ? (
          <p class="px-4 pb-3.5 font-mono text-chip text-ink-faint">
            {t("document.table.no_columns")}
          </p>
        )
        : panel
        ? (
          <div class="flex flex-col border-t border-line-soft">
            {table.rows.map((row, rowIndex) => {
              const presentation = rowPresentation(row, rowIndex);
              const active = Boolean(
                presentation.interactionTarget?.selected ||
                  presentation.expanded,
              );
              const content = (
                <span class="flex flex-col gap-1.5 px-3.5 py-2.5">
                  {columns.map((column) => (
                    <span
                      key={column.key}
                      class="flex min-w-0 items-baseline justify-between gap-3"
                    >
                      <span class="shrink-0 font-mono text-chip text-ink-faint">
                        {column.label}
                      </span>
                      <span
                        class={cx(
                          "min-w-0 truncate text-right text-data text-ink-2",
                          column.numeric && "font-mono tabular-nums",
                        )}
                      >
                        {valueText(row[column.key], t)}
                      </span>
                    </span>
                  ))}
                </span>
              );
              return (
                <div key={rowIndex}>
                  <div
                    class={cx(
                      "flex min-w-0 items-stretch border-b border-r-2 border-line-soft transition-colors",
                      active
                        ? "border-r-accent bg-row-selected"
                        : "border-r-transparent hover:bg-row-hover",
                    )}
                  >
                    <div
                      {...contextInteractionProps(
                        presentation.interactionTarget,
                        {
                          arbiter: clickIntent,
                          key: presentation.rowPanelId,
                        },
                      )}
                      class={cx(
                        "min-w-0 flex-1",
                        presentation.interactionTarget &&
                          "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      )}
                    >
                      {content}
                    </div>
                    {presentation.canDisclose && (
                      <DetailToggleButton
                        expanded={presentation.expanded}
                        label={presentation.detailLabel}
                        controls={presentation.rowPanelId}
                        onToggle={presentation.toggle}
                        touch
                      />
                    )}
                  </div>
                  {hasContent(presentation.visibleActions) && (
                    <div class="flex flex-wrap justify-end gap-1.5 border-b border-line-soft bg-sunken px-3.5 py-1.5">
                      {presentation.visibleActions}
                    </div>
                  )}
                  {presentation.canDisclose && (
                    <RowDisclosurePanel
                      id={presentation.rowPanelId}
                      expanded={presentation.expanded}
                      fields={presentation.hidden}
                      actions={presentation.rowActions}
                      layout={layout}
                      panel
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
        : (
          <div class="min-w-0 border-t border-line-soft">
            <div role="row" class="flex border-b border-line bg-sunken">
              <div
                class={cx(
                  "grid min-w-0 flex-1 gap-3 px-4 py-1.5",
                  gridClass(layout, columns.length),
                )}
              >
                {columns.map((column) => (
                  <span
                    key={column.key}
                    role="columnheader"
                    class={cx(
                      "truncate font-mono text-nano uppercase tracking-label text-ink-faint",
                      column.numeric && "text-right",
                    )}
                  >
                    {column.label}
                  </span>
                ))}
              </div>
              {hasDisclosureColumn && <span aria-hidden="true" class="w-10" />}
            </div>
            {table.rows.map((row, rowIndex) => {
              const presentation = rowPresentation(row, rowIndex);
              const active = Boolean(
                presentation.interactionTarget?.selected ||
                  presentation.expanded,
              );
              const rowClass = cx(
                "grid items-center gap-3 border-l-2 border-l-transparent px-4",
                layout === "mobile" ? "min-h-10 py-1" : "min-h-9 py-2",
                gridClass(layout, columns.length),
              );
              return (
                <div key={rowIndex}>
                  <div
                    class={cx(
                      "flex min-w-0 items-stretch border-b border-r-2 border-line-soft transition-colors",
                      active
                        ? "border-r-accent bg-row-selected"
                        : "border-r-transparent hover:bg-row-hover",
                    )}
                  >
                    <div
                      {...contextInteractionProps(
                        presentation.interactionTarget,
                        {
                          arbiter: clickIntent,
                          key: presentation.rowPanelId,
                        },
                      )}
                      class={cx(
                        rowClass,
                        "min-w-0 flex-1",
                        presentation.interactionTarget &&
                          "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      )}
                    >
                      {cells(row, columns, t)}
                    </div>
                    {presentation.canDisclose && (
                      <DetailToggleButton
                        expanded={presentation.expanded}
                        label={presentation.detailLabel}
                        controls={presentation.rowPanelId}
                        onToggle={presentation.toggle}
                        touch={layout === "mobile"}
                      />
                    )}
                  </div>
                  {hasContent(presentation.visibleActions) && (
                    <div class="flex flex-wrap justify-end gap-1.5 border-b border-line-soft bg-sunken px-4 py-1.5">
                      {presentation.visibleActions}
                    </div>
                  )}
                  {presentation.canDisclose && (
                    <RowDisclosurePanel
                      id={presentation.rowPanelId}
                      expanded={presentation.expanded}
                      fields={presentation.hidden}
                      actions={presentation.rowActions}
                      layout={layout}
                      panel={false}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

      {table.total && (
        <TotalRow label={table.total.label} layout={layout}>
          {formatNumber(table.total.value, 2)}
        </TotalRow>
      )}
    </section>
  );
}
