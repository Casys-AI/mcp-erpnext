/** @jsxImportSource preact */
/** Inline detail for a stock line — item facts, recent movements, navigation. */

import { useEffect, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { useT } from "~/shared/i18n-hook";
import { Button, cx, InfoRow, StateMessage } from "~/shared/ui";
import { extractToolResultText } from "~/shared/refresh";
import { fixtureItemDetail } from "../fixture.ts";
import type { StockItemDetail } from "../types.ts";

const TOOL_CALL_TIMEOUT_MS = 10_000;

export function StockDetailPanel({
  app,
  itemCode,
  warehouse,
  fixture,
  onClose,
}: {
  app: App;
  itemCode: string;
  warehouse: string;
  fixture: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const seeded = fixture ? fixtureItemDetail(itemCode) : null;
  const [itemData, setItemData] = useState<Record<string, unknown> | null>(
    seeded?.item ?? null,
  );
  const [movements, setMovements] = useState<Record<string, unknown>[] | null>(
    seeded?.movements ?? null,
  );
  const [loading, setLoading] = useState(!fixture);

  useEffect(() => {
    if (fixture) {
      const next = fixtureItemDetail(itemCode);
      setItemData(next.item);
      setMovements(next.movements);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [itemRes, moveRes] = await Promise.all([
          app.callServerTool(
            { name: "erpnext_item_get", arguments: { name: itemCode } },
            { timeout: TOOL_CALL_TIMEOUT_MS },
          ),
          app.callServerTool(
            {
              name: "erpnext_stock_entry_list",
              arguments: { limit: 5, item_code: itemCode },
            },
            { timeout: TOOL_CALL_TIMEOUT_MS },
          ),
        ]);
        if (cancelled) return;
        if (!itemRes.isError) {
          const t = extractToolResultText(itemRes);
          if (t) {
            const p = JSON.parse(t) as StockItemDetail["item"] & {
              data?: Record<string, unknown>;
            };
            setItemData(p.data ?? p);
          }
        }
        if (!moveRes.isError) {
          const t = extractToolResultText(moveRes);
          if (t) {
            const p = JSON.parse(t) as { data?: Record<string, unknown>[] };
            setMovements(p.data ?? []);
          }
        }
      } catch {
        // Hosts without the item/movement tools keep the panel empty.
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [app, fixture, itemCode]);

  async function navigate(message: string) {
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {
      // Hosts without sendMessage (Inspector) ignore this.
    }
  }

  const facts = itemData
    ? [
      itemData.item_name != null
        ? {
          id: "name",
          label: t("stock.detail.label.name"),
          value: String(itemData.item_name),
        }
        : null,
      itemData.item_group != null
        ? {
          id: "group",
          label: t("stock.detail.label.group"),
          value: String(itemData.item_group),
        }
        : null,
      itemData.stock_uom != null
        ? {
          id: "uom",
          label: t("stock.detail.label.uom"),
          value: String(itemData.stock_uom),
        }
        : null,
      itemData.standard_rate != null
        ? {
          id: "rate",
          label: t("stock.detail.label.rate"),
          value: String(itemData.standard_rate),
        }
        : null,
    ].filter((item): item is { id: string; label: string; value: string } =>
      item != null
    )
    : [];

  const recent = (movements ?? []).slice(0, 4);

  return (
    <div class="border-b border-line bg-sunken">
      {/* Panel header */}
      <div class="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
        <div class="flex min-w-0 items-baseline gap-2">
          <span class="font-mono text-cell font-medium text-ink truncate">
            {itemCode}
          </span>
          {warehouse && (
            <span class="font-mono text-chip text-ink-faint shrink-0">
              {warehouse}
            </span>
          )}
        </div>
        <Button
          variant="quiet"
          class="shrink-0 py-1 px-2 text-chip"
          onClick={onClose}
        >
          {t("common.close")}
        </Button>
      </div>

      {
        /*
        Deux colonnes bornées, pas deux moitiés.
        `grid-cols-2` partage la largeur disponible : sur un panneau large,
        chaque moitié fait 400 px et les paires clé/valeur s'écartent aux
        extrémités — l'œil doit alors relier deux colonnes sans rapport.
        On borne chaque colonne et on laisse le reste en blanc.
      */
      }
      <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,300px))] gap-x-10 px-4 pt-3 pb-3.5">
        {loading && (
          <div class="col-span-full">
            <StateMessage>{t("stock.detail.loading")}</StateMessage>
          </div>
        )}

        {/* Facts */}
        {facts.length > 0 && (
          <div class="flex flex-col gap-1 pb-3">
            {facts.map((f) => (
              <InfoRow key={f.id} label={f.label} mono>
                {f.value}
              </InfoRow>
            ))}
          </div>
        )}

        {/* mouvements récents */}
        {recent.length > 0 && (
          <div class="pb-3">
            <span class="font-mono text-micro uppercase tracking-label text-ink-faint block pb-1.5">
              {t("stock.detail.recent_movements")}
            </span>
            <div class="flex flex-col divide-y divide-line-soft">
              {recent.map((mv, i) => (
                <div
                  key={String(mv.name ?? i)}
                  class="flex items-baseline justify-between gap-2 py-1.5"
                >
                  <span class="font-mono text-chip text-ink-2 truncate">
                    {String(mv.stock_entry_type ?? mv.name ?? "—")}
                  </span>
                  <span class="font-mono text-chip text-ink-muted shrink-0">
                    {String(mv.posting_date ?? "—")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {
          /*
          La rangée d'actions traverse la grille : bornée comme une colonne
          elle plafonnerait à 300 px et les trois boutons passeraient à la
          ligne alors que la largeur est là.
        */
        }
        <div
          class={cx(
            "col-span-full flex flex-wrap gap-1.5",
            facts.length > 0 || recent.length > 0 ? "pt-1" : "",
          )}
        >
          <Button
            variant="secondary"
            class="text-chip py-1"
            onClick={() =>
              void navigate(t("stock.nav.chart.message", { itemCode }))}
          >
            {t("stock.detail.action.chart")}
          </Button>
          <Button
            variant="secondary"
            class="text-chip py-1"
            onClick={() =>
              void navigate(t("stock.nav.details.message", { itemCode }))}
          >
            {t("stock.detail.action.item")}
          </Button>
          <Button
            variant="secondary"
            class="text-chip py-1"
            onClick={() =>
              void navigate(t("stock.nav.entries.message", { itemCode }))}
          >
            {t("stock.detail.action.entries")}
          </Button>
        </div>
      </div>
    </div>
  );
}
