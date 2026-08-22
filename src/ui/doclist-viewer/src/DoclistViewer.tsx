/**
 * Vue liste : un en-tête, le fil de la pile, et le corps du niveau courant —
 * la liste reçue au niveau 1, puis ce qu'on y a sauté : d'autres listes,
 * une fiche, des barres. Le chrome (Shell, Header, Footer) reste ici ; le
 * corps vit dans `shared/doclist` pour que toute vue puisse rendre une liste.
 */

import { useEffect, useRef, useState } from "preact/hooks";
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
  canRequestUiRefresh,
  extractToolResultText,
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
import { PathBar } from "~/shared/PathBar";
import { LevelBody, levelListData } from "~/shared/levels/LevelBody";
import { DOCLIST_FIXTURE, isFixtureMode } from "./fixture.ts";

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
  const dataRef = useRef<DoclistData | null>(fixture ? DOCLIST_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DoclistData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(
      nextData,
      refreshRequestRef.current,
    );
    setData(nextData);
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

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    if (fixture) return;
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: DOCLIST_REFRESH_INTERVAL_MS,
      }, options)
    ) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool(
        { name: request.toolName, arguments: request.arguments },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (result.isError) setError(t("common.error.refresh_failed"));
      else if (!consumeToolResult(result)) {
        setError(t("common.error.refresh_no_data"));
      }
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
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

  return (
    <DoclistContent
      data={data}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      onRefresh={() => void requestRefresh({ ignoreInterval: true })}
      onError={setError}
    />
  );
}

function DoclistContent({
  data,
  error,
  refreshing,
  fixture,
  onRefresh,
  onError,
}: {
  data: DoclistData;
  error: string | null;
  refreshing: boolean;
  fixture: boolean;
  onRefresh: () => void;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const { ref: shellRef, layout } = useViewerLayout<HTMLDivElement>();
  const rootTitle = data._title ?? data.doctype ?? t("doclist.title.default");
  const viewerNav = useViewerNav(app, {
    title: rootTitle,
    kind: "root",
    origin: "list",
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

  return (
    <ViewerShell class="h-screen" containerRef={shellRef}>
      <ViewerHeader
        title={isRoot ? rootTitle : current.title}
        count={isList
          ? (isRoot ? data.count ?? list.rows.length : current.count)
          : undefined}
        live={isRoot && !fixture && !error}
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
                {isRoot && (
                  <ToolButton
                    disabled={refreshing || fixture}
                    title={fixture
                      ? t("doclist.preview.no_refresh")
                      : t("common.refresh")}
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
          onRefresh={onRefresh}
          onMutated={nav.markStale}
          onError={onError}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onAsk={ask}
        />
      </LevelBody>
      <ViewerFooter layout={layout} />
    </ViewerShell>
  );
}
