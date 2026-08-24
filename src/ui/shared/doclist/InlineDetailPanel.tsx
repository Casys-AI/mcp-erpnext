/** @jsxImportSource preact */
/**
 * L'inspecteur.
 *
 * La maquette le sort de la ligne : il n'est plus une ligne dépliée sous le
 * document, mais une colonne de 268 px à droite du tableau, sur fond enfoncé.
 * La liste reste donc lisible pendant qu'on inspecte, et le tableau ne saute
 * plus quand on ouvre une pièce.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { ConfirmSheet, useConfirm } from "~/shared/confirm";
import { AttachmentsSection } from "~/shared/document/AttachmentsSection.tsx";
import { documentCapabilities } from "~/shared/document/capabilities.ts";
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
    onClose,
    onJump,
    onAsk,
    onAction,
    onDocumentChanged,
  }: InlineDetailPanelProps,
) {
  const narrow = layout !== "wide";

  if (loading) {
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
      onClose={onClose}
      onJump={onJump}
      onAsk={onAsk}
      onAction={onAction}
      onDocumentChanged={onDocumentChanged}
    />
  );
}

function InlineDocument({
  app,
  envelope,
  fixture,
  outerLayout,
  onClose,
  onJump,
  onAsk,
  onAction,
  onDocumentChanged,
}: {
  app: App;
  envelope: DocumentEnvelope;
  fixture?: boolean;
  outerLayout: ViewerLayout;
  onClose: () => void;
  onJump?: (jump: Jump) => void;
  onAsk?: (message: string) => void;
  onAction: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
  onDocumentChanged?: (event: DocumentChangeEvent) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [actLoading, setActLoading] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);
  const surfaceLayout: ViewerLayout = outerLayout === "mobile"
    ? "mobile"
    : "panel";
  const outerNarrow = outerLayout !== "wide";
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
  const canRouteHint = (toolName: string) =>
    Boolean(
      onJump && app.getHostCapabilities()?.serverTools && exactTools &&
        exactTools.includes(toolName),
    );
  const jumps = hints
    .filter((hint) => hint.tool && canRouteHint(hint.tool))
    .map((hint) =>
      jumpFromHint(
        hint,
        vars,
        t("nav.linked_to", { id: envelope.name }),
      )
    )
    .filter((jump): jump is Jump => jump !== null);
  const asks = onAsk
    ? hints.flatMap((hint) => {
      if (!hint.message || (onJump && hint.tool)) return [];
      return [{
        label: hintLabel(hint),
        message: fillTemplate(hint.message, vars),
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
            />
          )
          : undefined}
        actions={actions}
        class="h-full"
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
