/**
 * Le corps d'une liste, sans son chrome : chips, tableau, détail accordéon,
 * total et pied de liste. Le viewer doclist le rend sous son en-tête et son
 * fil ; une autre vue le rend comme niveau « liste » de sa pile.
 */

import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  type InvoiceSelection,
  invoiceSelectionRef,
  SALES_INVOICE_DOCTYPE,
  SALES_INVOICE_GET,
} from "../document-follow.ts";
import type { DocumentChangeEvent } from "../document-events.ts";
import type { DocumentEnvelope } from "../document/types.ts";
import type {
  ContextInteractionTarget,
  DocumentContextController,
} from "../document/context-interaction.ts";
import type { LifecycleOutcome } from "../document/lifecycle-actions.ts";
import { interpretHostPurchaseInvoiceSubmit } from "../document/purchase-invoice.ts";
import { documentModelOf } from "../document/model.ts";
import { useT } from "../i18n-hook";
import type { Jump } from "../jumps";
import { documentChangeForTool, recordOf } from "../levels/bodies.ts";
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
import { canCallViewerTool, hasExplicitAvailableTool } from "../viewer-tools";
import { doclistDetailPanelId } from "./detail-panel.ts";
import { nearestScrollDelta } from "./scroll-nearest.ts";
import { doclistRowContextItem } from "./context-items.ts";
import {
  doclistFilteredSelectionOperation,
  doclistGroupMember,
  doclistHeaderSelection,
  doclistQueryFields,
  doclistQueryParent,
  extendDoclistRange,
  isDoclistResultComplete,
} from "./selection.ts";

const TOOL_CALL_TIMEOUT_MS = 10_000;
const CANONICAL_READBACK_DELAY_MS = 1_500;

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
    onMutationInvalidate,
    onMutationRefresh,
    onMutated,
    onDocumentChanged,
    context,
    contextView,
    contextKey,
    invoiceSelection,
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
    /** Invalide immédiatement une relecture partie avant la mutation. */
    onMutationInvalidate?: () => void;
    /** Relecture racine obligatoire après mutation, coalescée par le viewer. */
    onMutationRefresh?: () => void;
    /** Une action d'ici (valider, annuler) vient de changer `subject`. */
    onMutated?: (subject: string) => void;
    /** Changement canonique structuré, indépendant de son transport futur. */
    onDocumentChanged?: (event: DocumentChangeEvent) => void;
    context?: DocumentContextController;
    contextView?: string;
    /** Identité stable du niveau, distincte de son titre visible. */
    contextKey?: string;
    invoiceSelection?: InvoiceSelection;
  },
) {
  const t = useT();
  const { rows, pageRows, rowAction: payloadRowAction, expandedId } = list;
  const serverTools = app.getHostCapabilities()?.serverTools;
  const rowAction = payloadRowAction && canCallViewerTool(
      serverTools,
      data._availableTools,
      payloadRowAction.toolName,
    )
    ? payloadRowAction
    : undefined;
  type Expanded = {
    id: string | null;
    data: DocumentEnvelope | null;
    loading: boolean;
  };
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
  const activeRowIdRef = useRef(expandedId);
  activeRowIdRef.current = expandedId;
  const mountedRef = useRef(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingRowIdRef.current = null;
    };
  }, []);
  const [, setRouteRevision] = useState(0);
  useLayoutEffect(() => {
    if (!invoiceSelection) return;
    const update = () => setRouteRevision((revision) => revision + 1);
    const unsubscribe = invoiceSelection.subscribe(update);
    update();
    return unsubscribe;
  }, [invoiceSelection]);
  const cancelFollow = invoiceSelection?.cancelPending;
  useLayoutEffect(() => cancelFollow, [
    cancelFollow,
    data.doctype,
    data._availableTools,
    serverTools,
    rowAction,
    list.sorted,
    list.page,
    contextKey,
    contextView,
    expandedId,
  ]);
  const following = Boolean(
    invoiceSelection?.canFollow() && !fixture && serverTools &&
      data.doctype === SALES_INVOICE_DOCTYPE &&
      hasExplicitAvailableTool(data._availableTools, SALES_INVOICE_GET),
  );
  const listContextView = contextView ?? data._title ?? data.doctype ??
    "Document";
  const listContextKey = contextKey ?? listContextView;
  const selectionAnchor = useRef<{ key: string; name: string } | null>(null);

  function groupMemberForRow(row: Row, rowIndex: number) {
    if (!data.doctype) return null;
    const name = resolveRowId(row, rowAction, String(rowIndex));
    const envelope = recordOf(row, { doctype: data.doctype, name });
    return envelope
      ? doclistGroupMember(
        documentModelOf(envelope),
        list.tableColumns,
        listContextView,
        listContextKey,
      )
      : null;
  }

  const groupConfig = context?.supported && data.doctype
    ? {
      reconcileKey: listContextKey,
      doctype: data.doctype,
      parent: doclistQueryParent(data),
      view: listContextView,
      doctypeLabel: data.doctype,
      fields: doclistQueryFields(data),
      queryAvailable: hasExplicitAvailableTool(
        data._availableTools,
        "erpnext_doc_list",
      ),
    }
    : undefined;
  // Le tri porte sur toutes les pages chargées, avant le découpage d'affichage.
  const filteredMembers = groupConfig
    ? list.sorted.flatMap((row, index) => {
      const member = groupMemberForRow(row, index);
      return member ? [member] : [];
    })
    : [];
  const pinnedNames = new Set<string>();
  if (groupConfig && context) {
    // A partial server refresh can move pinned rows outside the loaded window.
    for (const group of context.selection.groups) {
      if (
        group.doctype !== groupConfig.doctype ||
        group.reconcileKey !== listContextKey
      ) continue;
      for (const { name } of group.members) {
        if (context.isGroupMemberSelected(listContextKey, name)) {
          pinnedNames.add(name);
        }
      }
    }
    // A document can also be pinned from its detail or another list.
    for (const [index, row] of rows.entries()) {
      const name = resolveRowId(row, rowAction, String(index));
      if (pinnedNames.has(name)) continue;
      const item = contextItemForRow(row, index);
      if (item && context.isSelected(item)) pinnedNames.add(name);
    }
  }
  const selectedMembers = filteredMembers.filter((member) =>
    pinnedNames.has(member.name)
  );
  const headerSelection = doclistHeaderSelection(
    filteredMembers,
    selectedMembers,
  );
  const selection = groupConfig && context
    ? {
      ...headerSelection,
      pinnedCount: pinnedNames.size,
      isSelected: (row: Row, index: number) =>
        pinnedNames.has(resolveRowId(row, rowAction, String(index))),
      onToggle: (row: Row, index: number, shiftKey: boolean) => {
        const member = groupMemberForRow(row, index);
        if (!member) return;
        if (shiftKey) {
          const anchor = selectionAnchor.current;
          void context.addGroupMembers(
            groupConfig,
            extendDoclistRange(
              [],
              filteredMembers,
              anchor?.key === listContextKey ? anchor.name : null,
              member.name,
            ),
          );
        } else {
          selectionAnchor.current = { key: listContextKey, name: member.name };
          void context.toggleGroupMember(groupConfig, member);
        }
      },
      onToggleAll: () => {
        const operation = doclistFilteredSelectionOperation(
          headerSelection.checked,
          filteredMembers,
        );
        if (operation.kind === "remove") {
          void context.removeGroupMembers(groupConfig, operation.names);
        } else {
          void context.addGroupMembers(groupConfig, operation.members);
        }
      },
    }
    : undefined;

  function contextItemForRow(
    row: Row,
    rowIndex: number,
  ) {
    if (!context?.supported || !data.doctype) return null;
    const rowId = resolveRowId(row, rowAction, String(rowIndex));
    const envelope = recordOf(row, { doctype: data.doctype, name: rowId });
    return envelope
      ? doclistRowContextItem(
        documentModelOf(envelope),
        list.tableColumns,
        listContextView,
        listContextKey,
      )
      : null;
  }

  const reconcileView = context?.supported ? context.reconcileView : undefined;
  const reconcileGroup = context?.supported
    ? context.reconcileGroup
    : undefined;
  useEffect(() => {
    if (!reconcileView) return;
    const candidates = rows.flatMap((row, rowIndex) => {
      const item = contextItemForRow(row, rowIndex);
      return item ? [item] : [];
    });
    void reconcileView(listContextKey, candidates);
    const members = rows.flatMap((row, rowIndex) => {
      const member = groupMemberForRow(row, rowIndex);
      return member ? [member] : [];
    });
    void reconcileGroup?.(listContextKey, members, {
      complete: isDoclistResultComplete(data),
    });
  }, [
    data,
    listContextKey,
    listContextView,
    list.tableColumns,
    reconcileView,
    reconcileGroup,
    rowAction,
    rows,
  ]);

  // La ligne active vit dans la pile ; son détail chargé reste local.
  useEffect(() => {
    if (expandedId === null) {
      // Fermer coupe la réponse en vol : elle n'aura plus de ligne où aller.
      pendingRowIdRef.current = null;
      setExpanded({ id: null, data: null, loading: false });
      return;
    }
    const row = pageRows.find((r, i) =>
      resolveRowId(r, rowAction, String(i)) === expandedId
    );
    if (!row) {
      // Le tableau ne rend que `pageRows`. Chercher dans `rows` laisserait
      // `expandedId` posé sur un panneau démonté dès qu'un rafraîchissement
      // garde la ligne dans les données mais la pousse hors de la page
      // courante — contenu périmé en mémoire. Changer de page, de filtre
      // ou de tri efface déjà `expandedId` (voir useDoclist) ; ce trou-ci
      // est le rafraîchissement.
      pendingRowIdRef.current = null;
      setExpanded({ id: null, data: null, loading: false });
      list.setExpandedId(null);
      return;
    }
    if (expandedRef.current.id === expandedId) return;
    if (fixture || (!rowAction && row._detail)) {
      const envelope = recordOf(
        (row._detail as Row | undefined) ?? row,
        { doctype: data.doctype, name: expandedId },
      );
      if (!envelope) {
        onError(t("doclist.error.load_details"));
        list.setExpandedId(null);
        return;
      }
      setExpanded({
        id: expandedId,
        data: envelope,
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
            const envelope = recordOf(parsed, {
              doctype: data.doctype,
              name: expandedId,
            });
            if (!envelope) throw new Error("document envelope is invalid");
            setExpanded({
              id: expandedId,
              data: envelope,
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
  }, [
    expandedId,
    // Pas `pageRows` : c'est un `.slice` neuf à chaque render, et
    // `setExpanded(null)` relancerait l'effet en boucle. `rows` change
    // au rafraîchissement, c'est le signal qui nous concerne.
    rows,
    rowAction,
    fixture,
    data.doctype,
  ]);

  // Un détail sous le pli n'existe pas pour qui l'a demandé. On scrolle le
  // conteneur interne seulement : `scrollIntoView` remonterait jusqu'à
  // l'iframe hôte. `expanded.loading` est dans les deps — sur le chemin
  // asynchrone le premier passage vise le squelette (144 px) ; quand
  // l'enveloppe arrive, `id` ne change pas, il faut un second scroll.
  useEffect(() => {
    if (expanded.id === null) return;
    const panel = document.getElementById(doclistDetailPanelId(expanded.id));
    const scroller = scrollerRef.current;
    if (!panel || !scroller) return;
    const still = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delta = nearestScrollDelta(
      scroller.getBoundingClientRect(),
      panel.getBoundingClientRect(),
    );
    if (delta === 0) return;
    scroller.scrollTo({
      top: scroller.scrollTop + delta,
      behavior: still ? "auto" : "smooth",
    });
  }, [expanded.id, expanded.loading]);

  function rowInteractionTarget(
    row: Row,
    rowIndex: number,
  ): ContextInteractionTarget | undefined {
    const rowId = resolveRowId(row, rowAction, String(rowIndex));
    const isInspectable = Boolean(rowAction || row._detail != null);
    const invoice = following ? invoiceSelectionRef(data.doctype, row) : null;
    if (invoice && invoiceSelection) {
      return {
        label: t("document.row.open_follow", { label: invoice.name }),
        clickAction: "detail",
        onActivate: () =>
          invoiceSelection.select(invoice, () => {
            if (mountedRef.current && isInspectable) list.setExpandedId(rowId);
          }),
      };
    }
    if (!isInspectable) return;
    const expanded = expandedId === rowId;
    const toggle = () => {
      cancelFollow?.();
      list.setExpandedId(expanded ? null : rowId);
    };
    return {
      label: t(
        expanded ? "interaction.detail.close" : "interaction.detail.open",
        { label: rowId },
      ),
      clickAction: "detail",
      detailLabel: rowId,
      expanded,
      controls: doclistDetailPanelId(rowId),
      onActivate: toggle,
    };
  }

  function notifyDocumentChanged(event: DocumentChangeEvent) {
    onMutated?.(event.name);
    onDocumentChanged?.(event);
  }

  function handleAttachmentDocumentChanged(event: DocumentChangeEvent) {
    notifyDocumentChanged(event);
    onMutationInvalidate?.();
    onMutationRefresh?.();
  }

  function actionTargetIsCurrent(target: DocumentEnvelope | null | undefined) {
    const current = expandedRef.current.data;
    return mountedRef.current && !!target &&
      activeRowIdRef.current === target.name &&
      pendingRowIdRef.current === target.name &&
      current?.doctype === target.doctype && current.name === target.name;
  }

  async function canonicalRereadSameRow(
    currentEnvelope: DocumentEnvelope | null | undefined,
  ): Promise<boolean> {
    if (!currentEnvelope || !actionTargetIsCurrent(currentEnvelope)) {
      return false;
    }
    const currentId = currentEnvelope.name;
    onMutationInvalidate?.();
    try {
      // Keep the old row busy until ERPNext can be read back reliably.
      await new Promise<void>((resolve) =>
        setTimeout(resolve, CANONICAL_READBACK_DELAY_MS)
      );
      if (!rowAction || !actionTargetIsCurrent(currentEnvelope)) return false;
      const readBack = await app.callServerTool({
        name: rowAction.toolName,
        arguments: {
          ...rowAction.extraArgs,
          [rowAction.argName]: currentId,
        },
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!actionTargetIsCurrent(currentEnvelope)) return false;
      if (readBack.isError) throw new Error("canonical read-back failed");
      const text = extractToolResultText(readBack);
      if (!text) throw new Error("canonical read-back is empty");
      const parsed = JSON.parse(text);
      const envelope = recordOf(parsed, {
        doctype: currentEnvelope?.doctype ?? data.doctype,
        name: currentEnvelope?.name ?? currentId,
      });
      if (
        !envelope || envelope.doctype !== currentEnvelope?.doctype ||
        envelope.name !== currentId
      ) {
        throw new Error("canonical document envelope is invalid");
      }
      setExpanded({
        id: currentId,
        data: envelope,
        loading: false,
      });
      onError(null);
      return true;
    } catch {
      if (!actionTargetIsCurrent(currentEnvelope)) return false;
      // La mutation a pu réussir sans relecture fiable : fermer l'ancien
      // état empêche une seconde action sur un docstatus désormais périmé.
      onError(t("doclist.error.load_details"));
      list.setExpandedId(null);
      return false;
    } finally {
      // Root invalidation needs its refresh even after the child row closes.
      onMutationRefresh?.();
    }
  }

  async function handleDetailAction(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<LifecycleOutcome> {
    const actionEnvelope = expandedRef.current.data;
    if (
      fixture ||
      !serverTools ||
      !actionEnvelope?.availableTools?.includes(toolName) ||
      !actionTargetIsCurrent(actionEnvelope)
    ) return false;
    try {
      let result;
      try {
        result = await app.callServerTool({
          name: toolName,
          arguments: args,
        }, { timeout: TOOL_CALL_TIMEOUT_MS });
      } catch (cause) {
        if (!actionTargetIsCurrent(actionEnvelope)) return false;
        const decision = interpretHostPurchaseInvoiceSubmit(toolName, args, {
          transportFailure: cause,
        });
        if (decision.applies && decision.reread) {
          await canonicalRereadSameRow(actionEnvelope);
          return { transport: true };
        }
        // Timeout ou échec d'hôte : le texte est montré, jamais « Action failed » nu.
        return { error: cause instanceof Error ? cause.message : null };
      }
      if (!actionTargetIsCurrent(actionEnvelope)) return false;
      const decision = interpretHostPurchaseInvoiceSubmit(toolName, args, {
        result,
      });
      if (decision.applies) {
        // Le refus du serveur n'est pas avalé : son texte remonte à l'inspecteur.
        if (decision.kind === "error") {
          return { error: extractToolResultText(result) ?? null };
        }
        if (decision.emitCommittedEvent) {
          const event = documentChangeForTool(
            actionEnvelope,
            toolName,
            new Date().toISOString(),
            "doclist.inline-detail",
          );
          if (event) notifyDocumentChanged(event);
          else if (expandedId) onMutated?.(expandedId);
        }
        const refreshed = await canonicalRereadSameRow(actionEnvelope);
        if (!decision.claimSubmitted) return { unconfirmed: true };
        return refreshed ? true : { refreshPending: true };
      }
      if (result.isError) {
        return { error: extractToolResultText(result) ?? null };
      }
      const currentId = expandedId;
      const event = documentChangeForTool(
        actionEnvelope,
        toolName,
        new Date().toISOString(),
        "doclist.inline-detail",
      );
      if (event) notifyDocumentChanged(event);
      else if (currentId) onMutated?.(currentId);
      // La mutation a réussi : une relecture ratée n'est pas un échec.
      return (await canonicalRereadSameRow(actionEnvelope))
        ? true
        : { refreshPending: true };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : null };
    }
  }

  const inspecting = expandedId !== null;
  const inlineDetail = inspecting
    ? (
      <div id={doclistDetailPanelId(expandedId)}>
        <InlineDetailPanel
          app={app}
          envelope={expanded.data}
          loading={expanded.loading}
          fixture={fixture}
          layout={layout}
          embedded
          onClose={() => {
            cancelFollow?.();
            list.setExpandedId(null);
          }}
          onAction={handleDetailAction}
          onJump={onJump}
          onAsk={onAsk}
          onDocumentChanged={handleAttachmentDocumentChanged}
          context={context}
          contextView={listContextView}
          contextKey={listContextKey}
        />
      </div>
    )
    : undefined;
  return (
    <>
      {layout === "mobile" && list.searchOpen && (
        <SearchRow
          value={list.filter}
          onInput={(filter) => {
            cancelFollow?.();
            list.setFilter(filter);
          }}
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
          onFilterChange={(column, value) => {
            cancelFollow?.();
            list.setChipFilter(column, value);
          }}
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
              class="ml-auto rounded-[3px] border border-warn/40 px-2 py-0.5 uppercase tracking-live text-warn hover:bg-warn/12"
            >
              {t("nav.refresh")}
            </button>
          )}
        </div>
      )}
      {error && <StateMessage tone="bad">{error}</StateMessage>}
      <div class="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollerRef}
          class="scroll-slim min-h-0 flex-1 overflow-y-auto"
        >
          <DoclistTable
            columns={list.tableColumns}
            rows={list.pageRows}
            rowId={(row, index) => resolveRowId(row, rowAction, String(index))}
            selectedId={expandedId}
            isFollowed={following && invoiceSelection
              ? (row) => {
                const invoice = invoiceSelectionRef(data.doctype, row);
                return invoice !== null && invoiceSelection.isOpen(invoice);
              }
              : undefined}
            struckId={stale?.subject ?? null}
            sortKey={list.sortKey}
            sortDir={list.sortDir}
            onSort={(key) => {
              cancelFollow?.();
              list.handleSort(key);
            }}
            interactionTarget={rowInteractionTarget}
            selection={selection}
            layout={layout}
            amountKey={list.amountKey}
            detail={inlineDetail}
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
                onClick={() => {
                  cancelFollow?.();
                  list.setPage(list.page - 1);
                }}
              >
                ‹
              </ToolButton>
              <span class="font-mono text-meta text-ink-muted">
                {list.page + 1} / {list.totalPages}
              </span>
              <ToolButton
                disabled={list.page >= list.totalPages - 1}
                aria-label={t("common.pagination.next")}
                onClick={() => {
                  cancelFollow?.();
                  list.setPage(list.page + 1);
                }}
              >
                ›
              </ToolButton>
            </span>
          )}
        </div>
      </div>
    </>
  );
}
