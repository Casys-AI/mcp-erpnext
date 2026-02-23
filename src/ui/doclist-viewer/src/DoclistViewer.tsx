/**
 * Doclist Viewer — Generic ERPNext DocType table
 *
 * Auto-detects columns from data, provides sorting, filtering,
 * pagination (20 per page), CSV export, and status badges.
 *
 * @module lib/erpnext/src/ui/doclist-viewer
 */

import { useState, useEffect, useMemo, useCallback, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatNumber } from "~/shared/theme";
import { ErpNextBrandHeader, ErpNextBrandFooter } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Doclist Viewer", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Types
// ============================================================================

interface DoclistData {
  count: number;
  doctype?: string;
  data: Record<string, unknown>[];
}

type SortDir = "asc" | "desc";

// ============================================================================
// Status badge
// ============================================================================

const DOC_STATUS: Record<string, { color: string; bg: string }> = {
  Submitted: { color: colors.success, bg: colors.successDim },
  Completed: { color: colors.success, bg: colors.successDim },
  Paid: { color: colors.success, bg: colors.successDim },
  Active: { color: colors.success, bg: colors.successDim },
  Enabled: { color: colors.success, bg: colors.successDim },
  Draft: { color: colors.text.muted, bg: colors.bg.elevated },
  Pending: { color: colors.warning, bg: colors.warningDim },
  Open: { color: colors.warning, bg: colors.warningDim },
  "Partly Paid": { color: colors.warning, bg: colors.warningDim },
  Cancelled: { color: colors.error, bg: colors.errorDim },
  Overdue: { color: colors.error, bg: colors.errorDim },
  Closed: { color: colors.text.faint, bg: colors.bg.elevated },
  Disabled: { color: colors.text.faint, bg: colors.bg.elevated },
};

function StatusCell({ value }: { value: string }) {
  const scheme = DOC_STATUS[value];
  if (!scheme) return <span>{value}</span>;
  return <span style={styles.badge(scheme.color, scheme.bg)}>{value}</span>;
}

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

function DoclistEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16,
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        <rect x="8" y="8" width="40" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M8 18h40" stroke="currentColor" strokeWidth="2" />
        <path d="M20 8v40M36 8v40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <path d="M8 28h40M8 38h40" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No documents to display
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Query a DocType to see results in this table
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_FIELDS = new Set(["status", "docstatus", "workflow_state"]);
const HIDDEN_FIELDS = new Set(["doctype", "owner", "modified_by", "creation", "modified", "idx"]);

function isStatusField(key: string): boolean {
  return STATUS_FIELDS.has(key.toLowerCase());
}

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return formatNumber(value, value % 1 === 0 ? 0 : 2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportCsv(columns: string[], rows: Record<string, unknown>[], doctype?: string) {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((col) => {
      const v = formatCell(row[col]);
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  ).join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doctype ?? "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Main Component
// ============================================================================

export function DoclistViewer() {
  const [data, setData] = useState<DoclistData | null>(null);
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
          <DoclistEmptyState />
        ) : (
          <DoclistContent data={data} />
        )}
      </div>
      <ErpNextBrandFooter />
    </div>
  );
}

const PAGE_SIZE = 20;

function DoclistContent({ data }: { data: DoclistData }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);

  const rows = data.data ?? [];

  // Auto-detect visible columns
  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_FIELDS.has(key)) allKeys.add(key);
      }
    }
    // Sort: name first, then status, then alphabetical
    return Array.from(allKeys).sort((a, b) => {
      if (a === "name") return -1;
      if (b === "name") return 1;
      if (isStatusField(a)) return -1;
      if (isStatusField(b)) return 1;
      return a.localeCompare(b);
    });
  }, [rows]);

  // Filter
  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => formatCell(row[col]).toLowerCase().includes(q))
    );
  }, [rows, filter, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
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

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const handleFilter = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value);
    setPage(0);
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: fonts.sans }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text.primary }}>
            {data.doctype ?? "Documents"}
          </div>
          <div style={{ fontSize: 12, color: colors.text.muted }}>
            {sorted.length} of {data.count ?? rows.length} records
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search..."
            value={filter}
            onChange={handleFilter}
            style={{ ...styles.input, maxWidth: 200 }}
            onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.accent; }}
            onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = colors.border; }}
          />
          <button
            onClick={() => exportCsv(columns, sorted, data.doctype)}
            style={styles.button}
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

      {/* Table */}
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(600, columns.length * 120) }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    style={{
                      ...styles.tableHeader,
                      background: colors.bg.surface,
                      color: sortKey === col ? colors.accent : colors.text.muted,
                    }}
                  >
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
              ) : pageRows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{ transition: "background 0.1s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {columns.map((col) => {
                    const val = row[col];
                    const isNum = typeof val === "number";
                    const isStatus = isStatusField(col) && typeof val === "string";

                    return (
                      <td
                        key={col}
                        style={{
                          ...styles.tableCell,
                          ...(isNum ? { textAlign: "right", fontFamily: fonts.mono, fontSize: 12 } : {}),
                          ...(col === "name" ? { fontWeight: 500 } : {}),
                          maxWidth: 250,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        } as CSSProperties}
                      >
                        {isStatus ? <StatusCell value={val as string} /> : formatCell(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, color: colors.text.muted }}>
            Page {page + 1} of {totalPages}
          </div>
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

// ============================================================================
// Pagination Button
// ============================================================================

function PagBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.button,
        padding: "4px 10px",
        fontSize: 11,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onMouseEnter={(e) => { if (!disabled) { (e.currentTarget as HTMLElement).style.borderColor = colors.accent; } }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.border; }}
    >
      {label}
    </button>
  );
}
