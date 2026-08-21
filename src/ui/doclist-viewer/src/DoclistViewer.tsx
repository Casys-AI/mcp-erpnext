/** @jsxImportSource preact */
/**
 * Doclist Viewer — generic ERPNext DocType table.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  StateMessage,
  ToolButton,
  TotalRow,
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

import type { DoclistData, SortDir } from "./types";
import {
  exportCsv,
  FILTERABLE_COLUMNS,
  formatCell,
  getNestedValue,
  HIDDEN_FIELDS,
  isStatusField,
  selectVisibleColumns,
} from "./helpers";
import { pickAmountColumn, sumColumn } from "./columns";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { DoclistEmptyState } from "./components/EmptyState";
import { InlineDetailPanel } from "./components/InlineDetailPanel";
import { ChipFilters } from "./components/ChipFilters";
import { DoclistTable } from "./components/DoclistTable";
import { SearchControl, SearchRow } from "./components/SearchControl";
import { DOCLIST_FIXTURE, isFixtureMode } from "./fixture.ts";

const app = new App({ name: "Doclist Viewer", version: "2.0.0" });
const DOCLIST_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 20;

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

function resolveRowId(
  row: Record<string, unknown>,
  rowAction: DoclistData["_rowAction"],
  fallback: string,
): string {
  if (rowAction) {
    return String(getNestedValue(row, rowAction.idField) ?? fallback);
  }
  return String(row._id ?? row.name ?? fallback);
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
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<
    Record<string, unknown> | null
  >(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [chipFilters, setChipFilters] = useState<Record<string, string>>({});
  const actionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRowIdRef = useRef<string | null>(null);
  const { ref: shellRef, layout } = useViewerLayout<HTMLDivElement>();
  const [searchOpen, setSearchOpen] = useState(false);
  // Les deux mises en page étroites partagent tout sauf le rendu des lignes.
  const narrow = layout !== "wide";

  const rowAction = data._rowAction;
  const rows = data.data ?? [];
  const hasLocalDetail = rows.length > 0 && rows[0]._detail != null;
  const isClickable = !!rowAction || hasLocalDetail;

  async function onRowClick(row: Record<string, unknown>) {
    const rowId = resolveRowId(row, rowAction, "");
    if (!rowId) return;

    if (expandedId === rowId) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }

    if (fixture || (!rowAction && row._detail)) {
      setExpandedId(rowId);
      setExpandedData(
        (row._detail as Record<string, unknown> | undefined) ??
          row,
      );
      return;
    }
    if (!rowAction) return;

    setExpandedId(rowId);
    setExpandedData(null);
    setExpandedLoading(true);
    pendingRowIdRef.current = rowId;

    try {
      const toolArgs = { ...rowAction.extraArgs, [rowAction.argName]: rowId };
      const result = await app.callServerTool(
        { name: rowAction.toolName, arguments: toolArgs },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (pendingRowIdRef.current !== rowId) return;
      if (!result.isError) {
        const text = extractToolResultText(result);
        if (text) {
          const parsed = JSON.parse(text);
          setExpandedData(parsed.data ?? parsed);
          onError(null);
        }
      } else {
        onError(t("doclist.error.load_details"));
        setExpandedId(null);
      }
    } catch (err) {
      if (pendingRowIdRef.current !== rowId) return;
      onError(
        err instanceof Error ? err.message : t("doclist.error.load_details"),
      );
      setExpandedId(null);
    } finally {
      if (pendingRowIdRef.current === rowId) setExpandedLoading(false);
    }
  }

  async function handleDetailAction(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    if (fixture) return false;
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return false;
      const currentId = expandedId;
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(async () => {
        if (currentId && rowAction && pendingRowIdRef.current === currentId) {
          try {
            const r = await app.callServerTool({
              name: rowAction.toolName,
              arguments: {
                ...rowAction.extraArgs,
                [rowAction.argName]: currentId,
              },
            }, { timeout: TOOL_CALL_TIMEOUT_MS });
            if (pendingRowIdRef.current !== currentId) return;
            if (!r.isError) {
              const text = extractToolResultText(r);
              if (text) {
                const p = JSON.parse(text);
                setExpandedData(p.data ?? p);
              }
            }
          } catch { /* ignore */ }
        }
      }, 1500);
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    setExpandedId(null);
    setExpandedData(null);
  }, [sortKey, sortDir, filter, page, chipFilters]);

  const filterableColumns = useMemo(() => {
    if (rows.length < 2) return [];
    const candidates: { col: string; values: string[] }[] = [];
    for (const col of Object.keys(rows[0] ?? {})) {
      if (!FILTERABLE_COLUMNS.has(col) && !isStatusField(col)) continue;
      const distinct = new Set<string>();
      for (const row of rows) {
        const v = row[col];
        if (v != null && typeof v === "string") distinct.add(v);
        if (distinct.size > 8) break;
      }
      if (distinct.size >= 2 && distinct.size <= 8) {
        candidates.push({ col, values: Array.from(distinct).sort() });
      }
    }
    return candidates;
  }, [rows]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_FIELDS.has(key) && !key.startsWith("_")) allKeys.add(key);
      }
    }
    return selectVisibleColumns(Array.from(allKeys));
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    for (const [col, value] of Object.entries(chipFilters)) {
      if (value) result = result.filter((row) => row[col] === value);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => formatCell(row[col]).toLowerCase().includes(q))
      );
    }
    return result;
  }, [rows, filter, columns, chipFilters]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const title = data._title ?? data.doctype ?? t("doclist.title.default");

  /**
   * Une colonne est numérique dès qu'une seule ligne y porte un nombre : la
   * maquette aligne ces colonnes à droite en chiffres tabulaires, et un
   * alignement qui change de ligne en ligne serait pire qu'un faux positif.
   */
  const tableColumns = useMemo(
    () =>
      columns.map((col) => ({
        id: col,
        label: col.replace(/_/g, " "),
        numeric: rows.some((row) => typeof row[col] === "number"),
      })),
    [columns, rows],
  );

  /** Les chips portent leur effectif — compté sur l'ensemble, pas sur la page. */
  const chipCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const { col, values } of filterableColumns) {
      counts[col] = Object.fromEntries(values.map((value) => [value, 0]));
      for (const row of rows) {
        const value = row[col];
        if (typeof value === "string" && value in counts[col]) {
          counts[col][value] += 1;
        }
      }
    }
    return counts;
  }, [filterableColumns, rows]);

  const amountKey = useMemo(() => pickAmountColumn(tableColumns), [
    tableColumns,
  ]);

  /**
   * Le total porte sur l'ensemble filtré, pas sur la page : « total dû » perd
   * son sens s'il ne compte que les vingt lignes qu'on voit.
   */
  const amountTotal = useMemo(
    () => sumColumn(sorted, amountKey),
    [sorted, amountKey],
  );

  const inspecting = expandedId !== null;

  return (
    <ViewerShell class="h-screen" containerRef={shellRef}>
      <ViewerHeader
        title={title}
        count={data.count ?? rows.length}
        live={!fixture && !error}
        layout={layout}
        actions={
          <>
            <SearchControl
              value={filter}
              layout={layout}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onInput={(next) => {
                setFilter(next);
                setPage(0);
              }}
            />
            {layout === "wide" && (
              <>
                <ToolButton
                  disabled={refreshing || fixture}
                  title={fixture
                    ? t("doclist.preview.no_refresh")
                    : t("common.refresh")}
                  onClick={onRefresh}
                >
                  {refreshing ? "…" : "↻"}
                </ToolButton>
                <ToolButton
                  onClick={() => exportCsv(columns, sorted, data.doctype)}
                >
                  CSV
                </ToolButton>
              </>
            )}
          </>
        }
      />

      {layout === "mobile" && searchOpen && (
        <SearchRow
          value={filter}
          onInput={(next) => {
            setFilter(next);
            setPage(0);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {layout !== "panel" && (
        <ChipFilters
          columns={filterableColumns}
          chipFilters={chipFilters}
          counts={chipCounts}
          total={rows.length}
          pill={layout === "mobile"}
          onFilterChange={(col, value) => {
            setChipFilters((prev) => {
              if (value === null) {
                const next = { ...prev };
                delete next[col];
                return next;
              }
              return { ...prev, [col]: value };
            });
            setPage(0);
          }}
        />
      )}

      {error && <StateMessage tone="bad">{error}</StateMessage>}

      {
        /*
        En large, l'inspecteur prend une colonne à côté de la liste. En étroit
        il n'y a pas de place pour deux colonnes : il remplace la liste, et sa
        croix y fait office de retour. La maquette ne montre pas ce cas — c'est
        le pli maître-détail habituel, extrapolé.
      */
      }
      <div
        class={`grid min-h-0 flex-1 ${
          inspecting && !narrow ? "grid-cols-[1fr_268px]" : "grid-cols-1"
        }`}
      >
        {!(inspecting && narrow) && (
          <div
            class={`flex min-h-0 flex-col ${
              inspecting && !narrow ? "border-r border-line" : ""
            }`}
          >
            {/* Seul le tableau défile : le total doit rester sous les yeux. */}
            <div class="scroll-slim min-h-0 flex-1 overflow-y-auto">
              <DoclistTable
                columns={tableColumns}
                rows={pageRows}
                rowId={(row, index) =>
                  resolveRowId(row, rowAction, String(index))}
                selectedId={expandedId}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                onSelect={isClickable
                  ? (row) => void onRowClick(row)
                  : undefined}
                layout={layout}
                amountKey={amountKey}
              />
            </div>

            {
              /*
              Le total clôt la colonne de liste, pas la vue : dans la maquette
              il s'arrête au bord de l'inspecteur. Il compte l'ensemble filtré
              et non la page — « total dû » perdrait son sens sur vingt lignes.
            */
            }
            {amountTotal !== null && (
              <TotalRow
                layout={layout}
                label={amountKey?.replace(/_/g, " ") ?? t("common.total")}
              >
                {formatCell(amountTotal)}
              </TotalRow>
            )}
          </div>
        )}

        {inspecting && (
          <InlineDetailPanel
            app={app}
            data={expandedData}
            loading={expandedLoading}
            doctype={data.doctype}
            sendMessageHints={data._sendMessageHints}
            fixture={fixture}
            layout={layout}
            onClose={() => {
              setExpandedId(null);
              setExpandedData(null);
            }}
            onAction={handleDetailAction}
          />
        )}
      </div>

      <ViewerFooter layout={layout}>
        {totalPages > 1 && (
          <>
            <ToolButton
              disabled={page === 0}
              aria-label={t("common.pagination.prev")}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </ToolButton>
            <span class="font-mono text-meta text-ink-muted">
              {page + 1} / {totalPages}
            </span>
            <ToolButton
              disabled={page >= totalPages - 1}
              aria-label={t("common.pagination.next")}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </ToolButton>
          </>
        )}
      </ViewerFooter>
    </ViewerShell>
  );
}
