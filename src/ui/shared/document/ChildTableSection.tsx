/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { formatNumber } from "../format";
import { type TFunction, useT } from "../i18n-hook";
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

export interface ChildTableSectionProps {
  table: ChildTableModel;
  layout: ViewerLayout;
  idPrefix?: string;
  class?: string;
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
  { fields, id, layout }: {
    fields: readonly DocumentFieldModel[];
    id: string;
    layout: ViewerLayout;
  },
) {
  if (fields.length === 0) return null;
  return (
    <dl
      id={id}
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

function ExpandableRow({
  children,
  rowId,
  expanded,
  onToggle,
  class: klass,
  label,
}: {
  children: ComponentChildren;
  rowId: string;
  expanded: boolean;
  onToggle: () => void;
  class: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={rowId}
      onClick={onToggle}
      class={cx(
        "w-full border-b border-line-soft text-left transition-colors",
        "hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        expanded && "border-r-2 border-r-accent bg-row-selected",
        klass,
      )}
    >
      {children}
    </button>
  );
}

export function ChildTableSection({
  table,
  layout,
  idPrefix = "document-table",
  class: klass,
}: ChildTableSectionProps) {
  const t = useT();
  const [open, setOpen] = useState<{ table: string; row: number } | null>(null);
  const columns = childTableColumnsForLayout(table, layout);
  const tableId = `${idPrefix}-${table.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const panel = layout === "panel";

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
              const hidden = childTableHiddenEntries(table, rowIndex, layout);
              const expanded = open?.table === tableId &&
                open.row === rowIndex;
              const rowId = `${tableId}-row-${rowIndex}-details`;
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
                  {hidden.length > 0
                    ? (
                      <ExpandableRow
                        rowId={rowId}
                        expanded={expanded}
                        onToggle={() =>
                          setOpen(
                            expanded ? null : { table: tableId, row: rowIndex },
                          )}
                        class="block"
                        label={`${table.label} ${rowIndex + 1}`}
                      >
                        {content}
                      </ExpandableRow>
                    )
                    : <div class="border-b border-line-soft">{content}</div>}
                  {expanded && (
                    <HiddenRowFields
                      fields={hidden}
                      id={rowId}
                      layout={layout}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
        : (
          <div class="min-w-0 border-t border-line-soft">
            <div
              role="row"
              class={cx(
                "grid gap-3 border-b border-line bg-sunken px-4 py-1.5",
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
            {table.rows.map((row, rowIndex) => {
              const hidden = childTableHiddenEntries(table, rowIndex, layout);
              const expanded = open?.table === tableId &&
                open.row === rowIndex;
              const rowId = `${tableId}-row-${rowIndex}-details`;
              const rowClass = cx(
                "grid items-center gap-3 border-l-2 border-l-transparent px-4",
                layout === "mobile" ? "min-h-10 py-1" : "min-h-9 py-2",
                gridClass(layout, columns.length),
              );
              return (
                <div key={rowIndex}>
                  {hidden.length > 0
                    ? (
                      <ExpandableRow
                        rowId={rowId}
                        expanded={expanded}
                        onToggle={() =>
                          setOpen(
                            expanded ? null : { table: tableId, row: rowIndex },
                          )}
                        class={rowClass}
                        label={`${table.label} ${rowIndex + 1}`}
                      >
                        {cells(row, columns, t)}
                      </ExpandableRow>
                    )
                    : (
                      <div class={cx(rowClass, "border-b border-line-soft")}>
                        {cells(row, columns, t)}
                      </div>
                    )}
                  {expanded && (
                    <HiddenRowFields
                      fields={hidden}
                      id={rowId}
                      layout={layout}
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
