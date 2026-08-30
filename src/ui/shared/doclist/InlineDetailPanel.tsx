/** @jsxImportSource preact */
/**
 * Détail de document réutilisable en inspecteur ou en accordéon de ligne.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ConfirmSheet, useConfirm } from "~/shared/confirm";
import { AttachmentsSection } from "~/shared/document/AttachmentsSection.tsx";
import { documentCapabilities } from "~/shared/document/capabilities.ts";
import type {
  ContextInteractionTarget,
  DocumentContextController,
} from "~/shared/document/context-interaction.ts";
import {
  childRowContextItem,
  documentChildRowsReconcileKey,
  documentContextItem,
} from "~/shared/document/context-items.ts";
import {
  childRowNavigationAsks,
  childRowNavigationJumps,
} from "~/shared/document/child-row-navigation.ts";
import {
  documentEnvelopeOf,
  documentModelOf,
} from "~/shared/document/model.ts";
import { DocumentSurface } from "~/shared/document/DocumentSurface.tsx";
import type { DocumentEnvelope } from "~/shared/document/types.ts";
import { useAttachments } from "~/shared/document/useAttachments.ts";
import type { DocumentChangeEvent } from "~/shared/document-events.ts";
import { useT } from "~/shared/i18n-hook";
import {
  fillTemplate,
  hasUnfilledTemplate,
  hintLabel,
  type Jump,
  jumpFromHint,
} from "~/shared/jumps";
import { JumpList } from "~/shared/levels/JumpList";
import { Button, Label, Skeleton } from "~/shared/ui";
import type { ViewerLayout } from "~/shared/useViewerLayout";
import type { SendMessageHint } from "./types";

interface InlineDetailPanelProps {
  app: App;
  /** Enveloppe canonique de la fiche enfant, seule source de capacités. */
  envelope?: DocumentEnvelope | null;
  loading: boolean;
  fixture?: boolean;
  /** Mise en page courante — détermine le header de l'inspecteur et les tailles. */
  layout?: ViewerLayout;
  /** Insère le détail dans la liste, immédiatement sous sa ligne. */
  embedded?: boolean;
  onClose: () => void;
  /** Présent quand l'hôte relaie les outils : les hints deviennent des sauts « › ». */
  onJump?: (jump: Jump) => void;
  onAsk?: (message: string) => void;
  onAction: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
  onDocumentChanged?: (event: DocumentChangeEvent) => void;
  /** @deprecated Utiliser `envelope`; conservé pour les anciens appelants. */
  data?: Record<string, unknown> | null;
  /** @deprecated Complète uniquement l'identité de l'ancien `data`. */
  doctype?: string;
  /** @deprecated Une capacité parent ne peut pas autoriser la fiche enfant. */
  availableTools?: readonly string[];
  /** @deprecated Les hints doivent appartenir à l'enveloppe enfant. */
  sendMessageHints?: SendMessageHint[];
  /** Panier de contexte conservé par la racine du viewer. */
  context?: DocumentContextController;
  /** Provenance visible des références ajoutées au contexte. */
  contextView?: string;
  /** Identité stable du niveau qui porte cette provenance. */
  contextKey?: string;
}

function legacyEnvelopeOf(
  data: Record<string, unknown> | null | undefined,
  doctype: string | undefined,
): DocumentEnvelope | null {
  if (!data) return null;
  const exact = documentEnvelopeOf(data);
  if (exact) return exact;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!doctype?.trim() || !name) return null;
  return documentEnvelopeOf({
    data: { ...data, doctype: doctype.trim(), name },
  });
}

export function InlineDetailPanel(
  {
    app,
    envelope,
    data,
    doctype,
    loading,
    fixture,
    layout,
    embedded,
    onClose,
    onJump,
    onAsk,
    onAction,
    onDocumentChanged,
    context,
    contextView,
    contextKey,
  }: InlineDetailPanelProps,
) {
  const narrow = layout !== "wide";

  if (loading) {
    if (embedded) {
      return (
        <div
          role="status"
          class="flex h-[144px] flex-col gap-3.5 border-y border-accent/45 bg-surface p-4"
        >
          <Skeleton class="h-[15px] w-3/4" />
          <Skeleton class="h-[15px] w-1/3" />
          {Array.from(
            { length: 3 },
            (_, index) => <Skeleton key={index} class="h-3" />,
          )}
        </div>
      );
    }
    return (
      <InspectorFrame narrow={narrow} onClose={onClose}>
        <div class="flex flex-col gap-3.5 p-3.5">
          <Skeleton class="h-[15px] w-3/4" />
          <Skeleton class="h-[15px] w-1/3" />
          {Array.from(
            { length: 5 },
            (_, index) => <Skeleton key={index} class="h-3" />,
          )}
        </div>
      </InspectorFrame>
    );
  }
  const documentEnvelope = envelope ?? legacyEnvelopeOf(data, doctype);
  if (!documentEnvelope) return null;
  return (
    <InlineDocument
      key={`${documentEnvelope.doctype}\u0000${documentEnvelope.name}`}
      app={app}
      envelope={documentEnvelope}
      fixture={fixture}
      outerLayout={layout ?? "panel"}
      embedded={embedded}
      onClose={onClose}
      onJump={onJump}
      onAsk={onAsk}
      onAction={onAction}
      onDocumentChanged={onDocumentChanged}
      context={context}
      contextView={contextView}
      contextKey={contextKey}
    />
  );
}

function InlineDocument({
  app,
  envelope,
  fixture,
  outerLayout,
  embedded,
  onClose,
  onJump,
  onAsk,
  onAction,
  onDocumentChanged,
  context,
  contextView,
  contextKey,
}: {
  app: App;
  envelope: DocumentEnvelope;
  fixture?: boolean;
  outerLayout: ViewerLayout;
  embedded?: boolean;
  onClose: () => void;
  onJump?: (jump: Jump) => void;
  onAsk?: (message: string) => void;
  onAction: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
  onDocumentChanged?: (event: DocumentChangeEvent) => void;
  context?: DocumentContextController;
  contextView?: string;
  contextKey?: string;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [actLoading, setActLoading] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);
  const surfaceLayout: ViewerLayout = embedded
    ? outerLayout
    : outerLayout === "mobile"
    ? "mobile"
    : "panel";
  const outerNarrow = !embedded && outerLayout !== "wide";
  const model = documentModelOf(envelope);
  const capabilities = documentCapabilities(
    app.getHostCapabilities(),
    envelope.availableTools,
    envelope.refreshRequest,
  );
  const attachments = useAttachments({
    app,
    envelope,
    capabilities,
    onDocumentChanged,
  });

  const vars = {
    id: envelope.name,
    name: envelope.name,
    doctype: envelope.doctype,
  };
  const hints = envelope.sendMessageHints ?? [];
  const exactTools = envelope.availableTools;
  const contextItem = documentContextItem(
    model,
    contextView ?? envelope.doctype,
    contextKey,
  );
  const childRowsContextKey = documentChildRowsReconcileKey(envelope);
  const reconcileDocument = context?.supported
    ? context.reconcileDocument
    : undefined;
  useEffect(() => {
    if (!reconcileDocument) return;
    const candidates = [
      contextItem,
      ...model.childTables.flatMap((table) =>
        table.rows.flatMap((row, rowIndex) => {
          const item = childRowContextItem(
            envelope,
            table,
            row,
            rowIndex,
            childRowsContextKey,
          );
          return item ? [item] : [];
        })
      ),
    ];
    void reconcileDocument(contextItem.id, candidates);
  }, [
    childRowsContextKey,
    contextKey,
    contextView,
    envelope,
    reconcileDocument,
  ]);
  const canRouteHint = (toolName: string) =>
    Boolean(
      onJump && app.getHostCapabilities()?.serverTools && exactTools &&
        exactTools.includes(toolName),
    );
  const rootJumpForHint = (hint: (typeof hints)[number]): Jump | null => {
    if (!hint.tool || !canRouteHint(hint.tool)) return null;
    return jumpFromHint(
      hint,
      vars,
      t("nav.linked_to", { id: envelope.name }),
    );
  };
  const jumps = hints
    .map(rootJumpForHint)
    .filter((jump): jump is Jump => jump !== null);
  const asks = onAsk
    ? hints.flatMap((hint) => {
      if (!hint.message || rootJumpForHint(hint)) return [];
      const message = fillTemplate(hint.message, vars);
      if (hasUnfilledTemplate(message)) return [];
      return [{
        label: hintLabel(hint),
        message,
      }];
    })
    : [];
  if (onAsk && asks.length === 0 && jumps.length === 0) {
    asks.push({
      label: t("doclist.detail.full_detail"),
      message: t("doclist.detail.full_detail_message", {
        doctype: envelope.doctype,
        id: envelope.name,
      }),
    });
  }

  const isDraft = model.status === "Draft" || model.docstatus === 0;
  const isSubmitted = model.docstatus === 1;
  const showSubmit = isDraft && (fixture || capabilities.canSubmit);
  const showCancel = isSubmitted && (fixture || capabilities.canCancel);

  async function act(
    key: string,
    tool: string,
    args: Record<string, unknown>,
    msg: string,
  ) {
    if (fixture) return;
    const allowed = key === "submit"
      ? capabilities.canSubmit
      : key === "cancel"
      ? capabilities.canCancel
      : false;
    if (!allowed) return;
    setActLoading(key);
    setActMsg(null);
    const ok = await onAction(tool, args);
    setActOk(ok);
    setActMsg(ok ? msg : t("doclist.detail.action_failed"));
    setActLoading(null);
  }

  const hasActions = jumps.length > 0 || asks.length > 0 || showSubmit ||
    showCancel || actMsg !== null;
  const actions = hasActions
    ? (
      <div class="flex flex-col gap-2">
        {jumps.length > 0 && <Label>{t("nav.goto")}</Label>}
        {(jumps.length > 0 || asks.length > 0) && (
          <JumpList
            narrow
            jumps={jumps}
            asks={asks}
            onJump={onJump}
            onAsk={onAsk}
          />
        )}
        {actMsg && (
          <p class={`font-mono text-chip ${actOk ? "text-ok" : "text-bad"}`}>
            {actMsg}
          </p>
        )}
        {showSubmit && (
          <Button
            variant="secondary"
            disabled={actLoading === "submit" || fixture}
            title={fixture
              ? t("doclist.preview.no_host")
              : t("doclist.detail.action.submit_title")}
            class="min-h-[44px] rounded-control text-body"
            onClick={() =>
              confirm.request({
                subject: `${envelope.doctype} ${envelope.name}`,
                title: t("doclist.confirm.submit"),
                detail: t("doclist.confirm.submit.detail"),
                actionLabel: t("doclist.confirm.submit.action"),
                onConfirm: () =>
                  void act("submit", "erpnext_doc_submit", {
                    doctype: envelope.doctype,
                    name: envelope.name,
                  }, t("doclist.detail.action.submit_ok")),
              })}
          >
            {actLoading === "submit" ? "…" : t("common.submit")}
          </Button>
        )}
        {showCancel && (
          <Button
            variant="danger"
            disabled={actLoading === "cancel" || fixture}
            title={fixture
              ? t("doclist.preview.no_host")
              : t("doclist.detail.action.cancel_label")}
            class="min-h-[44px] rounded-control text-body"
            onClick={() =>
              confirm.request({
                subject: `${envelope.doctype} ${envelope.name}`,
                title: t("doclist.confirm.cancel"),
                detail: t("doclist.confirm.cancel.detail"),
                actionLabel: t("doclist.confirm.cancel.action"),
                onConfirm: () =>
                  void act("cancel", "erpnext_doc_cancel", {
                    doctype: envelope.doctype,
                    name: envelope.name,
                  }, t("doclist.detail.action.cancel_ok")),
              })}
          >
            {actLoading === "cancel"
              ? "…"
              : t("doclist.detail.action.cancel_label")}
          </Button>
        )}
      </div>
    )
    : undefined;

  const navigation = outerNarrow
    ? (
      <button
        type="button"
        onClick={onClose}
        aria-label={t("doclist.detail.back_to_list")}
        class="font-mono text-chip text-accent-text transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t("doclist.detail.back_list_label")}
      </button>
    )
    : undefined;
  const headerActions = !outerNarrow
    ? (
      <button
        type="button"
        onClick={onClose}
        aria-label={t("doclist.detail.close_inspector")}
        class="grid size-7 place-items-center rounded-control text-lede text-ink-faint transition-colors hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        ×
      </button>
    )
    : undefined;

  function childRowInteraction(
    table: (typeof model.childTables)[number],
    row: typeof table.rows[number],
    rowIndex: number,
  ) {
    const item = childRowContextItem(
      envelope,
      table,
      row,
      rowIndex,
      childRowsContextKey,
    );
    const rowJumps = onJump && app.getHostCapabilities()?.serverTools
      ? childRowNavigationJumps({
        hints,
        rootVars: vars,
        row,
        availableTools: exactTools,
        subtitle: t("nav.linked_to", {
          id: item?.label ?? envelope.name,
        }),
      })
      : [];
    const rowAsks = onAsk
      ? childRowNavigationAsks({ hints, rootVars: vars, row }).filter(
        (ask) => !rowJumps.some((jump) => jump.label === ask.label),
      )
      : [];
    return { item, rowJumps, rowAsks };
  }

  const renderChildRowActions = embedded
    ? (
      table: (typeof model.childTables)[number],
      row: typeof table.rows[number],
      rowIndex: number,
    ) => {
      const { rowJumps, rowAsks } = childRowInteraction(
        table,
        row,
        rowIndex,
      );
      if (rowJumps.length === 0 && rowAsks.length === 0) return undefined;
      return (
        <>
          {rowJumps.map((jump) => (
            <Button
              key={`${jump.tool.name}:${jump.label}`}
              variant="quiet"
              class="min-h-8 px-2.5 py-1 text-chip"
              onClick={() => onJump?.(jump)}
            >
              {jump.label}
              <span aria-hidden="true">›</span>
            </Button>
          ))}
          {rowAsks.map((ask) => (
            <Button
              key={`ask:${ask.label}`}
              variant="quiet"
              class="min-h-8 px-2.5 py-1 text-chip"
              onClick={() => onAsk?.(ask.message)}
            >
              {ask.label}
              <span aria-hidden="true">~</span>
            </Button>
          ))}
        </>
      );
    }
    : undefined;
  const contextTarget: ContextInteractionTarget | undefined = context?.supported
    ? {
      label: t("context.active.select", { label: contextItem.label }),
      selected: context.isSelected(contextItem),
      onActivate: () => void context.activate(contextItem),
    }
    : undefined;
  const renderChildRowContextTarget = embedded
    ? (
      table: (typeof model.childTables)[number],
      row: typeof table.rows[number],
      rowIndex: number,
    ): ContextInteractionTarget | undefined => {
      const { item } = childRowInteraction(table, row, rowIndex);
      return item && context?.supported
        ? {
          label: t("context.active.select", { label: item.label }),
          detailLabel: item.label,
          selected: context.isSelected(item),
          onActivate: () => context.activateReversible(item),
        }
        : undefined;
    }
    : undefined;

  return (
    <>
      <DocumentSurface
        model={model}
        layout={surfaceLayout}
        navigation={navigation}
        headerActions={headerActions}
        attachments={capabilities.canListAttachments
          ? (
            <AttachmentsSection
              controller={attachments}
              capabilities={capabilities}
              layout={surfaceLayout}
              context={context}
            />
          )
          : undefined}
        actions={actions}
        scrollMode={embedded ? "flow" : "contained"}
        renderChildRowActions={renderChildRowActions}
        childRowActionsPlacement={embedded ? "visible" : "disclosure"}
        contextTarget={contextTarget}
        renderChildRowContextTarget={renderChildRowContextTarget}
        childRowsExpandable={!embedded}
        class={embedded ? "border-y border-accent/45" : "h-full"}
      />
      <ConfirmSheet confirm={confirm} />
    </>
  );
}

function InspectorFrame(
  { children, narrow, onClose }: {
    children: ComponentChildren;
    /** En narrow : header = ‹ liste + label (sans ×). En wide : label + ×. */
    narrow?: boolean;
    onClose: () => void;
  },
) {
  const t = useT();
  return (
    <aside class="scroll-slim flex min-h-0 flex-col overflow-y-auto bg-sunken">
      <div class="flex shrink-0 items-center justify-between border-b border-line px-3.5 py-[11px]">
        {narrow
          ? (
            <>
              {/* Narrow : ‹ liste à gauche = retour, label à droite, pas de × */}
              <button
                type="button"
                onClick={onClose}
                aria-label={t("doclist.detail.back_to_list")}
                class="font-mono text-chip text-accent-text transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("doclist.detail.back_list_label")}
              </button>
              <Label>{t("doclist.detail.inspector_label")}</Label>
            </>
          )
          : (
            <>
              {/* Wide : label à gauche, × à droite */}
              <Label>{t("doclist.detail.inspector_label")}</Label>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("doclist.detail.close_inspector")}
                class="text-lede leading-none text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ×
              </button>
            </>
          )}
      </div>
      {children}
    </aside>
  );
}
