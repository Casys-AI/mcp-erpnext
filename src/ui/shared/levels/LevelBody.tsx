/**
 * Le corps du niveau courant d'une pile : chargement, erreur, fiche,
 * barres ou liste. Chaque vue rend sa racine elle-même et délègue ici
 * tout ce qu'on y a empilé.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import type { ComponentChildren } from "preact";
import { AttachmentsSection } from "../document/AttachmentsSection.tsx";
import { documentCapabilities } from "../document/capabilities.ts";
import { documentModelOf } from "../document/model.ts";
import { DocumentSurface } from "../document/DocumentSurface.tsx";
import type { DocumentEnvelope } from "../document/types.ts";
import { useAttachments } from "../document/useAttachments.ts";
import type { DocumentChangeEvent } from "../document-events.ts";
import { DoclistBody } from "../doclist/DoclistBody";
import { LoadingSkeleton } from "../doclist/LoadingSkeleton";
import type { DoclistData } from "../doclist/types";
import type { DoclistState } from "../doclist/useDoclist";
import { fillTemplate, hintLabel, type Jump, jumpFromHint } from "../jumps";
import type { NavLevel } from "../nav-stack";
import { useT } from "../i18n-hook";
import { Label, StateMessage } from "../ui";
import type { ViewerLayout } from "../useViewerLayout";
import { BarsLevel } from "./BarsLevel";
import { chartHintAt, chartOf, listOf, recordOf } from "./bodies";
import { JumpList } from "./JumpList";

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
    /** Ce que la vue rend pour sa racine (niveau 1). */
    children?: ComponentChildren;
  },
) {
  const t = useT();
  const narrow = layout !== "wide";
  if (level.kind === "root") return <>{children}</>;
  if (level.loading) return <LoadingSkeleton />;
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
      />
    );
  }
  if (level.kind === "chart") {
    const chart = chartOf(level.body);
    if (!chart) return unexpected;
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
    const clickable = chart.labels.some((_, labelIndex) =>
      chart.datasets.some((_, seriesIndex) =>
        pointJump(labelIndex, seriesIndex) !== null
      )
    );
    return (
      <BarsLevel
        chart={chart}
        narrow={narrow}
        caption={clickable ? t("nav.bar_click") : undefined}
        isPointInteractive={(labelIndex, seriesIndex) =>
          pointJump(labelIndex, seriesIndex) !== null}
        onPointClick={clickable
          ? (labelIndex, seriesIndex) => {
            const jump = pointJump(labelIndex, seriesIndex);
            if (jump) onJump?.(jump);
          }
          : undefined}
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
  const hintJumps = onJump
    ? hints
      .filter((hint) =>
        hint.tool && app.getHostCapabilities()?.serverTools && exactTools &&
        exactTools.includes(hint.tool)
      )
      .map((hint) =>
        jumpFromHint(
          hint,
          vars,
          t("nav.linked_to", { id: envelope.name }),
        )
      )
      .filter((jump): jump is Jump => jump !== null)
    : [];
  const jumps = [...(levelJumps ?? []), ...hintJumps];
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
      label: t("nav.ask"),
      message: t("doclist.detail.full_detail_message", {
        doctype: envelope.doctype,
        id: envelope.name,
      }),
    });
  }
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
          />
        )
        : undefined}
      actions={actions}
    />
  );
}
