/** Inline detail panel for a stock line — shows item info, recent movements, and navigation */

import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { InfoField } from "~/shared/InfoField";
import { ActionButton } from "~/shared/ActionButton";
import { extractToolResultText } from "~/shared/refresh";

const TOOL_CALL_TIMEOUT_MS = 10_000;

export function StockDetailPanel({ app, itemCode, warehouse, onClose }: {
  app: App;
  itemCode: string;
  warehouse: string;
  onClose: () => void;
}) {
  const [itemData, setItemData] = useState<Record<string, unknown> | null>(null);
  const [movements, setMovements] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [itemRes, moveRes] = await Promise.all([
          app.callServerTool({ name: "erpnext_item_get", arguments: { name: itemCode } }, { timeout: TOOL_CALL_TIMEOUT_MS }),
          app.callServerTool({ name: "erpnext_stock_entry_list", arguments: { limit: 5, item_code: itemCode } }, { timeout: TOOL_CALL_TIMEOUT_MS }),
        ]);
        if (cancelled) return;
        if (!itemRes.isError) {
          const t = extractToolResultText(itemRes);
          if (t) { const p = JSON.parse(t); setItemData(p.data ?? p); }
        }
        if (!moveRes.isError) {
          const t = extractToolResultText(moveRes);
          if (t) { const p = JSON.parse(t); setMovements(p.data ?? []); }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemCode]);

  if (loading) return (
    <div style={{ padding: 16, background: colors.bg.surface, borderTop: `2px solid ${colors.accent}` }}>
      {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 14, width: `${30 + i * 15}%`, marginBottom: 8 }} />)}
    </div>
  );

  return (
    <div style={{ padding: 16, background: colors.bg.surface, borderTop: `2px solid ${colors.accent}` }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>{itemCode}</span>
          <span style={{ fontSize: 11, color: colors.text.muted }}>{warehouse}</span>
        </div>
        <button onClick={onClose} style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}>✕</button>
      </div>

      {/* Item info */}
      {itemData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, marginBottom: 10 }}>
          {itemData.item_name && <InfoField label="Name" value={String(itemData.item_name)} />}
          {itemData.item_group && <InfoField label="Group" value={String(itemData.item_group)} />}
          {itemData.stock_uom && <InfoField label="UOM" value={String(itemData.stock_uom)} />}
          {itemData.standard_rate != null && <InfoField label="Std Rate" value={String(itemData.standard_rate)} bold />}
        </div>
      )}

      {/* Recent movements */}
      {movements && movements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Recent Movements</div>
          {movements.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${colors.borderSubtle}`, fontSize: 12 }}>
              <span style={{ color: colors.text.secondary }}>{String(m.stock_entry_type ?? m.name ?? "—")}</span>
              <span style={{ fontFamily: fonts.mono, color: colors.text.primary }}>{String(m.posting_date ?? "—")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
        <ActionButton label="Stock chart"
          onClick={async () => {
            try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Show stock chart for item ${itemCode}` }] }); } catch {}
          }}
        />
        <ActionButton label="Item details"
          onClick={async () => {
            try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Show me the full details of Item ${itemCode}` }] }); } catch {}
          }}
        />
        <ActionButton label="Stock entries"
          onClick={async () => {
            try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Show stock entries for item ${itemCode}` }] }); } catch {}
          }}
        />
      </div>
    </div>
  );
}
