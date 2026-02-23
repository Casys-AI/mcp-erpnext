/**
 * Order Pipeline Viewer — ERPNext Sales Order Kanban
 *
 * Displays sales orders grouped by workflow status as kanban columns.
 * Shows count, total amount, and individual order cards per column.
 *
 * Data shape: OrderPipelineData (returned by erpnext_order_pipeline tool)
 */

import { useState, useEffect, CSSProperties } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles, formatCurrency } from "~/shared/theme";
import { ErpNextBrandHeader } from "~/shared/ErpNextBrand";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Order Pipeline", version: "1.0.0" });
let appConnected = false;

// ============================================================================
// Types
// ============================================================================

interface OrderCard {
  name: string;
  customer: string;
  amount: number;
  date: string;
  delivery_date?: string;
}

interface PipelineColumn {
  status: string;
  label: string;
  count: number;
  total: number;
  color: string;
  orders: OrderCard[];
}

interface OrderPipelineData {
  title: string;
  currency?: string;
  generatedAt?: string;
  columns: PipelineColumn[];
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
// Order Card
// ============================================================================

function OrderItemCard({ order, accentColor, currency }: { order: OrderCard; accentColor: string; currency?: string }) {
  const cardStyle: CSSProperties = {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    cursor: "default",
    transition: "border-color 0.15s",
  };

  const nameStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    fontFamily: fonts.mono,
    color: accentColor,
    letterSpacing: "0.02em",
  };

  const customerStyle: CSSProperties = {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const amountStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: colors.text.primary,
    fontFamily: fonts.mono,
  };

  const dateStyle: CSSProperties = {
    fontSize: 10,
    color: colors.text.faint,
  };

  return (
    <div style={cardStyle}>
      <div style={nameStyle}>{order.name}</div>
      <div style={customerStyle} title={order.customer}>{order.customer}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 }}>
        <div style={amountStyle}>{formatCurrency(order.amount, currency ?? "USD")}</div>
        <div style={dateStyle}>{order.date}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Column
// ============================================================================

function KanbanColumn({ col, currency }: { col: PipelineColumn; currency?: string }) {
  const [expanded, setExpanded] = useState(true);

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 6,
    background: colors.bg.surface,
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    userSelect: "none",
  };

  const dotStyle: CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: col.color,
    flexShrink: 0,
  };

  const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text.primary,
    flex: 1,
  };

  const badgeStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: fonts.mono,
    color: col.color,
    background: `${col.color}20`,
    padding: "2px 7px",
    borderRadius: 10,
  };

  const totalStyle: CSSProperties = {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.text.muted,
  };

  const columnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 200,
    flex: "1 1 200px",
  };

  return (
    <div style={columnStyle}>
      <div style={headerStyle} onClick={() => setExpanded((e) => !e)}>
        <div style={dotStyle} />
        <div style={labelStyle}>{col.label}</div>
        <div style={badgeStyle}>{col.count}</div>
        <div style={totalStyle}>{formatCurrency(col.total, currency ?? "USD")}</div>
        <div style={{ fontSize: 10, color: colors.text.faint }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {col.orders.map((order) => (
            <OrderItemCard key={order.name} order={order} accentColor={col.color} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function PipelineContent({ data }: { data: OrderPipelineData }) {
  const wrapStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    fontFamily: fonts.sans,
    background: colors.bg.root,
  };

  const bodyStyle: CSSProperties = {
    flex: 1,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const titleRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const titleStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: colors.text.secondary,
  };

  const summaryStyle: CSSProperties = {
    fontSize: 10,
    color: colors.text.faint,
  };

  const totalOrders = data.columns.reduce((s, c) => s + c.count, 0);
  const totalValue = data.columns.reduce((s, c) => s + c.total, 0);

  const timestamp = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })
    : null;

  return (
    <div style={wrapStyle}>
      <ErpNextBrandHeader />
      <div style={bodyStyle}>
        <div style={titleRowStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={titleStyle}>{data.title}</div>
            <div style={summaryStyle}>
              {totalOrders} orders · {formatCurrency(totalValue, data.currency ?? "USD")} total
              {timestamp && <span style={{ marginLeft: 8 }}>· {timestamp}</span>}
            </div>
          </div>
        </div>

        {data.columns.length === 0 ? (
          <div style={{ textAlign: "center", color: colors.text.muted, fontSize: 13, padding: "32px 0" }}>
            No orders found
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            {data.columns.map((col) => (
              <KanbanColumn key={col.status} col={col} currency={data.currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderPipelineViewer() {
  const [data, setData] = useState<OrderPipelineData | null>(null);
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

  if (loading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: colors.text.muted, fontSize: 13, fontFamily: fonts.sans }}>
        No pipeline data — run <code style={{ fontFamily: fonts.mono, fontSize: 11 }}>erpnext_order_pipeline</code>
      </div>
    );
  }

  return <PipelineContent data={data} />;
}
