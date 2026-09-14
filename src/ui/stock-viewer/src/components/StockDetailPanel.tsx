/** Inline detail panel for a stock line — shows item info, recent movements, and navigation */

import { useT } from "~/shared/i18n-hook";
import { useEffect, useState } from "react";
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
  const t = useT();
  const [itemData, setItemData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [movements, setMovements] = useState<Record<string, unknown>[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [itemRes, moveRes] = await Promise.all([
          app.callServerTool({
            name: "erpnext_item_get",
            arguments: { name: itemCode },
          }, { timeout: TOOL_CALL_TIMEOUT_MS }),
          app.callServerTool({
            name: "erpnext_stock_entry_list",
            arguments: { limit: 5, item_code: itemCode },
          }, { timeout: TOOL_CALL_TIMEOUT_MS }),
        ]);
        if (cancelled) return;
        if (!itemRes.isError) {
          const t = extractToolResultText(itemRes);
          if (t) {
            const p = JSON.parse(t);
            setItemData(p.data ?? p);
          }
        }
        if (!moveRes.isError) {
          const t = extractToolResultText(moveRes);
          if (t) {
            const p = JSON.parse(t);
            setMovements(p.data ?? []);
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemCode]);

  if (loading) {
    return (
      <div
        style={{
          padding: 16,
          background: colors.bg.surface,
          borderTop: `2px solid ${colors.accent}`,
        }}
      >
        {[1, 2].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 14, width: `${30 + i * 15}%`, marginBottom: 8 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        background: colors.bg.surface,
        borderTop: `2px solid ${colors.accent}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            dir="auto"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
              fontFamily: fonts.mono,
            }}
          >
            {itemCode}
          </span>
          <span dir="auto" style={{ fontSize: 11, color: colors.text.muted }}>
            {warehouse}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}
        >
          ✕
        </button>
      </div>

      {/* Item info */}
      {itemData && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {Boolean(itemData.item_name) && (
            <InfoField
              label={t("stable.stock.detail.name")}
              value={String(itemData.item_name)}
            />
          )}
          {Boolean(itemData.item_group) && (
            <InfoField
              label={t("stable.stock.detail.group")}
              value={String(itemData.item_group)}
            />
          )}
          {Boolean(itemData.stock_uom) && (
            <InfoField
              label={t("stable.stock.detail.uom")}
              value={String(itemData.stock_uom)}
            />
          )}
          {itemData.standard_rate != null && (
            <InfoField
              label={t("stable.stock.detail.std_rate")}
              value={String(itemData.standard_rate)}
              bold
            />
          )}
        </div>
      )}

      {/* Recent movements */}
      {movements && movements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10,
              color: colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            {t("stock.detail.recent_movements")}
          </div>
          {movements.slice(0, 4).map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: `1px solid ${colors.borderSubtle}`,
                fontSize: 12,
              }}
            >
              <span dir="auto" style={{ color: colors.text.secondary }}>
                {String(m.stock_entry_type ?? m.name ?? "—")}
              </span>
              <span
                style={{ fontFamily: fonts.mono, color: colors.text.primary }}
              >
                {String(m.posting_date ?? "—")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <ActionButton
          label={t("stock.detail.action.chart")}
          onClick={async () => {
            try {
              await app.sendMessage({
                role: "user",
                content: [{
                  type: "text",
                  text: t("stock.nav.chart.message", { itemCode }),
                }],
              });
            } catch {}
          }}
        />
        <ActionButton
          label={t("stable.stock.detail.item_details")}
          onClick={async () => {
            try {
              await app.sendMessage({
                role: "user",
                content: [{
                  type: "text",
                  text: t("stock.nav.details.message", { itemCode }),
                }],
              });
            } catch {}
          }}
        />
        <ActionButton
          label={t("stock.detail.action.entries")}
          onClick={async () => {
            try {
              await app.sendMessage({
                role: "user",
                content: [{
                  type: "text",
                  text: t("stock.nav.entries.message", { itemCode }),
                }],
              });
            } catch {}
          }}
        />
      </div>
    </div>
  );
}
