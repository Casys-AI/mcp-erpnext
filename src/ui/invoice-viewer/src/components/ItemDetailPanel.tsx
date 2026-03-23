/** Inline panel showing item details + stock when clicking an invoice line */

import { useState, useEffect } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { InfoField } from "~/shared/InfoField";
import { ActionButton } from "~/shared/ActionButton";
import { extractToolResultText } from "~/shared/refresh";

const TOOL_CALL_TIMEOUT_MS = 10_000;

export function ItemDetailPanel({ app, itemCode, onClose }: {
  app: App;
  itemCode: string;
  onClose: () => void;
}) {
  const [itemData, setItemData] = useState<Record<string, unknown> | null>(null);
  const [stockData, setStockData] = useState<Array<Record<string, unknown>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [itemResult, stockResult] = await Promise.all([
          app.callServerTool({ name: "erpnext_item_get", arguments: { name: itemCode } }, { timeout: TOOL_CALL_TIMEOUT_MS }),
          app.callServerTool({ name: "erpnext_stock_balance", arguments: { item_code: itemCode } }, { timeout: TOOL_CALL_TIMEOUT_MS }),
        ]);
        if (cancelled) return;

        if (!itemResult.isError) {
          const text = extractToolResultText(itemResult);
          if (text) { const parsed = JSON.parse(text); setItemData(parsed.data ?? parsed); }
        }

        if (!stockResult.isError) {
          const text = extractToolResultText(stockResult);
          if (text) { const parsed = JSON.parse(text); setStockData(parsed.data ?? []); }
        }

        if (itemResult.isError && stockResult.isError) {
          setError("Failed to load item details");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load item details");
      } finally {
        if (!cancelled) setLoading(false);
      }
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
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>{itemCode}</span>
        <button onClick={onClose} style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}>✕</button>
      </div>

      {error && <div style={{ fontSize: 11, color: colors.error, marginBottom: 8 }}>{error}</div>}

      {/* Item info */}
      {itemData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, marginBottom: 10 }}>
          {itemData.item_name && <InfoField label="Name" value={String(itemData.item_name)} />}
          {itemData.item_group && <InfoField label="Group" value={String(itemData.item_group)} />}
          {itemData.stock_uom && <InfoField label="UOM" value={String(itemData.stock_uom)} />}
          {itemData.standard_rate != null && <InfoField label="Std Rate" value={String(itemData.standard_rate)} bold />}
        </div>
      )}

      {/* Stock balance */}
      {stockData && stockData.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Stock</div>
          {stockData.slice(0, 5).map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${colors.borderSubtle}` }}>
              <span style={{ fontSize: 12, color: colors.text.secondary }}>{String(s.warehouse ?? "—")}</span>
              <span style={{ fontSize: 12, fontFamily: fonts.mono, fontWeight: 600, color: Number(s.actual_qty ?? 0) > 0 ? colors.success : colors.error }}>
                {String(s.actual_qty ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
        <ActionButton
          label="Full stock view"
          onClick={async () => {
            try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Show stock balance for item ${itemCode}` }] }); } catch {}
          }}
        />
        <ActionButton
          label="Item details"
          onClick={async () => {
            try { await app.sendMessage({ role: "user", content: [{ type: "text", text: `Show me the full details of Item ${itemCode}` }] }); } catch {}
          }}
        />
      </div>
    </div>
  );
}
