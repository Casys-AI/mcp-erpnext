/**
 * Stock Viewer — Stock balance by item/warehouse
 *
 * Displays stock levels with color coding for low/out-of-stock items.
 * Sortable columns and total stock value footer.
 *
 * @module lib/erpnext/src/ui/stock-viewer
 */

import { useState, useEffect, useMemo, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader, ErpNextBrandFooter } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Stock Viewer", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Types
// ============================================================================

interface StockEntry {
  item_code: string;
  warehouse: string;
  actual_qty: number;
  reserved_qty?: number;
  projected_qty?: number;
  valuation_rate?: number;
  stock_value?: number;
}

interface StockData {
  count: number;
  data: StockEntry[];
}

type SortKey = keyof StockEntry;
type SortDir = "asc" | "desc";

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: i === 1 ? 32 : 20,
              width: i === 1 ? "40%" : `${60 + i * 8}%`,
            }}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 36, marginBottom: 2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function StockEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16,
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        <rect x="8" y="20" width="16" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="28" y="14" width="16" height="30" rx="2" stroke="currentColor" strokeWidth="2" />
        <rect x="18" y="28" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="#08080a" />
        <path d="M14 32h4M34 26h4M24 34h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No stock data
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Run a stock balance query to see inventory levels
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Quantity Badge
// ============================================================================

function QtyBadge({ qty }: { qty: number }) {
  let color: string;
  let bg: string;
  if (qty <= 0) {
    color = colors.error;
    bg = colors.errorDim;
  } else if (qty < 10) {
    color = colors.warning;
    bg = colors.warningDim;
  } else {
    color = colors.success;
    bg = colors.successDim;
  }
  return (
    <span style={{
      ...styles.badge(color, bg),
      fontFamily: fonts.mono,
      minWidth: 48,
      justifyContent: "center",
    }}>
      {formatNumber(qty, 0)}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function StockViewer() {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    app.connect().then(() => { appConnected = true; }).catch(() => {});

    app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
      setLoading(false);
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text) {
        try { setData(JSON.parse(text)); } catch (e) { console.error("Parse error:", e); }
      }
    };

    app.ontoolinputpartial = () => setLoading(true);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <ErpNextBrandHeader />
      <div style={{ flex: 1 }}>
        {loading ? (
          <LoadingSkeleton />
        ) : !data ? (
          <StockEmptyState />
        ) : (
          <StockContent data={data} />
        )}
      </div>
      <ErpNextBrandFooter />
    </div>
  );
}

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; width?: string }[] = [
  { key: "item_code", label: "Item Code", align: "left", width: "22%" },
  { key: "warehouse", label: "Warehouse", align: "left", width: "22%" },
  { key: "actual_qty", label: "Actual Qty", align: "right", width: "12%" },
  { key: "reserved_qty", label: "Reserved", align: "right", width: "11%" },
  { key: "projected_qty", label: "Projected", align: "right", width: "11%" },
  { key: "valuation_rate", label: "Rate", align: "right", width: "11%" },
  { key: "stock_value", label: "Value", align: "right", width: "11%" },
];

function StockContent({ data }: { data: StockData }) {
  const [sortKey, setSortKey] = useState<SortKey>("item_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return data.data;
    const q = filter.toLowerCase();
    return data.data.filter((e) =>
      e.item_code.toLowerCase().includes(q) ||
      e.warehouse.toLowerCase().includes(q)
    );
  }, [data.data, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalValue = useMemo(() =>
    sorted.reduce((s, e) => s + (e.stock_value ?? 0), 0),
    [sorted]
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: fonts.sans }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>Stock Balance</div>
          <div style={{ fontSize: 12, color: colors.text.muted }}>
            {sorted.length} entries{filter ? ` (filtered from ${data.count})` : ""}
          </div>
        </div>
        <input
          type="text"
          placeholder="Filter items / warehouses..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ ...styles.input, maxWidth: 260 }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.accent; }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.border; }}
        />
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      ...styles.tableHeader,
                      textAlign: col.align,
                      width: col.width,
                      color: sortKey === col.key ? colors.accent : colors.text.muted,
                      background: colors.bg.surface,
                    }}
                  >
                    {col.label}
                    <span style={{ marginLeft: 4, opacity: sortKey === col.key ? 1 : 0.3, fontSize: 10 }}>
                      {sortKey === col.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u21C5"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ ...styles.tableCell, textAlign: "center", color: colors.text.muted, padding: 32 }}>
                    No matching entries
                  </td>
                </tr>
              ) : sorted.map((entry, idx) => (
                <tr
                  key={`${entry.item_code}-${entry.warehouse}-${idx}`}
                  style={{ transition: "background 0.1s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={{ ...styles.tableCell, fontWeight: 500 }}>{entry.item_code}</td>
                  <td style={{ ...styles.tableCell, color: colors.text.secondary }}>{entry.warehouse}</td>
                  <td style={{ ...styles.tableCell, textAlign: "right" }}>
                    <QtyBadge qty={entry.actual_qty} />
                  </td>
                  <td style={numCell}>{entry.reserved_qty != null ? formatNumber(entry.reserved_qty, 0) : "—"}</td>
                  <td style={numCell}>{entry.projected_qty != null ? formatNumber(entry.projected_qty, 0) : "—"}</td>
                  <td style={numCell}>{entry.valuation_rate != null ? formatNumber(entry.valuation_rate) : "—"}</td>
                  <td style={{ ...numCell, fontWeight: 500, color: colors.text.primary }}>
                    {entry.stock_value != null ? formatCurrency(entry.stock_value) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer total */}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center",
        marginTop: 12, gap: 12, padding: "8px 0",
      }}>
        <span style={{ fontSize: 12, color: colors.text.muted }}>Total Stock Value</span>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.mono, color: colors.accent }}>
          {formatCurrency(totalValue)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Style helpers
// ============================================================================

const numCell: CSSProperties = {
  ...styles.tableCell,
  textAlign: "right",
  fontFamily: fonts.mono,
  fontSize: 12,
  color: colors.text.secondary,
};
