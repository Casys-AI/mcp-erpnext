/**
 * Le corps du niveau courant d'une pile : chargement, erreur, fiche,
 * barres ou liste. Chaque vue rend sa racine elle-même et délègue ici
 * tout ce qu'on y a empilé.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { AttachmentsSection } from "../document/AttachmentsSection.tsx";
import { documentCapabilities } from "../document/capabilities.ts";
import type {
  ContextInteractionTarget,
  DocumentContextController,
} from "../document/context-interaction.ts";
import {
  childRowContextItem,
  documentContextItem,
} from "../document/context-items.ts";
import {
  childRowNavigationAsks,
  childRowNavigationJumps,
} from "../document/child-row-navigation.ts";
import { documentModelOf } from "../document/model.ts";
import { DocumentSurface } from "../document/DocumentSurface.tsx";
import type { DocumentEnvelope } from "../document/types.ts";
import { useAttachments } from "../document/useAttachments.ts";
import type { DocumentChangeEvent } from "../document-events.ts";
import { DoclistBody } from "../doclist/DoclistBody";
import { LoadingSkeleton } from "../doclist/LoadingSkeleton";
import type { DoclistData } from "../doclist/types";
import type { DoclistState } from "../doclist/useDoclist";
import {
  fillTemplate,
  hasUnfilledTemplate,
  hintLabel,
  type Jump,
  jumpFromHint,
} from "../jumps";
import type { NavLevel } from "../nav-stack";
import { useT } from "../i18n-hook";
import { Button, Label, StateMessage } from "../ui";
import type { ViewerLayout } from "../useViewerLayout";
import { BarsLevel } from "./BarsLevel";
import {
  type BarsBody,
  chartHintAt,
  chartOf,
  listOf,
  recordOf,
} from "./bodies";
import { JumpList } from "./JumpList";
import {
  nestedChartContextCandidates,
  nestedChartContextId,
  nestedChartContextItem,
} from "./nested-chart-interaction.ts";

export const EMPTY_LIST: DoclistData = { count: 0, data: [] };

/** Ce que le niveau rend comme liste — `EMPTY_LIST` pour les autres formes. */
export function levelListData(level: NavLevel): DoclistData {
  if (level.kind !== "list") return EMPTY_LIST;
  return (level.body as DoclistData | undefined) ?? EMPTY_LIST;
}

export function LevelBody(
  {
    level,
    app,
    list,
    layout,
    fixture,
    onJump,
    onAsk,
    onError,
    onRefresh,
    onMutated,
    onDocumentChanged,
    onMutationInvalidate,
    onMutationRefresh,
    context,
    children,
  }: {
    level: NavLevel;
    app: App;
    /** L'état de liste du niveau, tenu par la vue (`useDoclist`). */
    list: DoclistState;
    layout: ViewerLayout;
    fixture: boolean;
    onJump?: (jump: Jump) => void;
    onAsk?: (message: string) => void;
    onError: (msg: string | null) => void;
    /** Recharger le niveau courant (un niveau périmé le propose). */
    onRefresh?: () => void;
    /** Une action d'un niveau vient de changer `subject`. */
    onMutated?: (subject: string) => void;
    /** Changement canonique structuré, indépendant de son transport futur. */
    onDocumentChanged?: (event: DocumentChangeEvent) => void;
    /** Invalider puis relire la racine autour d'une mutation de liste. */
    onMutationInvalidate?: () => void;
    onMutationRefresh?: () => void;
    context?: DocumentContextController;
    contextView?: string;
    /** Ce que la vue rend pour sa racine (niveau 1). */
    children?: ComponentChildren;
  },
) {
  const t = useT();
  if (level.kind === "root") return <>{children}</>;
  if (level.loading) return <LoadingSkeleton embedded />;
  if (level.error) return <StateMessage tone="bad">{level.error}</StateMessage>;
  // Un corps qui n'a pas la forme annoncée est une erreur, pas une liste vide.
  const unexpected = (
    <StateMessage tone="bad">{t("nav.unexpected_body")}</StateMessage>
  );
  if (level.kind === "record") {
    const envelope = recordOf(level.body);
    if (!envelope) return unexpected;
    return (
      <RecordDocumentLevel
        key={`${envelope.doctype}\u0000${envelope.name}`}
        app={app}
        envelope={envelope}
        levelJumps={level.jumps}
        layout={layout}
        onJump={onJump}
        onAsk={onAsk}
        onMutated={onMutated}
        onDocumentChanged={onDocumentChanged}
        onMutationInvalidate={onMutationInvalidate}
        onMutationRefresh={onMutationRefresh}
        context={context}
        contextView={level.title}
        contextKey={level.key ?? level.id}
      />
    );
  }
  if (level.kind === "chart") {
    const chart = chartOf(level.body);
    if (!chart) return unexpected;
    return (
      <ChartLevel
        key={level.id}
        level={level}
        chart={chart}
        layout={layout}
        onJump={onJump}
        context={context}
      />
    );
  }
  if (!listOf(level.body)) return unexpected;
  return (
    <DoclistBody
      app={app}
      data={levelListData(level)}
      list={list}
      layout={layout}
      fixture={fixture}
      subtitle={level.subtitle}
      onError={onError}
      onJump={onJump}
      onAsk={onAsk}
      stale={level.stale}
      onRefresh={onRefresh}
      onMutated={onMutated}
      onDocumentChanged={onDocumentChanged}
      onMutationInvalidate={onMutationInvalidate}
      onMutationRefresh={onMutationRefresh}
      context={context}
      contextView={level.title}
      contextKey={level.key ?? level.id}
    />
  );
}

function ChartLevel({
  level,
  chart,
  layout,
  onJump,
  context,
}: {
  level: NavLevel;
  chart: BarsBody;
  layout: ViewerLayout;
  onJump?: (jump: Jump) => void;
  context?: DocumentContextController;
}) {
  const t = useT();
  const view = level.title;
  const chartId = nestedChartContextId(level.key ?? level.id, level.title);
  const reconcileView = context?.supported ? context.reconcileView : undefined;

  useEffect(() => {
    if (!reconcileView) return;
    void reconcileView(
      chartId,
      nestedChartContextCandidates(chart, chartId, view),
    );
  }, [chart, chartId, reconcileView, view]);

  // Le segment exact prime sur le saut générique du libellé. Une série
  // dérivée sans hint (Net Profit) reste lisible mais n'invente aucun saut.
  const pointJump = (
    labelIndex: number,
    seriesIndex: number,
  ): Jump | null => {
    if (!onJump) return null;
    const hint = chartHintAt(chart, labelIndex, seriesIndex);
    const label = chart.labels[labelIndex];
    const series = chart.datasets[seriesIndex]?.label;
    const target = series ? `${label} · ${series}` : label;
    return hint
      ? jumpFromHint(
        hint,
        {},
        t("nav.linked_to", { id: target }),
      )
      : null;
  };
  const itemAt = (labelIndex: number, seriesIndex: number) =>
    nestedChartContextItem(
      chart,
      chartId,
      view,
      labelIndex,
      seriesIndex,
    );
  const detailEnabled = chart.labels.some((_, labelIndex) =>
    chart.datasets.some((_, seriesIndex) =>
      pointJump(labelIndex, seriesIndex) !== null
    )
  );
  const contextEnabled = Boolean(context?.supported);
  const caption = contextEnabled && detailEnabled
    ? t("chart.tooltip.click_action_context")
    : contextEnabled
    ? t("chart.tooltip.click_action_context_only")
    : detailEnabled
    ? t("chart.tooltip.click_action_fallback")
    : undefined;

  return (
    <BarsLevel
      chart={chart}
      narrow={layout !== "wide"}
      caption={caption}
      contextEnabled={contextEnabled}
      pointKey={(labelIndex, seriesIndex) =>
        itemAt(labelIndex, seriesIndex)?.id ??
          `${chartId}:point:${labelIndex}:${seriesIndex}`}
      isPointSelected={contextEnabled
        ? (labelIndex, seriesIndex) => {
          const item = itemAt(labelIndex, seriesIndex);
          return item ? context!.isSelected(item) : false;
        }
        : undefined}
      isPointDetailEnabled={(labelIndex, seriesIndex) =>
        pointJump(labelIndex, seriesIndex) !== null}
      onPointContext={contextEnabled
        ? (labelIndex, seriesIndex) => {
          const item = itemAt(labelIndex, seriesIndex);
          return item ? context!.activateReversible(item) : undefined;
        }
        : undefined}
      onPointDetail={detailEnabled
        ? (labelIndex, seriesIndex) => {
          const jump = pointJump(labelIndex, seriesIndex);
          if (jump) onJump?.(jump);
        }
        : undefined}
    />
  );
}

function RecordDocumentLevel({
  app,
  envelope,
  levelJumps,
  layout,
  onJump,
  onAsk,
  onMutated,
  onDocumentChanged,
  onMutationInvalidate,
  onMutationRefresh,
  context,
  contextView,
  contextKey,
}: {
  app: App;
  envelope: DocumentEnvelope;
  levelJumps?: Jump[];
  layout: ViewerLayout;
  onJump?: (jump: Jump) => void;
  onAsk?: (message: string) => void;
  onMutated?: (subject: string) => void;
  onDocumentChanged?: (event: DocumentChangeEvent) => void;
  onMutationInvalidate?: () => void;
  onMutationRefresh?: () => void;
  context?: DocumentContextController;
  contextView?: string;
  contextKey?: string;
}) {
  const t = useT();
  const model = documentModelOf(envelope);
  const capabilities = documentCapabilities(
    app.getHostCapabilities(),
    envelope.availableTools,
    envelope.refreshRequest,
  );
  const changed = (event: DocumentChangeEvent) => {
    onMutated?.(event.name);
    onDocumentChanged?.(event);
    onMutationInvalidate?.();
    onMutationRefresh?.();
  };
  const attachments = useAttachments({
    app,
    envelope,
    capabilities,
    onDocumentChanged: changed,
  });

  const vars = {
    id: envelope.name,
    name: envelope.name,
    doctype: envelope.doctype,
  };
  const hints = envelope.sendMessageHints ?? [];
  const exactTools = envelope.availableTools;
  const hintJumpForHint = (hint: (typeof hints)[number]): Jump | null => {
    if (
      !onJump || !hint.tool || !app.getHostCapabilities()?.serverTools ||
      !exactTools?.includes(hint.tool)
    ) return null;
    return jumpFromHint(
      hint,
      vars,
      t("nav.linked_to", { id: envelope.name }),
    );
  };
  const hintJumps = hints
    .map(hintJumpForHint)
    .filter((jump): jump is Jump => jump !== null);
  const jumps = [...(levelJumps ?? []), ...hintJumps];
  const asks = onAsk
    ? hints.flatMap((hint) => {
      if (!hint.message || hintJumpForHint(hint)) return [];
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
      label: t("nav.ask"),
      message: t("doclist.detail.full_detail_message", {
        doctype: envelope.doctype,
        id: envelope.name,
      }),
    });
  }
  const contextItem = documentContextItem(
    model,
    contextView ?? envelope.doctype,
    contextKey,
  );
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
            contextKey,
          );
          return item ? [item] : [];
        })
      ),
    ];
    void reconcileDocument(contextItem.id, candidates);
  }, [contextKey, contextView, envelope, reconcileDocument]);
  const actions = jumps.length > 0 || asks.length > 0
    ? (
      <div class="flex flex-col gap-2">
        {jumps.length > 0 && <Label>{t("nav.goto")}</Label>}
        <JumpList
          narrow={layout !== "wide"}
          jumps={jumps}
          asks={asks}
          onJump={onJump}
          onAsk={onAsk}
        />
      </div>
    )
    : undefined;
  const contextTarget: ContextInteractionTarget | undefined = context?.supported
    ? {
      label: t("context.active.select", { label: contextItem.label }),
      selected: context.isSelected(contextItem),
      onActivate: () => void context.activate(contextItem),
    }
    : undefined;
  const renderChildRowActions = (
    _table: (typeof model.childTables)[number],
    row: (typeof model.childTables)[number]["rows"][number],
  ) => {
    const rowJumps = onJump && app.getHostCapabilities()?.serverTools
      ? childRowNavigationJumps({
        hints,
        rootVars: vars,
        row,
        availableTools: exactTools,
        subtitle: t("nav.linked_to", { id: envelope.name }),
      })
      : [];
    const rowAsks = onAsk
      ? childRowNavigationAsks({ hints, rootVars: vars, row }).filter(
        (ask) => !rowJumps.some((jump) => jump.label === ask.label),
      )
      : [];
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
  };
  const renderChildRowContextTarget = (
    table: (typeof model.childTables)[number],
    row: (typeof model.childTables)[number]["rows"][number],
    rowIndex: number,
  ): ContextInteractionTarget | undefined => {
    if (!context?.supported) return undefined;
    const item = childRowContextItem(
      envelope,
      table,
      row,
      rowIndex,
      contextKey,
    );
    return item
      ? {
        label: t("context.active.select", { label: item.label }),
        detailLabel: item.label,
        selected: context.isSelected(item),
        onActivate: () => context.activateReversible(item),
      }
      : undefined;
  };

  return (
    <DocumentSurface
      model={model}
      layout={layout}
      attachments={capabilities.canListAttachments
        ? (
          <AttachmentsSection
            controller={attachments}
            capabilities={capabilities}
            layout={layout}
            context={context}
          />
        )
        : undefined}
      actions={actions}
      contextTarget={contextTarget}
      renderChildRowActions={renderChildRowActions}
      renderChildRowContextTarget={renderChildRowContextTarget}
      childRowActionsPlacement="visible"
    />
  );
}
