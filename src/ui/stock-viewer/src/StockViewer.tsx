/** @jsxImportSource preact */
/**
 * Stock viewer — Direction B v2.
 * Handshake stays on ext-apps (refresh / callServerTool / sendMessage).
 * Presentation: Tailwind classes only, no @casys/mcp-view dependency.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  CasysCredit,
  CountBadge,
  cx,
  StateMessage,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import { type Tone, TONE_RULE } from "~/shared/status";
import { formatCurrency, formatInteger, formatNumber } from "~/shared/format";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { useT } from "~/shared/i18n-hook";
import { StockDetailPanel } from "./components/StockDetailPanel";
import { StockInlineExpand } from "./components/StockInlineExpand";
import { isFixtureMode, STOCK_FIXTURE } from "./fixture.ts";
import type { StockData, StockEntry } from "./types.ts";

const app = new App({ name: "Stock Viewer", version: "2.0.0" });
const STOCK_REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

type SortKey = keyof StockEntry;

/** Tone for the left border and qty colour of a stock row. */
function qtyTone(qty: number): Tone {
  if (qty <= 0) return "bad";
  if (qty < 10) return "warn";
  return "ok";
}

function rowKey(entry: StockEntry): string {
  return `${entry.item_code}::${entry.warehouse}`;
}

/** Derive a warehouse context label from the payload. */
function deriveWarehouse(data: StockData): string {
  const fromArgs = data.refreshRequest?.arguments?.warehouse;
  if (fromArgs) return String(fromArgs);
  const unique = [...new Set(data.data.map((e) => e.warehouse))];
  return unique.length === 1 ? unique[0] : "";
}

/* ─── Tone → CSS class maps (never composed at runtime) ─────────── */

/** item_code text colour by row tone. */
const ITEM_TONE: Record<Tone, string> = {
  ok: "text-ink-2",
  warn: "text-ink-2",
  bad: "text-ink",
  neutral: "text-ink-2",
};

/** actual_qty text colour + weight by row tone. */
const QTY_TONE: Record<Tone, string> = {
  ok: "text-ink-2",
  warn: "text-warn-text",
  bad: "text-bad font-medium",
  neutral: "text-ink-2",
};

/* ─── Grid template constants ────────────────────────────────────── */
const GRID_WIDE = "1.2fr 0.8fr 0.8fr 0.8fr 0.7fr 1fr";
const GRID_MOBILE = "1fr 52px 82px";

/* ─── StockViewer state machine ──────────────────────────────────── */

export function StockViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const [data, setData] = useState<StockData | null>(
    fixture ? STOCK_FIXTURE : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<StockData | null>(fixture ? STOCK_FIXTURE : null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: StockData) {
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
      setError(text ?? t("stock.error.tool_error"));
      setLoading(false);
      return false;
    }
    const text = extractToolResultText(result);
    if (!text) return false;

    try {
      hydrateData(JSON.parse(text) as StockData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("common.error.parse_failed"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    if (fixture) return false;
    const request = resolveUiRefreshRequest(
      dataRef.current,
      refreshRequestRef.current,
    );
    if (
      !canRequestUiRefresh(
        {
          request,
          visibilityState: typeof document === "undefined"
            ? "visible"
            : document.visibilityState,
          refreshInFlight: refreshInFlightRef.current,
          now: Date.now(),
          lastRefreshStartedAt: lastRefreshStartedAtRef.current,
          minIntervalMs: STOCK_REFRESH_INTERVAL_MS,
        },
        options,
      )
    ) {
      return false;
    }
    if (!request || !app.getHostCapabilities()?.serverTools) return false;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);
    try {
      const result = await app.callServerTool(
        { name: request.toolName, arguments: request.arguments },
        { timeout: TOOL_CALL_TIMEOUT_MS },
      );
      if (result.isError) {
        setError(t("common.error.refresh_failed"));
        return false;
      }
      if (!consumeToolResult(result)) {
        setError(t("common.error.refresh_no_data"));
        return false;
      }
      return true;
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
      return false;
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
    function handleWindowFocus() {
      void requestRefresh({ ignoreInterval: true });
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    }
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fixture]);

  if (loading) {
    return (
      <ViewerShell>
        <StateMessage>{t("stock.loading")}</StateMessage>
      </ViewerShell>
    );
  }

  if (!data) {
    return (
      <ViewerShell>
        <StateMessage>{t("stock.no_data")}</StateMessage>
      </ViewerShell>
    );
  }

  return (
    <StockContent
      data={data}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      onRefresh={() => void requestRefresh({ ignoreInterval: true })}
    />
  );
}

/* ─── StockContent — presentation ───────────────────────────────── */

function StockContent(
  { data, error, refreshing: _refreshing, fixture, onRefresh: _onRefresh }: {
    data: StockData;
    error: string | null;
    refreshing: boolean;
    fixture: boolean;
    onRefresh: () => void;
  },
) {
  const t = useT();
  const { ref, layout } = useViewerLayout<HTMLDivElement>();
  // Both mobile and panel get the 3-column layout.
  const isMobile = layout !== "wide";
  // Touch targets (min-height 40px) only apply to coarse-pointer mobile, not
  // to the narrow desktop sidebar panel.
  const hasTouchTargets = layout === "mobile";

  const [sortKey, setSortKey] = useState<SortKey>("item_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, _setFilter] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const canDrill = fixture || Boolean(app.getHostCapabilities()?.serverTools);

  const filtered = useMemo(() => {
    if (!filter) return data.data;
    const q = filter.toLowerCase();
    return data.data.filter(
      (entry) =>
        entry.item_code.toLowerCase().includes(q) ||
        entry.warehouse.toLowerCase().includes(q),
    );
  }, [data.data, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalValue = useMemo(
    () => sorted.reduce((sum, entry) => sum + (entry.stock_value ?? 0), 0),
    [sorted],
  );

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  function selectionEdge(selected: boolean, interactive: boolean): string {
    return [
      "border-r-2",
      selected ? "border-r-accent" : "border-r-transparent",
      // État pressé : accent sourd, distinct de la sélection posée.
      interactive && !selected && "active:border-r-accent-edge",
    ].filter(Boolean).join(" ");
  }

  const warehouse = deriveWarehouse(data);
  const grid = isMobile ? GRID_MOBILE : GRID_WIDE;

  return (
    <ViewerShell containerRef={ref}>
      {/* ── Header ─────────────────────────────────────── */}
      <header
        class={cx(
          "flex shrink-0 items-center justify-between border-b border-line",
          isMobile ? "gap-2.5 px-3 py-[11px]" : "gap-3 px-4 py-[13px]",
        )}
      >
        <div
          class={cx(
            "flex min-w-0 items-center",
            isMobile ? "gap-2" : "gap-3",
          )}
        >
          {isMobile
            ? (
              <h3 class="m-0 truncate font-display font-semibold text-ink text-card-title">
                {t("stock.title")}
              </h3>
            )
            : (
              <h2 class="m-0 truncate font-display font-semibold text-ink text-title tracking-title">
                {t("stock.title")}
              </h2>
            )}
          <CountBadge narrow={isMobile}>{sorted.length}</CountBadge>
        </div>
        {warehouse && (
          <span
            class={cx(
              "shrink-0 font-mono text-ink-faint",
              isMobile ? "text-micro" : "text-chip",
            )}
          >
            {warehouse}
          </span>
        )}
      </header>

      {/* ── Error banner — données déjà affichées : bloc local, pas StateMessage ── */}
      {error && (
        <div class="border-l-2 border-bad shrink-0 px-4 py-2 bg-bad/10 font-mono text-chip text-bad">
          {error}
        </div>
      )}

      {/* ── Scrollable body ─────────────────────────────── */}
      <div class="min-h-0 flex-1 overflow-y-auto scroll-slim">
        {/* Column headers */}
        <div
          class="grid shrink-0 bg-sunken border-b border-line"
          style={{
            gridTemplateColumns: grid,
            padding: isMobile ? "6px 12px" : "7px 16px",
          }}
        >
          {isMobile
            ? (
              <>
                <ColHeader label={t("stock.col.item")} />
                <ColHeader label={t("stock.col.qty")} align="right" />
                <ColHeader label={t("stock.col.value")} align="right" />
              </>
            )
            : (
              <>
                <ColHeader
                  label={t("stock.col.item")}
                  onClick={() => handleSort("item_code")}
                  sorted={sortKey === "item_code"}
                  sortDir={sortKey === "item_code" ? sortDir : undefined}
                />
                <ColHeader
                  label={t("stock.col.actual")}
                  align="right"
                  onClick={() => handleSort("actual_qty")}
                  sorted={sortKey === "actual_qty"}
                  sortDir={sortKey === "actual_qty" ? sortDir : undefined}
                />
                <ColHeader
                  label={t("stock.col.reserved")}
                  align="right"
                  onClick={() => handleSort("reserved_qty")}
                  sorted={sortKey === "reserved_qty"}
                  sortDir={sortKey === "reserved_qty" ? sortDir : undefined}
                />
                <ColHeader
                  label={t("stock.col.projected")}
                  align="right"
                  onClick={() => handleSort("projected_qty")}
                  sorted={sortKey === "projected_qty"}
                  sortDir={sortKey === "projected_qty" ? sortDir : undefined}
                />
                <ColHeader
                  label={t("stock.col.rate")}
                  align="right"
                  onClick={() => handleSort("valuation_rate")}
                  sorted={sortKey === "valuation_rate"}
                  sortDir={sortKey === "valuation_rate" ? sortDir : undefined}
                />
                <ColHeader
                  label={t("stock.col.value")}
                  align="right"
                  onClick={() => handleSort("stock_value")}
                  sorted={sortKey === "stock_value"}
                  sortDir={sortKey === "stock_value" ? sortDir : undefined}
                />
              </>
            )}
        </div>

        {/* Data rows */}
        {sorted.length === 0
          ? <StateMessage>{t("stock.filter.no_results")}</StateMessage>
          : sorted.map((row) => {
            const tone = qtyTone(row.actual_qty);
            const key = rowKey(row);
            const isSelected = expandedKey === key;
            const isDanger = tone === "bad";

            return (
              <div key={key}>
                {/* Main row */}
                <div
                  class={cx(
                    "grid border-l-2 border-b border-b-line-soft transition-colors",
                    TONE_RULE[tone],
                    isDanger || isSelected
                      ? "bg-row-selected"
                      : "hover:bg-row-hover",
                    !isDanger && !isSelected && "active:bg-row-selected",
                    selectionEdge(isSelected, canDrill),
                    canDrill &&
                      "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    isMobile ? "items-center" : "items-center",
                  )}
                  style={{
                    gridTemplateColumns: grid,
                    padding: isMobile ? "0 12px" : "8px 16px",
                    minHeight: hasTouchTargets ? "40px" : undefined,
                  }}
                  {...(canDrill
                    ? {
                      // Une div qui réagit au clic sans role ni tabIndex est
                      // invisible au clavier et au lecteur d'écran : elle a
                      // l'air d'un tableau et se comporte comme un bouton.
                      role: "button",
                      tabIndex: 0,
                      "aria-expanded": isSelected,
                      onClick: () =>
                        setExpandedKey((cur) => (cur === key ? null : key)),
                      onKeyDown: (event: KeyboardEvent) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setExpandedKey((cur) => (cur === key ? null : key));
                      },
                    }
                    : {})}
                >
                  {/* item_code */}
                  <span
                    class={cx(
                      "font-mono truncate",
                      ITEM_TONE[tone],
                      "text-data",
                    )}
                  >
                    {row.item_code}
                  </span>

                  {/* actual_qty */}
                  <span
                    class={cx(
                      "font-mono text-right tabular-nums",
                      QTY_TONE[tone],
                      isMobile ? "text-data" : "text-cell",
                    )}
                  >
                    {formatInteger(row.actual_qty)}
                  </span>

                  {/* Wide-only columns: reserved, projected, rate */}
                  {!isMobile && (
                    <>
                      <span class="font-mono text-cell text-right tabular-nums text-ink-muted">
                        {formatInteger(row.reserved_qty)}
                      </span>
                      <span
                        class={cx(
                          "font-mono text-cell text-right tabular-nums",
                          row.projected_qty != null && row.projected_qty < 0
                            ? "text-bad"
                            : "text-ink-muted",
                        )}
                      >
                        {formatInteger(row.projected_qty)}
                      </span>
                      <span class="font-mono text-cell text-right tabular-nums text-ink-muted">
                        {formatNumber(row.valuation_rate, 2)}
                      </span>
                    </>
                  )}

                  {/* stock_value */}
                  <span
                    class={cx(
                      "font-mono text-right tabular-nums",
                      isMobile ? "text-data text-ink-2" : "text-cell text-ink",
                    )}
                  >
                    {formatCurrency(row.stock_value, data.currency)}
                  </span>
                </div>

                {/* Inline expansion */}
                {isSelected && (
                  isMobile
                    ? <StockInlineExpand row={row} isDanger={isDanger} />
                    : (
                      <StockDetailPanel
                        app={app}
                        itemCode={row.item_code}
                        warehouse={row.warehouse}
                        fixture={fixture}
                        onClose={() => setExpandedKey(null)}
                      />
                    )
                )}
              </div>
            );
          })}
      </div>

      {/* ── Total footer ────────────────────────────────── */}
      <div
        class={cx(
          "flex shrink-0 items-baseline justify-between bg-sunken border-t border-line",
          isMobile ? "px-3 py-[11px]" : "px-4 py-[10px]",
        )}
      >
        <span
          class={cx(
            "font-mono uppercase tracking-label text-ink-faint",
            isMobile ? "text-nano" : "text-micro",
          )}
        >
          {t("stock.footer.total_value")}
        </span>
        <span
          class={cx(
            "font-display font-semibold tabular-nums text-ink",
            isMobile ? "text-title" : "text-[19px]",
          )}
        >
          {formatCurrency(totalValue, data.currency)}
        </span>
      </div>

      {/* ── Pied de marque ───────────────────────────────── */}
      <div
        class={`flex shrink-0 justify-end border-t border-line py-[9px] ${
          isMobile ? "px-3" : "px-4"
        }`}
      >
        <CasysCredit compact={isMobile} />
      </div>
    </ViewerShell>
  );
}

/* ─── Column header helper ───────────────────────────────────────── */

function ColHeader(
  { label, align = "left", onClick, sorted = false, sortDir }: {
    label: string;
    align?: "left" | "right";
    onClick?: () => void;
    sorted?: boolean;
    sortDir?: "asc" | "desc";
  },
) {
  const ariaSortValue = onClick
    ? (sorted ? (sortDir === "asc" ? "ascending" : "descending") : "none")
    : undefined;
  return (
    <button
      type="button"
      class={cx(
        "inline-flex items-center font-mono text-micro uppercase tracking-label select-none bg-transparent border-0 p-0",
        align === "right" ? "justify-end" : "",
        onClick
          ? "cursor-pointer hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:rounded-sm"
          : "pointer-events-none",
        sorted ? "text-accent" : "text-ink-faint",
      )}
      onClick={onClick}
      aria-sort={ariaSortValue}
      disabled={!onClick}
    >
      {label}
      {sorted && sortDir && (
        <svg
          width="7"
          height="5"
          viewBox="0 0 7 5"
          class="ml-1 text-accent"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          {sortDir === "asc"
            ? <path d="M1 1L4 4L7 1" />
            : <path d="M1 4L4 1L7 4" />}
        </svg>
      )}
    </button>
  );
}
