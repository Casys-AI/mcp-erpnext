/** @jsxImportSource preact */
import { useEffect, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { Button, cx, StateMessage } from "~/shared/ui";
import { extractToolResultText } from "~/shared/refresh";
import { useT } from "~/shared/i18n-hook";
import { ITEM_FIXTURES } from "../fixture.ts";
import type { ItemRecord, StockRow } from "../types.ts";

const TOOL_CALL_TIMEOUT_MS = 10_000;

export function ItemDetailPanel({
  app,
  itemCode,
  onClose,
  fixture,
  lineIndex,
  lineCount,
  taxRate,
  availableQty,
  lineQty,
}: {
  app: App;
  itemCode: string;
  onClose: () => void;
  fixture?: boolean;
  /** Position de la ligne dans la facture (0-based). */
  lineIndex: number;
  /** Nombre total de lignes dans la facture. */
  lineCount: number;
  /** Taux de TVA optionnel fourni par le parent (override). */
  taxRate?: number;
  /** Qté disponible optionnelle fournie par le parent (override). */
  availableQty?: number;
  /** Qté facturée — sert à colorier dispo. en text-warn si insuffisante. */
  lineQty?: number;
}) {
  const t = useT();

  const [itemData, setItemData] = useState<ItemRecord | null>(null);
  const [stockData, setStockData] = useState<StockRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixture) {
      const mock = ITEM_FIXTURES[itemCode];
      if (mock) {
        setItemData(mock.item);
        setStockData(mock.stock);
      } else {
        setError(t("invoice.item.error.load_failed"));
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [itemResult, stockResult] = await Promise.all([
          app.callServerTool({
            name: "erpnext_item_get",
            arguments: { name: itemCode },
          }, { timeout: TOOL_CALL_TIMEOUT_MS }),
          app.callServerTool({
            name: "erpnext_stock_balance",
            arguments: { item_code: itemCode },
          }, { timeout: TOOL_CALL_TIMEOUT_MS }),
        ]);
        if (cancelled) return;

        if (!itemResult.isError) {
          const text = extractToolResultText(itemResult);
          if (text) {
            const parsed = JSON.parse(text);
            setItemData(parsed.data ?? parsed);
          }
        }

        if (!stockResult.isError) {
          const text = extractToolResultText(stockResult);
          if (text) {
            const parsed = JSON.parse(text);
            setStockData(parsed.data ?? []);
          }
        }

        if (itemResult.isError && stockResult.isError) {
          setError(t("invoice.item.error.load_failed"));
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : t("invoice.item.error.load_failed"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemCode, fixture]);

  async function send(message: string) {
    if (fixture) return;
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {
      // Hosts without sendMessage (Inspector) ignore this.
    }
  }

  /* ── Valeurs dérivées pour la grille 4 cellules ───────────────── */

  const uomVal = itemData?.stock_uom != null
    ? String(itemData.stock_uom)
    : undefined;
  const warehouseVal = stockData?.[0]?.warehouse != null
    ? String(stockData[0].warehouse)
    : undefined;

  // Taux TVA : prop override ou champ item_tax_rate issu de erpnext_item_get.
  const tvaVal: number | undefined = taxRate ??
    (itemData?.item_tax_rate != null
      ? Number(itemData.item_tax_rate)
      : undefined);

  // Stock dispo : prop override ou somme des actual_qty sur tous les entrepôts.
  const dispoVal: number | undefined = availableQty ??
    (stockData != null
      ? stockData.reduce((sum, row) => sum + Number(row.actual_qty ?? 0), 0)
      : undefined);

  // Colorisation warn si le stock disponible est inférieur à la qté facturée.
  const warnDispo = dispoVal !== undefined && lineQty !== undefined &&
    dispoVal < lineQty;

  return (
    <div class="border-t border-line-soft bg-sunken">
      {/* ── Header : code + position + bouton Fermer ── */}
      <div class="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <div class="flex items-baseline gap-2">
          <span class="truncate font-mono text-cell font-medium text-ink">
            {itemCode}
          </span>
          <span class="font-mono text-chip text-ink-faint">
            {t("invoice.item.position", {
              n: lineIndex + 1,
              total: lineCount,
            })}
          </span>
        </div>
        <Button
          variant="quiet"
          class="text-chip py-0.5 px-1.5"
          onClick={onClose}
          aria-label={t("invoice.item.close.aria_label")}
        >
          {t("common.close")}
        </Button>
      </div>

      {/* ── États de chargement / erreur (vide absolu) ── */}
      {loading && <StateMessage>{t("invoice.item.loading")}</StateMessage>}
      {error && <StateMessage tone="bad">{error}</StateMessage>}

      {/* ── Corps : grille 4 cellules compactes ── */}
      {!loading && !error && (
        <div class="grid grid-cols-4 gap-x-5 px-4 py-3">
          {/* unité */}
          <div class="flex flex-col gap-1">
            <span class="font-mono text-micro uppercase tracking-chip text-ink-faint">
              {t("invoice.item.uom")}
            </span>
            <span class="font-mono text-data text-ink-2">
              {uomVal ?? "—"}
            </span>
          </div>

          {/* entrepôt principal */}
          <div class="flex flex-col gap-1">
            <span class="font-mono text-micro uppercase tracking-chip text-ink-faint">
              {t("invoice.item.warehouse")}
            </span>
            <span class="font-mono text-data text-ink-2">
              {warehouseVal ?? "—"}
            </span>
          </div>

          {/* tva */}
          <div class="flex flex-col gap-1">
            <span class="font-mono text-micro uppercase tracking-chip text-ink-faint">
              {t("invoice.item.vat")}
            </span>
            <span class="font-mono text-data text-ink-2">
              {tvaVal !== undefined ? `${tvaVal} %` : "—"}
            </span>
          </div>

          {/* dispo. — coloré en text-warn si insuffisant vs qté facturée */}
          <div class="flex flex-col gap-1">
            <span class="font-mono text-micro uppercase tracking-chip text-ink-faint">
              {t("invoice.item.available")}
            </span>
            <span
              class={cx(
                "font-mono text-data",
                warnDispo ? "text-warn" : "text-ink-2",
              )}
            >
              {dispoVal !== undefined ? String(dispoVal) : "—"}
            </span>
          </div>
        </div>
      )}

      {/* ── Boutons d'action ── */}
      <div class="flex flex-wrap gap-1.5 px-4 pb-3">
        {
          /*
          variant='accent' utilise bg-accent/14 (fond translucide), conforme
          au style soft-accent de la maquette (rgba(62,193,207,0.14)).
        */
        }
        <Button
          variant="accent"
          disabled={fixture}
          title={fixture
            ? t("invoice.preview.title")
            : t("invoice.item.btn.stock.title")}
          onClick={() =>
            void send(t("invoice.item.stock.message", { itemCode }))}
        >
          {t("invoice.item.btn.stock.label")}
        </Button>
        <Button
          variant="secondary"
          disabled={fixture}
          title={fixture
            ? t("invoice.preview.title")
            : t("invoice.item.btn.details.title")}
          onClick={() =>
            void send(t("invoice.item.details.message", { itemCode }))}
        >
          {t("invoice.item.btn.details.label")}
        </Button>
      </div>
    </div>
  );
}
