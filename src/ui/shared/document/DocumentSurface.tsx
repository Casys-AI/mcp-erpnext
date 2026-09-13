/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useT } from "../i18n-hook";
import type { ViewerLayout } from "../useViewerLayout";
import { cx, Label } from "../ui";
import {
  type ChildRowDisclosure,
  ChildTableSection,
} from "./ChildTableSection";
import { DocumentHeader } from "./DocumentHeader";
import {
  type DocumentSectionTab,
  DocumentSectionTabs,
} from "./DocumentSectionTabs";
import { ScalarFields } from "./ScalarFields";
import { OperationalFields } from "./OperationalFields.tsx";
import {
  operationalDocstatusKey,
  operationalProfile,
  operationalTable,
} from "./operational-model.ts";
import type { ChildTableModel, DocumentModel } from "./types.ts";
import type { ContextInteractionTarget } from "./context-interaction.ts";
import { PurchaseInvoiceRoundingNote } from "./PurchaseInvoiceRoundingNote.tsx";
import {
  formatPurchaseInvoiceAmount,
  purchaseInvoiceGrossTotal,
} from "./purchase-invoice.ts";

export interface DocumentSurfaceProps {
  model: DocumentModel;
  layout: ViewerLayout;
  /** Retour, fil d'Ariane ou fermeture appartenant à la coque hôte. */
  navigation?: ComponentChildren;
  /** Outils courts de l'en-tête, par exemple refresh et JSON. */
  headerActions?: ComponentChildren;
  /** Surface pièces jointes déjà capability-gated par la coque. */
  attachments?: ComponentChildren;
  /** Actions métier déjà capability-gated par la coque. */
  actions?: ComponentChildren;
  footer?: ComponentChildren;
  live?: boolean;
  class?: string;
  idPrefix?: string;
  /** Permet à un hôte de piloter les onglets mobiles. */
  activeSectionId?: string;
  onActiveSectionChange?: (id: string) => void;
  /** `flow` laisse la surface grandir dans le scroll de son parent. */
  scrollMode?: "contained" | "flow";
  renderChildRowActions?: (
    table: ChildTableModel,
    row: ChildTableModel["rows"][number],
    rowIndex: number,
  ) => ComponentChildren;
  childRowActionsPlacement?: "disclosure" | "visible";
  childRowsExpandable?: boolean;
  contextTarget?: ContextInteractionTarget;
  renderChildRowContextTarget?: (
    table: ChildTableModel,
    row: ChildTableModel["rows"][number],
    rowIndex: number,
  ) => ContextInteractionTarget | undefined;
}

interface TableSection {
  id: string;
  table: ChildTableModel;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function hasSlot(slot: ComponentChildren | undefined): boolean {
  return slot !== undefined && slot !== null && slot !== false;
}

function PurchaseInvoiceSummary({
  model,
  layout,
  panelId,
}: {
  model: DocumentModel;
  layout: ViewerLayout;
  panelId: string;
}) {
  const t = useT();
  const gross = purchaseInvoiceGrossTotal(
    model.envelope.doctype,
    model.envelope.document,
  );
  if (!gross) return null;
  const isDraft = model.docstatus === 0 || model.status === "Draft";
  const narrow = layout !== "wide";
  return (
    <div
      class={cx(
        "flex shrink-0 items-center justify-between gap-2.5 border-b border-line bg-sunken",
        narrow ? "px-3 py-[11px]" : "px-4 py-2.5",
      )}
    >
      <Label>{t("document.purchase_invoice.total")}</Label>
      <div class="flex min-w-0 items-center justify-end gap-1">
        <span
          class={cx(
            "font-semibold tabular-nums text-ink",
            narrow ? "font-display text-title" : "font-mono text-lede",
          )}
        >
          {formatPurchaseInvoiceAmount(gross.amount, gross.currency)}
        </span>
        {gross.showNote && (
          <PurchaseInvoiceRoundingNote
            calculatedTotal={gross.calculatedTotal}
            roundingAdjustment={gross.roundingAdjustment}
            invoiceTotal={gross.amount}
            currency={gross.currency}
            isDraft={isDraft}
            panelId={panelId}
          />
        )}
      </div>
    </div>
  );
}

function DocumentFields(
  { model, layout }: { model: DocumentModel; layout: ViewerLayout },
) {
  const profile = operationalProfile(model.envelope.doctype);
  if (profile) {
    return (
      <OperationalFields model={model} profile={profile} layout={layout} />
    );
  }
  return (
    <ScalarFields
      fields={model.fields}
      longFields={model.longFields}
      progressFields={model.progressFields}
      collections={model.collections}
      systemFields={model.systemFields}
      layout={layout}
    />
  );
}

function SlotSection(
  { children, class: klass }: { children: ComponentChildren; class?: string },
) {
  return (
    <section class={cx("min-w-0 border-t border-line", klass)}>
      {children}
    </section>
  );
}

export function DocumentSurface({
  model,
  layout,
  navigation,
  headerActions,
  attachments,
  actions,
  footer,
  live,
  class: klass,
  idPrefix,
  activeSectionId,
  onActiveSectionChange,
  scrollMode = "contained",
  renderChildRowActions,
  childRowActionsPlacement = "disclosure",
  contextTarget,
  renderChildRowContextTarget,
  childRowsExpandable = true,
}: DocumentSurfaceProps) {
  const t = useT();
  const defaultPrefix = `document-${slug(model.envelope.doctype)}-${
    slug(model.envelope.name)
  }`;
  const domPrefix = idPrefix ?? defaultPrefix;
  const documentKey = `${model.envelope.doctype}:${model.envelope.name}`;
  const [localSelection, setLocalSelection] = useState({
    documentKey,
    sectionId: "fields",
  });
  const [disclosureState, setDisclosureState] = useState<{
    documentKey: string;
    row: ChildRowDisclosure | null;
  }>({ documentKey, row: null });
  const localActive = localSelection.documentKey === documentKey
    ? localSelection.sectionId
    : "fields";
  const hasAttachments = hasSlot(attachments);
  const hasActions = hasSlot(actions);
  const hasSidebar = hasAttachments || hasActions;
  const profile = operationalProfile(model.envelope.doctype);
  const hasFields = Boolean(profile) || model.fields.length > 0 ||
    model.longFields.length > 0 ||
    model.progressFields.length > 0 || model.collections.length > 0 ||
    model.systemFields.length > 0;
  const tableSections: TableSection[] = model.childTables.map((
    table,
    index,
  ) => ({
    id: `table-${slug(table.key)}-${index}`,
    table: profile ? operationalTable(table, profile, t) : table,
  }));
  const tabs: DocumentSectionTab[] = [
    ...(hasFields
      ? [{
        id: "fields",
        label: t(profile ? "dossier.overview" : "document.fields"),
      }]
      : []),
    ...tableSections.map(({ id, table }) => ({
      id,
      label: table.label,
      count: table.rows.length,
    })),
    ...(hasAttachments
      ? [{ id: "attachments", label: t("document.attachments") }]
      : []),
  ];
  const requestedActive = activeSectionId ?? localActive;
  const active = tabs.some((tab) => tab.id === requestedActive)
    ? requestedActive
    : tabs[0]?.id ?? "fields";
  const contained = scrollMode === "contained";
  const activeDisclosure = disclosureState.documentKey === documentKey
    ? disclosureState.row
    : null;
  const surfaceClass = cx(
    "flex flex-col bg-surface",
    profile && "operational-document [&_[role=tab]]:min-h-10",
    contained && "min-h-0 flex-1",
    klass,
  );

  function selectSection(id: string) {
    if (activeSectionId === undefined) {
      setLocalSelection({ documentKey, sectionId: id });
    }
    setDisclosureState({ documentKey, row: null });
    onActiveSectionChange?.(id);
  }

  function setActiveDisclosure(row: ChildRowDisclosure | null) {
    setDisclosureState({ documentKey, row });
  }

  const docstatusKey = profile
    ? operationalDocstatusKey(model.docstatus)
    : undefined;
  const header = (
    <DocumentHeader
      doctype={model.envelope.doctype}
      name={model.envelope.name}
      title={model.title}
      status={model.status}
      docstatus={model.docstatus}
      docstatusLabel={docstatusKey ? t(docstatusKey) : undefined}
      layout={layout}
      navigation={navigation}
      trailing={headerActions}
      live={live}
      contextTarget={contextTarget}
    />
  );
  const purchaseInvoiceSummary = (
    <PurchaseInvoiceSummary
      model={model}
      layout={layout}
      panelId={`${domPrefix}-rounding`}
    />
  );

  if (layout === "wide") {
    return (
      <article
        aria-label={t("document.surface", { name: model.envelope.name })}
        class={surfaceClass}
      >
        {header}
        {purchaseInvoiceSummary}
        <div
          class={cx(
            "grid",
            contained && "min-h-0 flex-1",
            hasSidebar ? "grid-cols-[minmax(0,1fr)_268px]" : "grid-cols-1",
          )}
        >
          <main
            class={cx(
              "min-w-0",
              contained && "scroll-slim overflow-y-auto",
              hasSidebar && "border-r border-line",
            )}
          >
            {hasFields && <DocumentFields model={model} layout={layout} />}
            {tableSections.map(({ id, table }) => (
              <ChildTableSection
                wrapValues={Boolean(profile)}
                key={id}
                table={table}
                layout={layout}
                idPrefix={domPrefix}
                class="border-t border-line-soft"
                renderRowActions={renderChildRowActions}
                rowActionsPlacement={childRowActionsPlacement}
                renderRowContextTarget={renderChildRowContextTarget}
                childRowsExpandable={childRowsExpandable}
                activeDisclosure={activeDisclosure}
                onDisclosureChange={setActiveDisclosure}
              />
            ))}
          </main>
          {hasSidebar && (
            <aside
              aria-label={t("document.sidebar")}
              class={cx(
                "min-w-0 bg-sunken",
                contained && "scroll-slim overflow-y-auto",
              )}
            >
              {hasAttachments && <div>{attachments}</div>}
              {hasActions && <SlotSection class="p-3.5">{actions}</SlotSection>}
            </aside>
          )}
        </div>
        {hasSlot(footer) && (
          <footer class="shrink-0 border-t border-line">{footer}</footer>
        )}
      </article>
    );
  }

  if (layout === "panel") {
    return (
      <article
        aria-label={t("document.surface", { name: model.envelope.name })}
        class={surfaceClass}
      >
        {header}
        {purchaseInvoiceSummary}
        <main
          class={cx(
            contained && "scroll-slim min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {hasFields && <DocumentFields model={model} layout={layout} />}
          {tableSections.map(({ id, table }) => (
            <ChildTableSection
              wrapValues={Boolean(profile)}
              key={id}
              table={table}
              layout={layout}
              idPrefix={domPrefix}
              class="border-t border-line"
              renderRowActions={renderChildRowActions}
              rowActionsPlacement={childRowActionsPlacement}
              renderRowContextTarget={renderChildRowContextTarget}
              childRowsExpandable={childRowsExpandable}
              activeDisclosure={activeDisclosure}
              onDisclosureChange={setActiveDisclosure}
            />
          ))}
          {hasAttachments && <SlotSection>{attachments}</SlotSection>}
          {hasActions && <SlotSection class="p-3.5">{actions}</SlotSection>}
        </main>
        {hasSlot(footer) && (
          <footer class="shrink-0 border-t border-line">{footer}</footer>
        )}
      </article>
    );
  }

  const activeTable = tableSections.find(({ id }) => id === active);
  return (
    <article
      aria-label={t("document.surface", { name: model.envelope.name })}
      class={surfaceClass}
    >
      {header}
      {purchaseInvoiceSummary}
      {tabs.length > 0 && (
        <DocumentSectionTabs
          tabs={tabs}
          activeId={active}
          onChange={selectSection}
          layout={layout}
          idPrefix={domPrefix}
        />
      )}
      <main
        class={cx(
          contained && "scroll-slim min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {active === "fields" && hasFields && (
          <div
            id={`${domPrefix}-panel-fields`}
            role="tabpanel"
            aria-labelledby={`${domPrefix}-tab-fields`}
          >
            <DocumentFields model={model} layout={layout} />
          </div>
        )}
        {activeTable && (
          <div
            id={`${domPrefix}-panel-${activeTable.id}`}
            role="tabpanel"
            aria-labelledby={`${domPrefix}-tab-${activeTable.id}`}
          >
            <ChildTableSection
              wrapValues={Boolean(profile)}
              table={activeTable.table}
              layout={layout}
              idPrefix={domPrefix}
              renderRowActions={renderChildRowActions}
              rowActionsPlacement={childRowActionsPlacement}
              renderRowContextTarget={renderChildRowContextTarget}
              childRowsExpandable={childRowsExpandable}
              activeDisclosure={activeDisclosure}
              onDisclosureChange={setActiveDisclosure}
            />
          </div>
        )}
        {active === "attachments" && hasAttachments && (
          <div
            id={`${domPrefix}-panel-attachments`}
            role="tabpanel"
            aria-labelledby={`${domPrefix}-tab-attachments`}
          >
            {attachments}
          </div>
        )}
      </main>
      {hasActions && (
        <div class="shrink-0 border-t border-line p-3">{actions}</div>
      )}
      {hasSlot(footer) && (
        <footer class="shrink-0 border-t border-line">{footer}</footer>
      )}
    </article>
  );
}
