/**
 * Vue liste : un en-tête, le fil de la pile, et le corps du niveau courant —
 * la liste reçue au niveau 1, puis ce qu'on y a sauté : d'autres listes,
 * une fiche, des barres. Le chrome (Shell, Header, Footer) reste ici ; le
 * corps vit dans `shared/doclist` pour que toute vue puisse rendre une liste.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  StateMessage,
  ToolButton,
  ViewerFooter,
  ViewerHeader,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import { useT } from "~/shared/i18n-hook";
import {
  beginUiRefresh,
  canRequestUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  extractToolResultText,
  invalidateUiRefresh,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import type { DoclistData } from "~/shared/doclist/types";
import { exportCsv } from "~/shared/doclist/helpers";
import { LoadingSkeleton } from "~/shared/doclist/LoadingSkeleton";
import { DoclistEmptyState } from "~/shared/doclist/EmptyState";
import { SearchControl } from "~/shared/doclist/SearchControl";
import { DoclistBody } from "~/shared/doclist/DoclistBody";
import { useViewerNav } from "~/shared/useViewerNav";
import { viewerRootKey } from "~/shared/nav-stack";
import { PathBar } from "~/shared/PathBar";
import { LevelBody, levelListData } from "~/shared/levels/LevelBody";
import { DOCLIST_FIXTURE, isFixtureMode } from "./fixture.ts";
import { canRefreshDoclistRoot } from "./capabilities.ts";

const app = new App({ name: "Doclist Viewer", version: "2.0.0" });
const DOCLIST_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

export function DoclistViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const [data, setData] = useState<DoclistData | null>(
    fixture ? DOCLIST_FIXTURE : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootFreshEvent, setRootFreshEvent] = useState(0);
  const [rootMutationEvent, setRootMutationEvent] = useState(0);
  const rootEventRef = useRef(0);
  const dataRef = useRef<DoclistData | null>(fixture ? DOCLIST_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DoclistData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(
      nextData,
      refreshRequestRef.current,
    );
    setData(nextData);
    const event = ++rootEventRef.current;
    setRootFreshEvent(event);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    if (result.isError) {
      const text = extractToolResultText(result);
      setError(text ?? t("doclist.error.tool_error"));
      setLoading(false);
      return false;
    }
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text);
      if (!parsed) return false;
      if (!Array.isArray(parsed.data)) {
        if (parsed._title || parsed._rowAction || parsed.count != null) {
          parsed.data = [];
        } else {
          return false;
        }
      }
      hydrateData(parsed as DoclistData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("doclist.error.parse_payload"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(
    options: { ignoreInterval?: boolean; force?: boolean } = {},
  ): Promise<boolean> {
    if (fixture) return false;
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !request ||
      !canRefreshDoclistRoot(
        app.getHostCapabilities()?.serverTools,
        dataRef.current?._availableTools,
        request,
      )
    ) return false;

    const sequence = refreshSequenceRef.current;
    if (sequence.inFlight !== null) {
      if (options.force) {
        refreshSequenceRef.current = beginUiRefresh(sequence, {
          force: true,
        }).state;
      }
      return false;
    }
    const forced = Boolean(options.force || sequence.pendingForced);
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: false,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: DOCLIST_REFRESH_INTERVAL_MS,
      }, { ignoreInterval: options.ignoreInterval || forced })
    ) return false;

    const started = beginUiRefresh(sequence, { force: forced });
    if (started.generation === null) return false;
    refreshSequenceRef.current = started.state;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    let result: ToolResultPayload | null = null;
    let failure: { cause: unknown } | null = null;
    try {
      result = await app.callServerTool(
        { name: request.toolName, arguments: request.arguments },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
    } catch (cause) {
      failure = { cause };
    }

    const completed = completeUiRefresh(
      refreshSequenceRef.current,
      started.generation,
    );
    refreshSequenceRef.current = completed.state;
    let succeeded = false;
    if (completed.accept) {
      if (failure) {
        setError(normalizeUiRefreshFailureMessage(failure.cause));
      } else if (result?.isError) {
        setError(t("common.error.refresh_failed"));
      } else if (result && consumeToolResult(result)) {
        succeeded = true;
      } else {
        setError(t("common.error.refresh_no_data"));
      }
    }
    setRefreshing(false);
    if (completed.runPending) {
      void requestRefresh({ ignoreInterval: true, force: true });
    }
    return succeeded;
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
      refreshSequenceRef.current = invalidateUiRefresh(
        refreshSequenceRef.current,
      );
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
    app.connect().then(() => bindHostContext(app)).catch(() => {});
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    const onFocus = () => void requestRefresh({ ignoreInterval: true });
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fixture]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return <DoclistEmptyState />;
  }

  const refreshRequest = resolveUiRefreshRequest(
    data,
    refreshRequestRef.current,
  );
  const refreshAvailable = !fixture && canRefreshDoclistRoot(
    app.getHostCapabilities()?.serverTools,
    data._availableTools,
    refreshRequest,
  );

  return (
    <DoclistContent
      data={data}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      refreshAvailable={refreshAvailable}
      rootFreshEvent={rootFreshEvent}
      rootMutationEvent={rootMutationEvent}
      onRefresh={() => void requestRefresh({ ignoreInterval: true })}
      onMutationInvalidate={() => {
        const event = ++rootEventRef.current;
        setRootMutationEvent(event);
        refreshSequenceRef.current = invalidateUiRefresh(
          refreshSequenceRef.current,
        );
      }}
      onMutationRefresh={() =>
        void requestRefresh({ ignoreInterval: true, force: true })}
      onError={setError}
    />
  );
}

function DoclistContent({
  data,
  error,
  refreshing,
  fixture,
  refreshAvailable,
  rootFreshEvent,
  rootMutationEvent,
  onRefresh,
  onMutationInvalidate,
  onMutationRefresh,
  onError,
}: {
  data: DoclistData;
  error: string | null;
  refreshing: boolean;
  fixture: boolean;
  refreshAvailable: boolean;
  rootFreshEvent: number;
  rootMutationEvent: number;
  onRefresh: () => void;
  onMutationInvalidate: () => void;
  onMutationRefresh: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const { ref: shellRef, layout } = useViewerLayout<HTMLDivElement>();
  const rootTitle = data._title ?? data.doctype ?? t("doclist.title.default");
  const viewerNav = useViewerNav(app, {
    title: rootTitle,
    kind: "root",
    origin: "list",
    key: viewerRootKey("doclist", data.refreshRequest, {
      doctype: data.doctype ?? null,
      title: data.doctype ? null : rootTitle,
    }),
  }, {
    fixture,
    rootList: data,
  });
  const nav = viewerNav.nav;
  const { current, isRoot } = nav;
  const { jumpsEnabled, ask } = viewerNav;
  // La racine lit toujours la dernière payload reçue ; un niveau empilé
  // garde la sienne jusqu'à ce qu'on le coupe.
  const levelData: DoclistData = isRoot ? data : levelListData(current);
  const { list } = viewerNav;
  const isList = isRoot || current.kind === "list";
  const rootLevelId = nav.stack.levels[0].id;

  useLayoutEffect(() => {
    if (rootFreshEvent > rootMutationEvent) nav.clearStale(rootLevelId);
  }, [rootFreshEvent, rootMutationEvent, rootLevelId]);

  return (
    <ViewerShell class="h-screen" containerRef={shellRef}>
      <ViewerHeader
        title={isRoot ? rootTitle : current.title}
        count={isList
          ? (isRoot ? data.count ?? list.rows.length : current.count)
          : undefined}
        live={isRoot && refreshAvailable && !error}
        layout={layout}
        actions={isList && !current.loading && (
          <>
            <SearchControl
              value={list.filter}
              layout={layout}
              open={list.searchOpen}
              onOpenChange={list.setSearchOpen}
              onInput={list.setFilter}
            />
            {layout === "wide" && (
              <>
                {isRoot && refreshAvailable && (
                  <ToolButton
                    disabled={refreshing}
                    title={t("common.refresh")}
                    onClick={onRefresh}
                  >
                    {refreshing ? "…" : "↻"}
                  </ToolButton>
                )}
                <ToolButton
                  onClick={() =>
                    exportCsv(list.columns, list.sorted, levelData.doctype)}
                >
                  CSV
                </ToolButton>
              </>
            )}
          </>
        )}
      />
      <PathBar
        layout={layout}
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={current.loading}
      />
      <LevelBody
        level={current}
        app={app}
        list={list}
        layout={layout}
        fixture={fixture}
        onJump={jumpsEnabled ? nav.jump : undefined}
        onAsk={ask}
        onError={onError}
        onMutated={nav.markStale}
        onDocumentChanged={nav.reportDocumentChange}
        onMutationInvalidate={refreshAvailable
          ? onMutationInvalidate
          : undefined}
        onMutationRefresh={refreshAvailable ? onMutationRefresh : undefined}
        onRefresh={() => void nav.refreshLevel()}
      >
        <DoclistBody
          app={app}
          data={data}
          list={list}
          layout={layout}
          fixture={fixture}
          error={error}
          stale={nav.stack.levels[0].stale}
          onRefresh={refreshAvailable ? onRefresh : undefined}
          onMutationInvalidate={refreshAvailable
            ? onMutationInvalidate
            : undefined}
          onMutationRefresh={refreshAvailable ? onMutationRefresh : undefined}
          onMutated={nav.markStale}
          onDocumentChanged={nav.reportDocumentChange}
          onError={onError}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onAsk={ask}
        />
      </LevelBody>
      <ViewerFooter layout={layout} />
    </ViewerShell>
  );
}
