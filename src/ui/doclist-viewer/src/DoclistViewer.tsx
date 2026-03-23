/**
 * Doclist Viewer — Generic ERPNext DocType table
 *
 * Features: auto-detect columns, sorting, filtering, pagination,
 * CSV export, status badges, inline detail panels with server actions,
 * cross-viewer navigation via sendMessage, and chip filters.
 *
 * @module lib/erpnext/src/ui/doclist-viewer
 */

import { Fragment, useState, useEffect, useMemo, useCallback, useRef, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { ErpNextBrandHeader, ErpNextBrandFooter } from "~/shared/ErpNextBrand";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";

import type { DoclistData, SortDir } from "./types";
import { isStatusField, formatCell, exportCsv, getNestedValue, HIDDEN_FIELDS, FILTERABLE_COLUMNS, selectVisibleColumns } from "./helpers";
import { StatusCell } from "./components/StatusCell";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { DoclistEmptyState } from "./components/EmptyState";
import { InlineDetailPanel } from "./components/InlineDetailPanel";
import { ChipFilters } from "./components/ChipFilters";
import { PagBtn } from "./components/PagBtn";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Doclist Viewer", version: "2.0.0" });
const DOCLIST_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

// ============================================================================
// Main Component (page shell)
// ============================================================================

export function DoclistViewer() {
  const [data, setData] = useState<DoclistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<DoclistData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: DoclistData) {
    dataRef.current = nextData;
    refreshRequestRef.current = resolveUiRefreshRequest(nextData, refreshRequestRef.current);
    setData(nextData);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    if (result.isError) {
      const text = extractToolResultText(result);
      setError(text ?? "Tool returned an error");
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
      setError("Failed to parse doclist payload");
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    const request = resolveUiRefreshRequest(dataRef.current, refreshRequestRef.current);
    if (!canRequestUiRefresh({
      request,
      visibilityState: typeof document === "undefined" ? "visible" : document.visibilityState,
      refreshInFlight: refreshInFlightRef.current,
      now: Date.now(),
      lastRefreshStartedAt: lastRefreshStartedAtRef.current,
      minIntervalMs: DOCLIST_REFRESH_INTERVAL_MS,
    }, options)) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool(
        { name: request.toolName, arguments: request.arguments },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (result.isError) setError("Refresh failed");
      else if (!consumeToolResult(result)) setError("Refresh returned no data");
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  useEffect(() => {
    app.connect().catch(() => {});
    app.ontoolresult = (result: ToolResultPayload) => { consumeToolResult(result); };
    app.ontoolinputpartial = () => { if (!dataRef.current) setLoading(true); };
  }, []);

  useEffect(() => {
    const onFocus = () => void requestRefresh({ ignoreInterval: true });
    const onVis = () => { if (document.visibilityState === "visible") void requestRefresh({ ignoreInterval: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }} aria-busy={refreshing}>
      <ErpNextBrandHeader />
      <div style={{ flex: 1 }}>
        {loading ? <LoadingSkeleton /> : !data ? <DoclistEmptyState /> : (
          <DoclistContent data={data} error={error} refreshing={refreshing} onRefresh={() => void requestRefresh({ ignoreInterval: true })} onError={setError} />
        )}
      </div>
      <ErpNextBrandFooter />
    </div>
  );
}

// ============================================================================
// DoclistContent (organism — table + filters + detail)
// ============================================================================

const PAGE_SIZE = 20;

function DoclistContent({ data, error, refreshing, onRefresh, onError }: {
  data: DoclistData; error: string | null; refreshing: boolean; onRefresh: () => void; onError: (msg: string | null) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, unknown> | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [chipFilters, setChipFilters] = useState<Record<string, string>>({});
  const actionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRowIdRef = useRef<string | null>(null);

  const rowAction = data._rowAction;
  const rows = data.data ?? [];
  const hasLocalDetail = rows.length > 0 && rows[0]._detail != null;
  const isClickable = !!rowAction || hasLocalDetail;

  // ── Row click handler ────────────────────────────────────

  async function onRowClick(row: Record<string, unknown>) {
    const rowId = rowAction
      ? String(getNestedValue(row, rowAction.idField) ?? "")
      : String(row._id ?? row.name ?? "");
    if (!rowId) return;

    if (expandedId === rowId) { setExpandedId(null); setExpandedData(null); return; }

    if (!rowAction && row._detail) {
      setExpandedId(rowId);
      setExpandedData(row._detail as Record<string, unknown>);
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
      // Guard against stale response if user clicked another row
      if (pendingRowIdRef.current !== rowId) return;
      if (!result.isError) {
        const text = extractToolResultText(result);
        if (text) { const parsed = JSON.parse(text); setExpandedData(parsed.data ?? parsed); onError(null); }
      } else { onError("Failed to load details"); setExpandedId(null); }
    } catch (err) {
      if (pendingRowIdRef.current !== rowId) return;
      onError(err instanceof Error ? err.message : "Failed to load details");
      setExpandedId(null);
    } finally { if (pendingRowIdRef.current === rowId) setExpandedLoading(false); }
  }

  async function handleDetailAction(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await app.callServerTool({ name: toolName, arguments: args }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return false;
      const currentId = expandedId;
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(async () => {
        // Only refresh if the same row is still expanded
        if (currentId && rowAction && pendingRowIdRef.current === currentId) {
          try {
            const r = await app.callServerTool({ name: rowAction.toolName, arguments: { ...rowAction.extraArgs, [rowAction.argName]: currentId } }, { timeout: TOOL_CALL_TIMEOUT_MS });
            if (pendingRowIdRef.current !== currentId) return;
            if (!r.isError) { const text = extractToolResultText(r); if (text) { const p = JSON.parse(text); setExpandedData(p.data ?? p); } }
          } catch { /* ignore */ }
        }
      }, 1500);
      return true;
    } catch { return false; }
  }

  useEffect(() => { setExpandedId(null); setExpandedData(null); }, [sortKey, sortDir, filter, page, chipFilters]);

  // ── Filterable columns ───────────────────────────────────

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

  // ── Visible columns (capped at MAX_VISIBLE_COLUMNS) ─────

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

  // ── Filter + sort + paginate ─────────────────────────────

  const filtered = useMemo(() => {
    let result = rows;
    for (const [col, value] of Object.entries(chipFilters)) {
      if (value) result = result.filter((row) => row[col] === value);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter((row) => columns.some((col) => formatCell(row[col]).toLowerCase().includes(q)));
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
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const title = data._title ?? data.doctype ?? "Documents";

  // ── Render ───────────────────────────────────────────────

  return (
    <div style={{ padding: 16, fontFamily: fonts.sans }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>{title}</div>
          <div style={{ fontSize: 12, color: colors.text.muted }}>{sorted.length} of {data.count ?? rows.length} records</div>
          <div aria-live="polite" style={{ fontSize: 11, color: error ? colors.error : colors.text.faint, marginTop: 4 }}>
            {error ?? (refreshing ? "Refreshing…" : "Auto-refresh on focus")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text" placeholder="Search..." value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            style={{ ...styles.input, maxWidth: 200 }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.accent; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.border; }}
          />
          <button onClick={onRefresh} disabled={refreshing} style={styles.button}
            onMouseEnter={(e) => { if (!refreshing) { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; (e.currentTarget as HTMLElement).style.color = colors.accent; } }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.text.secondary; }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10 6a4 4 0 1 1-1.1-2.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M10 2v2.8H7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {refreshing ? "Refreshing" : "Refresh"}
            </span>
          </button>
          <button onClick={() => exportCsv(columns, sorted, data.doctype)} style={styles.button}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; (e.currentTarget as HTMLElement).style.color = colors.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; (e.currentTarget as HTMLElement).style.color = colors.text.secondary; }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v8M6 9l-3-3M6 9l3-3M2 11h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              CSV
            </span>
          </button>
        </div>
      </div>

      {/* Chip Filters */}
      <ChipFilters
        columns={filterableColumns}
        chipFilters={chipFilters}
        onFilterChange={(col, value) => {
          setChipFilters(prev => {
            if (value === null) { const next = { ...prev }; delete next[col]; return next; }
            return { ...prev, [col]: value };
          });
          setPage(0);
        }}
      />

      {/* Table */}
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, columns.length * 120) }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col} onClick={() => handleSort(col)} style={{
                    ...styles.tableHeader, background: colors.bg.surface,
                    color: sortKey === col ? colors.accent : colors.text.muted,
                  }}>
                    {col.replace(/_/g, " ")}
                    <span style={{ marginLeft: 4, opacity: sortKey === col ? 1 : 0.3, fontSize: 10 }}>
                      {sortKey === col ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u21C5"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...styles.tableCell, textAlign: "center", color: colors.text.muted, padding: 32 }}>
                    No matching records
                  </td>
                </tr>
              ) : pageRows.map((row, idx) => {
                const rowId = rowAction
                  ? String(getNestedValue(row, rowAction.idField) ?? "")
                  : String(row._id ?? row.name ?? idx);
                const isExpanded = expandedId === rowId && rowId !== "";
                return (
                  <Fragment key={idx}>
                    <tr
                      style={{ transition: "background 0.1s", cursor: isClickable ? "pointer" : "default", background: isExpanded ? colors.bg.hover : "transparent" }}
                      onClick={isClickable ? () => void onRowClick(row) : undefined}
                      onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                      onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {columns.map((col, colIdx) => {
                        const val = row[col];
                        const isNum = typeof val === "number";
                        const isStatus = isStatusField(col) && typeof val === "string";
                        return (
                          <td key={col} style={{
                            ...styles.tableCell,
                            ...(isNum ? { textAlign: "right", fontFamily: fonts.mono, fontSize: 12 } : {}),
                            ...(col === "name" ? { fontWeight: 500 } : {}),
                            maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          } as CSSProperties}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: isNum ? "flex-end" : "flex-start" }}>
                              {expandedLoading && isExpanded && colIdx === 0 && (
                                <span className="skeleton" style={{ width: 12, height: 12, borderRadius: "50%", display: "inline-block", flexShrink: 0 }} />
                              )}
                              {isStatus ? <StatusCell value={val as string} /> : formatCell(val)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={columns.length} style={{ padding: 0, borderBottom: `1px solid ${colors.border}` }}>
                          <InlineDetailPanel
                            app={app}
                            data={expandedData}
                            loading={expandedLoading}
                            doctype={data.doctype}
                            sendMessageHints={data._sendMessageHints}
                            onClose={() => { setExpandedId(null); setExpandedData(null); }}
                            onAction={handleDetailAction}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, color: colors.text.muted }}>Page {page + 1} of {totalPages}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <PagBtn label="First" disabled={page === 0} onClick={() => setPage(0)} />
            <PagBtn label="Prev" disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
            <PagBtn label="Next" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} />
            <PagBtn label="Last" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} />
          </div>
        </div>
      )}
    </div>
  );
}
