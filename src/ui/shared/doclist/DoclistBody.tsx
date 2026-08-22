/**
 * Le corps d'une liste, sans son chrome : chips, tableau, total, inspecteur,
 * pied de liste. Le viewer doclist le rend sous son en-tête et son fil ; une
 * autre vue le rend comme niveau « liste » de sa pile.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useRef, useState } from "preact/hooks";
import { useT } from "../i18n-hook";
import type { Jump } from "../jumps";
import { extractToolResultText } from "../refresh";
import { StateMessage, ToolButton, TotalRow } from "../ui";
import type { ViewerLayout } from "../useViewerLayout";
import { ChipFilters } from "./ChipFilters";
import { DoclistTable } from "./DoclistTable";
import { formatCell, getNestedValue } from "./helpers";
import { InlineDetailPanel } from "./InlineDetailPanel";
import { SearchRow } from "./SearchControl";
import type { DoclistData } from "./types";
import type { DoclistState, Row } from "./useDoclist";

const TOOL_CALL_TIMEOUT_MS = 10_000;

export function resolveRowId(
  row: Row,
  rowAction: DoclistData["_rowAction"],
  fallback: string,
): string {
  if (rowAction) {
    return String(getNestedValue(row, rowAction.idField) ?? fallback);
  }
  return String(row._id ?? row.name ?? fallback);
}

export function DoclistBody(
  {
    app,
    data,
    list,
    layout,
    fixture,
    error,
    subtitle,
    onError,
    onJump,
    onAsk,
    stale,
    onRefresh,
    onMutated,
  }: {
    app: App;
    data: DoclistData;
    list: DoclistState;
    layout: ViewerLayout;
    fixture: boolean;
    error?: string | null;
    /** Note de pied : « liées à SO-1043 ». */
    subtitle?: string;
    onError: (msg: string | null) => void;
    /** Présent quand l'hôte relaie les outils : les hints deviennent des sauts. */
    onJump?: (jump: Jump) => void;
    onAsk?: (message: string) => void;
    /** Une action plus bas a changé ce que cette liste montre. */
    stale?: { at: string; subject?: string };
    onRefresh?: () => void;
    /** Une action d'ici (valider, annuler) vient de changer `subject`. */
    onMutated?: (subject: string) => void;
  },
) {
  const t = useT();
  const narrow = layout !== "wide";
  const { rows, rowAction, expandedId } = list;
  type Expanded = { id: string | null; data: Row | null; loading: boolean };
  const [expanded, setExpandedState] = useState<Expanded>({
    id: null,
    data: null,
    loading: false,
  });
  const expandedRef = useRef<Expanded>(expanded);
  const setExpanded = (next: Expanded) => {
    expandedRef.current = next;
    setExpandedState(next);
  };
  const pendingRowIdRef = useRef<string | null>(null);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Le corps se démonte à chaque retour : le timer de relecture part avec lui.
  useEffect(() => () => clearTimeout(actionTimerRef.current), []);
  const hasLocalDetail = rows.length > 0 && rows[0]._detail != null;
  const isClickable = !!rowAction || hasLocalDetail;

  // La ligne active vit dans la pile ; son détail chargé reste local.
  useEffect(() => {
    if (expandedId === null) {
      // Fermer coupe la réponse en vol : elle n'aura plus de ligne où aller.
      pendingRowIdRef.current = null;
      setExpanded({ id: null, data: null, loading: false });
      return;
    }
    if (expandedRef.current.id === expandedId) return;
    const row = rows.find((r, i) =>
      resolveRowId(r, rowAction, String(i)) === expandedId
    );
    if (!row) return;
    if (fixture || (!rowAction && row._detail)) {
      setExpanded({
        id: expandedId,
        data: (row._detail as Row | undefined) ?? row,
        loading: false,
      });
      return;
    }
    if (!rowAction) return;
    setExpanded({ id: expandedId, data: null, loading: true });
    pendingRowIdRef.current = expandedId;
    void (async () => {
      try {
        const result = await app.callServerTool(
          {
            name: rowAction.toolName,
            arguments: {
              ...rowAction.extraArgs,
              [rowAction.argName]: expandedId,
            },
          },
          { timeout: TOOL_CALL_TIMEOUT_MS },
        );
        if (pendingRowIdRef.current !== expandedId) return;
        if (!result.isError) {
          const text = extractToolResultText(result);
          if (text) {
            const parsed = JSON.parse(text);
            setExpanded({
              id: expandedId,
              data: parsed.data ?? parsed,
              loading: false,
            });
            onError(null);
          } else {
            // Une réponse sans corps n'est pas un détail : on le dit, on ferme.
            onError(t("doclist.error.load_details"));
            list.setExpandedId(null);
          }
        } else {
          onError(t("doclist.error.load_details"));
          list.setExpandedId(null);
        }
      } catch (err) {
        if (pendingRowIdRef.current !== expandedId) return;
        onError(
          `${t("doclist.error.load_details")} — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        list.setExpandedId(null);
      } finally {
        if (pendingRowIdRef.current === expandedId) {
          setExpanded({ ...expandedRef.current, loading: false });
        }
      }
    })();
  }, [expandedId, rows, rowAction, fixture]);

  function onRowClick(row: Row) {
    const rowId = resolveRowId(row, rowAction, "");
    if (!rowId) return;
    list.setExpandedId(expandedId === rowId ? null : rowId);
  }

  async function handleDetailAction(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    if (fixture) return false;
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) return false;
      const currentId = expandedId;
      if (currentId) onMutated?.(currentId);
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = setTimeout(async () => {
        if (currentId && rowAction && pendingRowIdRef.current === currentId) {
          try {
            const r = await app.callServerTool({
              name: rowAction.toolName,
              arguments: {
                ...rowAction.extraArgs,
                [rowAction.argName]: currentId,
              },
            }, { timeout: TOOL_CALL_TIMEOUT_MS });
            if (pendingRowIdRef.current !== currentId) return;
            if (!r.isError) {
              const text = extractToolResultText(r);
              if (text) {
                const p = JSON.parse(text);
                setExpanded({
                  id: currentId,
                  data: p.data ?? p,
                  loading: false,
                });
              }
            }
          } catch { /* ignore */ }
        }
      }, 1500);
      return true;
    } catch {
      return false;
    }
  }

  const inspecting = expandedId !== null;
  return (
    <>
      {layout === "mobile" && list.searchOpen && (
        <SearchRow
          value={list.filter}
          onInput={list.setFilter}
          onClose={() => list.setSearchOpen(false)}
        />
      )}
      {layout !== "panel" && (
        <ChipFilters
          columns={list.filterableColumns}
          chipFilters={list.chipFilters}
          counts={list.chipCounts}
          total={rows.length}
          pill={layout === "mobile"}
          onFilterChange={list.setChipFilter}
        />
      )}
      {stale && (
        <div
          role="status"
          title={t("nav.stale_title")}
          class="flex shrink-0 items-center gap-2 border-b border-warn/20 bg-warn/8 px-4 py-[7px] font-mono text-[10.5px] text-warn"
        >
          <span aria-hidden="true" class="size-[5px] rounded-full bg-warn" />
          <span>{t("nav.stale_values", { at: stale.at })}</span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              class="ml-auto rounded-[3px] border border-warn/40 px-2 py-0.5 uppercase tracking-[0.08em] text-warn hover:bg-warn/12"
            >
              {t("nav.refresh")}
            </button>
          )}
        </div>
      )}
      {error && <StateMessage tone="bad">{error}</StateMessage>}
      <div
        class={`grid min-h-0 flex-1 ${
          inspecting && !narrow ? "grid-cols-[1fr_268px]" : "grid-cols-1"
        }`}
      >
        {!(inspecting && narrow) && (
          <div
            class={`flex min-h-0 flex-col ${
              inspecting && !narrow ? "border-r border-line" : ""
            }`}
          >
            <div class="scroll-slim min-h-0 flex-1 overflow-y-auto">
              <DoclistTable
                columns={list.tableColumns}
                rows={list.pageRows}
                rowId={(row, index) =>
                  resolveRowId(row, rowAction, String(index))}
                selectedId={expandedId}
                struckId={stale?.subject ?? null}
                sortKey={list.sortKey}
                sortDir={list.sortDir}
                onSort={list.handleSort}
                onSelect={isClickable ? onRowClick : undefined}
                layout={layout}
                amountKey={list.amountKey}
              />
            </div>
            {list.amountTotal !== null && (
              <TotalRow
                layout={layout}
                label={list.amountKey?.replace(/_/g, " ") ?? t("common.total")}
              >
                {formatCell(list.amountTotal)}
              </TotalRow>
            )}
            {/* Pied de liste : l'effectif, la note du niveau, la pagination. */}
            <div class="flex shrink-0 items-center gap-3 border-t border-line-soft bg-sunken px-4 py-[9px]">
              <span class="font-mono text-[10.5px] text-ink-faint">
                {t("nav.of", { n: list.sorted.length, total: rows.length })}
              </span>
              {subtitle && (
                <span class="font-mono text-[10.5px] text-ink-faint">
                  {subtitle}
                </span>
              )}
              <div class="flex-1" />
              {list.totalPages > 1 && (
                <span class="flex items-center gap-1.5">
                  <ToolButton
                    disabled={list.page === 0}
                    aria-label={t("common.pagination.prev")}
                    onClick={() => list.setPage(list.page - 1)}
                  >
                    ‹
                  </ToolButton>
                  <span class="font-mono text-meta text-ink-muted">
                    {list.page + 1} / {list.totalPages}
                  </span>
                  <ToolButton
                    disabled={list.page >= list.totalPages - 1}
                    aria-label={t("common.pagination.next")}
                    onClick={() => list.setPage(list.page + 1)}
                  >
                    ›
                  </ToolButton>
                </span>
              )}
            </div>
          </div>
        )}
        {inspecting && (
          <InlineDetailPanel
            app={app}
            data={expanded.data}
            loading={expanded.loading}
            doctype={data.doctype}
            sendMessageHints={data._sendMessageHints}
            fixture={fixture}
            layout={layout}
            onClose={() => list.setExpandedId(null)}
            onAction={handleDetailAction}
            onJump={onJump}
            onAsk={onAsk}
          />
        )}
      </div>
    </>
  );
}
