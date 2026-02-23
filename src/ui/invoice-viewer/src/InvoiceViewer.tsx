/**
 * Invoice Viewer — Sales/Purchase Invoice display
 *
 * Renders an ERPNext invoice with header, line items table,
 * tax summary, and payment status badge.
 *
 * @module lib/erpnext/src/ui/invoice-viewer
 */

import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader, ErpNextBrandFooter } from "~/shared/ErpNextBrand";
import { CSSProperties } from "react";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Invoice Viewer", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Types
// ============================================================================

interface InvoiceItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  name: string;
  customer?: string;
  supplier?: string;
  posting_date: string;
  due_date?: string;
  status: string;
  grand_total: number;
  net_total?: number;
  total_taxes_and_charges?: number;
  outstanding_amount?: number;
  currency?: string;
  items?: InvoiceItem[];
}

// ============================================================================
// Status Badge
// ============================================================================

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Paid: { color: colors.success, bg: colors.successDim },
  Submitted: { color: colors.info, bg: colors.infoDim },
  Draft: { color: colors.text.muted, bg: colors.bg.elevated },
  Cancelled: { color: colors.error, bg: colors.errorDim },
  Overdue: { color: colors.error, bg: colors.errorDim },
  Unpaid: { color: colors.warning, bg: colors.warningDim },
  "Partly Paid": { color: colors.warning, bg: colors.warningDim },
  "Return": { color: colors.text.muted, bg: colors.bg.elevated },
};

function StatusBadge({ status }: { status: string }) {
  const scheme = STATUS_COLORS[status] ?? { color: colors.text.secondary, bg: colors.bg.elevated };
  return (
    <span style={styles.badge(scheme.color, scheme.bg)}>
      {status}
    </span>
  );
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
// Empty State (invoice-specific)
// ============================================================================

function InvoiceEmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "48px 24px", color: colors.text.muted, gap: 16,
    }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.35 }}>
        <rect x="12" y="6" width="32" height="44" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M20 16h16M20 22h12M20 28h14M20 34h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <circle cx="40" cy="42" r="10" fill="#08080a" stroke="currentColor" strokeWidth="2" />
        <path d="M37 42h6M40 39v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
      <div style={{ fontSize: 13, textAlign: "center" }}>
        No invoice data
        <div style={{ fontSize: 11, color: colors.text.faint, marginTop: 4 }}>
          Run an ERPNext invoice tool to display results here
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceViewer() {
  const [data, setData] = useState<InvoiceData | null>(null);
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
          <InvoiceEmptyState />
        ) : (
          <InvoiceContent data={data} />
        )}
      </div>
      <ErpNextBrandFooter />
    </div>
  );
}

function InvoiceContent({ data }: { data: InvoiceData }) {
  const ccy = data.currency ?? "USD";
  const party = data.customer ?? data.supplier ?? "—";
  const isCustomer = !!data.customer;
  const outstanding = data.outstanding_amount ?? 0;
  const isPaid = outstanding <= 0;
  const items = data.items ?? [];
  const netTotal = data.net_total ?? items.reduce((s, i) => s + i.amount, 0);
  const taxes = data.total_taxes_and_charges ?? (data.grand_total - netTotal);

  return (
    <div style={{ padding: 16, fontFamily: fonts.sans, maxWidth: 720 }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        flexWrap: "wrap", gap: 12, marginBottom: 20,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: colors.text.muted,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
          }}>
            {isCustomer ? "Sales Invoice" : "Purchase Invoice"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.mono }}>
            {data.name}
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {/* Info Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12, marginBottom: 20,
      }}>
        <InfoCard label={isCustomer ? "Customer" : "Supplier"} value={party} />
        <InfoCard label="Date" value={data.posting_date} />
        {data.due_date && <InfoCard label="Due Date" value={data.due_date} />}
        <InfoCard
          label="Outstanding"
          value={formatCurrency(outstanding, ccy)}
          valueColor={isPaid ? colors.success : colors.error}
        />
      </div>

      {/* Items Table */}
      {items.length > 0 && (
        <div style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 8, overflow: "hidden", marginBottom: 16,
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: colors.bg.surface }}>
                <th style={{ ...TH, width: "35%" }}>Item</th>
                <th style={{ ...TH, textAlign: "right", width: "15%" }}>Qty</th>
                <th style={{ ...TH, textAlign: "right", width: "25%" }}>Rate</th>
                <th style={{ ...TH, textAlign: "right", width: "25%" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: idx < items.length - 1 ? `1px solid ${colors.borderSubtle}` : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bg.hover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td style={TD}>
                    <div style={{ fontWeight: 500, color: colors.text.primary }}>{item.item_name ?? item.item_code}</div>
                    {item.item_name && (
                      <div style={{ fontSize: 11, color: colors.text.faint, fontFamily: fonts.mono }}>{item.item_code}</div>
                    )}
                  </td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: fonts.mono }}>{item.qty}</td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: fonts.mono, color: colors.text.secondary }}>
                    {formatCurrency(item.rate, ccy)}
                  </td>
                  <td style={{ ...TD, textAlign: "right", fontFamily: fonts.mono, fontWeight: 500 }}>
                    {formatCurrency(item.amount, ccy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginBottom: 16,
      }}>
        <TotalRow label="Subtotal" value={formatCurrency(netTotal, ccy)} />
        {taxes !== 0 && <TotalRow label="Taxes" value={formatCurrency(taxes, ccy)} />}
        <div style={{ width: 220, height: 1, background: colors.border, margin: "4px 0" }} />
        <TotalRow label="Grand Total" value={formatCurrency(data.grand_total, ccy)} bold />
      </div>

      {/* Payment Status Bar */}
      <div style={{
        ...styles.card,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: isPaid ? colors.successDim : colors.errorDim,
        borderColor: isPaid ? colors.success + "30" : colors.error + "30",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isPaid ? colors.success : colors.error,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: isPaid ? colors.success : colors.error }}>
            {isPaid ? "Paid" : "Outstanding"}
          </span>
        </div>
        {!isPaid && (
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: fonts.mono, color: colors.error }}>
            {formatCurrency(outstanding, ccy)}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function InfoCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ ...styles.card, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: colors.text.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: valueColor ?? colors.text.primary, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", width: 220 }}>
      <span style={{ fontSize: 13, color: bold ? colors.text.primary : colors.text.secondary, fontWeight: bold ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontFamily: fonts.mono, fontWeight: bold ? 700 : 500, color: bold ? colors.accent : colors.text.primary }}>
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Style constants
// ============================================================================

const TH: CSSProperties = {
  ...styles.tableHeader,
  background: colors.bg.surface,
};

const TD: CSSProperties = {
  ...styles.tableCell,
};
