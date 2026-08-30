/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useT } from "../i18n-hook";
import type { ViewerLayout } from "../useViewerLayout";
import { cx } from "../ui";
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
import type { ChildTableModel, DocumentModel } from "./types.ts";
import type { ContextInteractionTarget } from "./context-interaction.ts";

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

function DocumentFields(
  { model, layout }: { model: DocumentModel; layout: ViewerLayout },
) {
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
  const hasFields = model.fields.length > 0 || model.longFields.length > 0 ||
    model.progressFields.length > 0 || model.collections.length > 0 ||
    model.systemFields.length > 0;
  const tableSections: TableSection[] = model.childTables.map((
    table,
    index,
  ) => ({
    id: `table-${slug(table.key)}-${index}`,
    table,
  }));
  const tabs: DocumentSectionTab[] = [
    ...(hasFields ? [{ id: "fields", label: t("document.fields") }] : []),
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

  const header = (
    <DocumentHeader
      doctype={model.envelope.doctype}
      name={model.envelope.name}
      title={model.title}
      status={model.status}
      docstatus={model.docstatus}
      layout={layout}
      navigation={navigation}
      trailing={headerActions}
      live={live}
      contextTarget={contextTarget}
    />
  );

  if (layout === "wide") {
    return (
      <article
        aria-label={t("document.surface", { name: model.envelope.name })}
        class={surfaceClass}
      >
        {header}
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
        <main
          class={cx(
            contained && "scroll-slim min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {hasFields && <DocumentFields model={model} layout={layout} />}
          {tableSections.map(({ id, table }) => (
            <ChildTableSection
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
