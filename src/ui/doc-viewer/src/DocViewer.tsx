/** @jsxImportSource preact */

import { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { ActiveContextChip } from "~/shared/ActiveContextChip.tsx";
import { canShareActiveContextResource } from "~/shared/active-context.ts";
import { ConfirmSheet, useConfirm } from "~/shared/confirm.tsx";
import type { DocumentChangeEvent } from "~/shared/document-events.ts";
import { AttachmentsSection } from "~/shared/document/AttachmentsSection.tsx";
import { documentCapabilities } from "~/shared/document/capabilities.ts";
import { DocumentSurface } from "~/shared/document/DocumentSurface.tsx";
import {
  documentEnvelopeOf,
  documentModelOf,
} from "~/shared/document/model.ts";
import type { DocumentEnvelope } from "~/shared/document/types.ts";
import { useAttachments } from "~/shared/document/useAttachments.ts";
import { bindHostContext } from "~/shared/host-context-hook.ts";
import { useT } from "~/shared/i18n-hook.ts";
import { jumpFromHint } from "~/shared/jumps.ts";
import { JumpList } from "~/shared/levels/JumpList.tsx";
import { LevelBody } from "~/shared/levels/LevelBody.tsx";
import { viewerRootKey } from "~/shared/nav-stack.ts";
import { PathBar } from "~/shared/PathBar.tsx";
import {
  beginUiRefresh,
  canRequestUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  extractToolResultText,
  invalidateUiRefresh,
  normalizeUiRefreshFailureMessage,
  type ToolResultPayload,
} from "~/shared/refresh.ts";
import {
  Button,
  CasysCredit,
  StateMessage,
  ToolButton,
  ViewerShell,
} from "~/shared/ui.tsx";
import { useViewerLayout } from "~/shared/useViewerLayout.ts";
import { useViewerNav } from "~/shared/useViewerNav.ts";
import { useActiveContext } from "~/shared/useActiveContext.ts";
import { hasAvailableTool } from "~/shared/viewer-tools.ts";
import { canonicalReadbackSupersedesMutation } from "./canonical-readback.ts";
import { DOC_FIXTURE, DOC_FIXTURE_FILES, isFixtureMode } from "./fixture.ts";

const app = new App({
  name: "ERPNext Document Viewer",
  version: "3.1.0-beta.3",
});
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const CANONICAL_READBACK_DELAY_MS = 1_500;

export function DocViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const fixtureEnvelope = fixture ? documentEnvelopeOf(DOC_FIXTURE) : null;
  const [envelope, setEnvelope] = useState<DocumentEnvelope | null>(
    fixtureEnvelope,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootFreshEvent, setRootFreshEvent] = useState(fixture ? 1 : 0);
  const envelopeRef = useRef(envelope);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastRefreshStartedAtRef = useRef(0);
  const rootFreshEventRef = useRef(fixture ? 1 : 0);

  function consumeToolResult(result: ToolResultPayload): boolean {
    if (result.isError) {
      setError(extractToolResultText(result) ?? t("common.error.tool_failed"));
      setLoading(false);
      return false;
    }
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const next = documentEnvelopeOf(JSON.parse(text));
      if (!next) throw new Error("missing canonical document identity");
      envelopeRef.current = next;
      setEnvelope(next);
      const fresh = ++rootFreshEventRef.current;
      setRootFreshEvent(fresh);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("common.error.parse_failed"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(
    options: { ignoreInterval?: boolean; force?: boolean } = {},
  ): Promise<boolean> {
    if (fixture) return false;
    const current = refreshSequenceRef.current;
    if (options.force) {
      if (current.inFlight !== null) {
        refreshSequenceRef.current =
          beginUiRefresh(current, { force: true }).state;
        return refreshPromiseRef.current ?? false;
      }
      refreshSequenceRef.current = {
        ...invalidateUiRefresh(current),
        pendingForced: true,
      };
    } else if (current.inFlight !== null) {
      return false;
    }

    const operation = (async (): Promise<boolean> => {
      try {
        while (true) {
          const sequence = refreshSequenceRef.current;
          const currentEnvelope = envelopeRef.current;
          const request = currentEnvelope?.refreshRequest;
          const capabilities = currentEnvelope
            ? documentCapabilities(
              app.getHostCapabilities(),
              currentEnvelope.availableTools,
              request,
            )
            : null;
          const forced = sequence.pendingForced;
          if (
            !request || !capabilities?.canRefresh ||
            !canRequestUiRefresh({
              request,
              visibilityState: typeof document === "undefined"
                ? "visible"
                : document.visibilityState,
              refreshInFlight: false,
              now: Date.now(),
              lastRefreshStartedAt: lastRefreshStartedAtRef.current,
              minIntervalMs: REFRESH_INTERVAL_MS,
            }, { ignoreInterval: options.ignoreInterval || forced })
          ) return false;

          const started = beginUiRefresh(sequence, { force: forced });
          if (started.generation === null) return false;
          refreshSequenceRef.current = started.state;
          lastRefreshStartedAtRef.current = Date.now();
          setRefreshing(true);

          let result: ToolResultPayload | null = null;
          let failure: unknown = null;
          try {
            result = await app.callServerTool({
              name: request.toolName,
              arguments: request.arguments,
            }, { timeout: TOOL_CALL_TIMEOUT_MS });
          } catch (cause) {
            failure = cause;
          }

          const completed = completeUiRefresh(
            refreshSequenceRef.current,
            started.generation,
          );
          refreshSequenceRef.current = completed.state;
          let succeeded = false;
          if (completed.accept) {
            if (failure) setError(normalizeUiRefreshFailureMessage(failure));
            else if (result?.isError) {
              setError(t("common.error.refresh_failed"));
            } else if (result) succeeded = consumeToolResult(result);
          }
          if (!completed.runPending) return succeeded;
        }
      } finally {
        setRefreshing(false);
      }
    })();
    refreshPromiseRef.current = operation;
    void operation.finally(() => {
      if (refreshPromiseRef.current === operation) {
        refreshPromiseRef.current = null;
      }
    });
    return operation;
  }

  function invalidateRefresh() {
    refreshSequenceRef.current = invalidateUiRefresh(
      refreshSequenceRef.current,
    );
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
      invalidateRefresh();
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!envelopeRef.current) setLoading(true);
    };
    app.connect().then(() => bindHostContext(app)).catch(() => {});
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    const refresh = () => void requestRefresh({ ignoreInterval: true });
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [fixture]);

  if (loading || !envelope) {
    return (
      <ViewerShell class="h-screen">
        <StateMessage>
          {loading ? t("common.loading") : t("common.no_data")}
        </StateMessage>
      </ViewerShell>
    );
  }

  return (
    <DocumentContent
      key={`${envelope.doctype}:${envelope.name}`}
      envelope={envelope}
      fixture={fixture}
      error={error}
      refreshing={refreshing}
      rootFreshEvent={rootFreshEvent}
      onError={setError}
      onInvalidateRefresh={invalidateRefresh}
      onRefresh={(force = false) =>
        requestRefresh({ ignoreInterval: true, force })}
    />
  );
}

function DocumentContent({
  envelope,
  fixture,
  error,
  refreshing,
  rootFreshEvent,
  onError,
  onInvalidateRefresh,
  onRefresh,
}: {
  envelope: DocumentEnvelope;
  fixture: boolean;
  error: string | null;
  refreshing: boolean;
  rootFreshEvent: number;
  onError: (message: string | null) => void;
  onInvalidateRefresh: () => void;
  onRefresh: (force?: boolean) => Promise<boolean>;
}) {
  const t = useT();
  const { ref, layout } = useViewerLayout<HTMLDivElement>();
  const confirm = useConfirm();
  const [showJson, setShowJson] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [mutationCommitted, setMutationCommitted] = useState(false);
  const [mutationBaseline, setMutationBaseline] = useState<number | null>(null);
  const delayedRefreshRef = useRef<number | null>(null);
  const model = documentModelOf(envelope);
  const hostCapabilities = fixture ? undefined : app.getHostCapabilities();
  const capabilities = documentCapabilities(
    hostCapabilities,
    envelope.availableTools,
    envelope.refreshRequest,
  );
  const rootKey = viewerRootKey("document", envelope.refreshRequest, {
    doctype: envelope.doctype,
    name: envelope.name,
  });
  const viewerNav = useViewerNav(app, {
    title: envelope.name,
    kind: "root",
    origin: "record",
    body: envelope,
    key: rootKey,
  }, { fixture });
  const activeContext = useActiveContext(app, rootKey);
  const nav = viewerNav.nav;
  const rootId = nav.stack.levels[0].id;

  useLayoutEffect(() => {
    if (
      canonicalReadbackSupersedesMutation(mutationBaseline, rootFreshEvent)
    ) {
      nav.clearStale(rootId);
      setMutationBaseline(null);
      setMutationCommitted(false);
    }
  }, [mutationBaseline, rootFreshEvent, rootId]);
  useEffect(() => () => {
    if (delayedRefreshRef.current !== null) {
      clearTimeout(delayedRefreshRef.current);
    }
  }, []);

  const beginCanonicalReadback = () => {
    setMutationBaseline(rootFreshEvent);
    onInvalidateRefresh();
  };

  const scheduleCanonicalRefresh = () => {
    if (delayedRefreshRef.current !== null) {
      clearTimeout(delayedRefreshRef.current);
    }
    delayedRefreshRef.current = window.setTimeout(() => {
      delayedRefreshRef.current = null;
      void onRefresh(true).then((refreshed) => {
        if (!refreshed) onError(t("common.error.refresh_failed"));
      }, () => onError(t("common.error.refresh_failed")));
    }, CANONICAL_READBACK_DELAY_MS);
  };

  const reportChange = (event: DocumentChangeEvent) => {
    nav.reportDocumentChange(event);
    beginCanonicalReadback();
  };
  const attachments = useAttachments({
    app,
    envelope,
    capabilities,
    fixtureFiles: fixture ? DOC_FIXTURE_FILES : undefined,
    onDocumentChanged: (event) => {
      reportChange(event);
      scheduleCanonicalRefresh();
    },
  });

  if (!model) {
    return (
      <ViewerShell class="h-screen" containerRef={ref}>
        <StateMessage tone="bad">{t("common.error.parse_failed")}</StateMessage>
      </ViewerShell>
    );
  }

  const hints = envelope.sendMessageHints ?? [];
  const jumps = viewerNav.jumpsEnabled
    ? hints.flatMap((hint) => {
      if (!hint.tool || !hasAvailableTool(envelope.availableTools, hint.tool)) {
        return [];
      }
      const jump = jumpFromHint(
        hint,
        { id: envelope.name, doctype: envelope.doctype },
        t("nav.linked_to", { id: envelope.name }),
      );
      return jump ? [jump] : [];
    })
    : [];
  const asks = !viewerNav.jumpsEnabled && viewerNav.ask
    ? hints.flatMap((hint) =>
      hint.message
        ? [{
          label: hint.label,
          message: hint.message
            .replace(/\{id\}/g, envelope.name)
            .replace(/\{doctype\}/g, envelope.doctype),
        }]
        : []
    )
    : [];

  async function mutate(mutation: "submit" | "cancel") {
    if (fixture || actionLoading) return;
    const toolName = mutation === "submit"
      ? "erpnext_doc_submit"
      : "erpnext_doc_cancel";
    if (!hasAvailableTool(envelope.availableTools, toolName)) return;
    setActionLoading(mutation);
    setActionMessage(null);
    onError(null);
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: { doctype: envelope.doctype, name: envelope.name },
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) {
        throw new Error(
          extractToolResultText(result) ?? t("doclist.detail.action_failed"),
        );
      }
      reportChange({
        doctype: envelope.doctype,
        name: envelope.name,
        mutation,
        committedAt: new Date().toISOString(),
        source: "doc-viewer",
      });
      setMutationCommitted(true);
      await new Promise<void>((resolve) =>
        setTimeout(resolve, CANONICAL_READBACK_DELAY_MS)
      );
      const refreshed = await onRefresh(true);
      setActionMessage(
        refreshed
          ? t(
            mutation === "submit"
              ? "doclist.detail.action.submit_ok"
              : "doclist.detail.action.cancel_ok",
          )
          : t("document.action.refresh_pending"),
      );
    } catch (cause) {
      const message = cause instanceof Error && cause.message
        ? cause.message
        : t("doclist.detail.action_failed");
      onError(message);
    } finally {
      setActionLoading(null);
    }
  }

  const isDraft = model.docstatus === 0 || model.status === "Draft";
  const isSubmitted = model.docstatus === 1;
  const rootStale = nav.stack.levels[0].stale;
  const canSubmit = isDraft && capabilities.canRefresh &&
    capabilities.canSubmit && !mutationCommitted;
  const canCancel = isSubmitted && capabilities.canRefresh &&
    capabilities.canCancel && !mutationCommitted;
  const navigationActions = (jumps.length > 0 || asks.length > 0) && (
    <div class="flex flex-col gap-2 border-b border-line-soft pb-3">
      <span class="font-mono text-micro uppercase tracking-label text-ink-faint">
        {t("nav.goto")}
      </span>
      <JumpList
        jumps={jumps}
        asks={asks}
        onJump={viewerNav.jumpsEnabled ? nav.jump : undefined}
        onAsk={viewerNav.ask}
        narrow={layout !== "wide"}
      />
    </div>
  );
  const mutationActions = (navigationActions || canSubmit || canCancel)
    ? (
      <div class="flex flex-col gap-2">
        {navigationActions}
        {canSubmit && (
          <Button
            variant="accent"
            disabled={actionLoading !== null}
            onClick={() =>
              confirm.request({
                subject: envelope.name,
                title: t("doclist.confirm.submit"),
                detail: t("doclist.confirm.submit.detail"),
                actionLabel: t("doclist.confirm.submit.action"),
                onConfirm: () => void mutate("submit"),
              })}
          >
            {actionLoading === "submit" ? "…" : t("common.submit")}
          </Button>
        )}
        {canCancel && (
          <Button
            variant="danger"
            disabled={actionLoading !== null}
            onClick={() =>
              confirm.request({
                subject: envelope.name,
                title: t("doclist.confirm.cancel"),
                detail: t("doclist.confirm.cancel.detail"),
                actionLabel: t("doclist.confirm.cancel.action"),
                onConfirm: () => void mutate("cancel"),
              })}
          >
            {actionLoading === "cancel" ? "…" : t("common.cancel")}
          </Button>
        )}
      </div>
    )
    : undefined;
  const attachmentSurface = fixture || capabilities.canListAttachments
    ? (
      <AttachmentsSection
        controller={attachments}
        capabilities={capabilities}
        layout={layout}
        context={{
          canShareResource: (resource) =>
            canShareActiveContextResource(hostCapabilities, resource),
          activate: activeContext.activate,
          isSelected: activeContext.isSelected,
        }}
      />
    )
    : undefined;
  const headerActions = (
    <>
      <ActiveContextChip
        selections={activeContext.selections}
        failed={activeContext.failed}
        evictedLabel={activeContext.evictedLabel}
        onRemove={activeContext.remove}
        onClear={activeContext.clear}
        compact={layout !== "wide"}
      />
      {rootStale && (
        <span
          role="status"
          title={t("nav.stale_title")}
          class="inline-flex items-center gap-1.5 font-mono text-nano text-warn"
        >
          <span aria-hidden="true" class="size-1.5 rounded-full bg-warn" />
          {layout === "wide" && t("nav.stale_values", { at: rootStale.at })}
        </span>
      )}
      {capabilities.canRefresh && (
        <ToolButton
          aria-label={t("common.refresh")}
          title={t("common.refresh")}
          disabled={refreshing || actionLoading !== null}
          onClick={() => void onRefresh()}
        >
          {refreshing ? "…" : "↻"}
        </ToolButton>
      )}
      <ToolButton
        aria-pressed={showJson}
        title={t("document.json")}
        onClick={() => setShowJson((visible) => !visible)}
      >
        {"{ }"}
      </ToolButton>
    </>
  );
  const footer = (
    <div class="flex min-h-9 items-center gap-3 px-3.5 py-2">
      <div class="min-w-0 flex-1">
        {error
          ? <StateMessage tone="bad">{error}</StateMessage>
          : actionMessage
          ? <span class="font-mono text-chip text-ok">{actionMessage}</span>
          : null}
      </div>
      <CasysCredit />
    </div>
  );

  return (
    <ViewerShell class="h-screen" containerRef={ref}>
      <PathBar
        layout={layout}
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={nav.current.loading}
      />
      {nav.isRoot
        ? (
          <div class="relative flex min-h-0 flex-1">
            <DocumentSurface
              model={model}
              layout={layout}
              live={capabilities.canRefresh && !error}
              headerActions={headerActions}
              attachments={attachmentSurface}
              actions={mutationActions}
              footer={footer}
            />
            {showJson && (
              <div class="absolute inset-0 z-20 flex min-h-0 flex-col bg-surface/98">
                <div class="flex min-h-11 items-center justify-between border-b border-line px-3.5">
                  <span class="font-mono text-micro uppercase tracking-label text-ink-muted">
                    {t("document.json")}
                  </span>
                  <ToolButton onClick={() => setShowJson(false)}>
                    {t("common.close")}
                  </ToolButton>
                </div>
                <pre class="scroll-slim min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-chip leading-relaxed text-ink-2">
                  {JSON.stringify(envelope.document, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )
        : (
          <LevelBody
            level={nav.current}
            app={app}
            list={viewerNav.list}
            layout={layout}
            fixture={fixture}
            onJump={viewerNav.jumpsEnabled ? nav.jump : undefined}
            onAsk={viewerNav.ask}
            onError={onError}
            onMutated={nav.markStale}
            onDocumentChanged={nav.reportDocumentChange}
            onMutationInvalidate={beginCanonicalReadback}
            onMutationRefresh={scheduleCanonicalRefresh}
            onRefresh={() => void nav.refreshLevel()}
          />
        )}
      <ConfirmSheet confirm={confirm} />
    </ViewerShell>
  );
}
