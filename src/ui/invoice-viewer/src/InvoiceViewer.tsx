/** @jsxImportSource preact */
/**
 * Invoice viewer — Direction B v2.
 * Présentation portée depuis la maquette (lignes 310-438 wide, 1624-1738 mobile).
 * Logique métier inchangée : handshake ext-apps, refresh, callServerTool, parsing.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import {
  Button,
  CasysCredit,
  cx,
  StateMessage,
  ViewerShell,
} from "~/shared/ui";
import { useViewerLayout } from "~/shared/useViewerLayout";
import { formatCurrency, formatNumber } from "~/shared/format";
import {
  canRequestUiRefresh,
  extractToolResultText,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { useT } from "~/shared/i18n-hook";
import { ConfirmSheet, useConfirm } from "~/shared/confirm";
import { StatusBadge } from "./components/StatusBadge";
import { ItemDetailPanel } from "./components/ItemDetailPanel";
import { INVOICE_FIXTURE, isFixtureMode } from "./fixture.ts";
import type { InvoiceData, InvoiceItem, InvoicePayload } from "./types.ts";

const app = new App({ name: "Invoice Viewer", version: "3.0.0" });
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

type LineRow = InvoiceItem & { idx: number };

export function InvoiceViewer() {
  // useViewerLayout au sommet — avant tout early return, les hooks doivent
  // être appelés dans le même ordre à chaque rendu.
  const { ref, layout } = useViewerLayout<HTMLDivElement>();
  const t = useT();

  const fixture = isFixtureMode();
  const [data, setData] = useState<InvoiceData | null>(
    fixture ? (INVOICE_FIXTURE.data ?? null) : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const confirm = useConfirm();
  const dataRef = useRef<InvoiceData | null>(
    fixture ? (INVOICE_FIXTURE.data ?? null) : null,
  );
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(
    fixture ? resolveUiRefreshRequest(INVOICE_FIXTURE, null) : null,
  );
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: InvoiceData) {
    dataRef.current = nextData;
    setData(nextData);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    if (result.isError) {
      const text = extractToolResultText(result);
      setError(text ?? t("invoice.error.tool_error"));
      setLoading(false);
      return false;
    }
    const text = extractToolResultText(result);
    if (!text) return false;
    try {
      const parsed = JSON.parse(text) as InvoicePayload;
      refreshRequestRef.current = resolveUiRefreshRequest(
        parsed,
        refreshRequestRef.current,
      );
      hydrateData((parsed.data ?? parsed) as InvoiceData);
      setError(null);
      setLoading(false);
      return true;
    } catch {
      setError(t("invoice.error.parse_failed"));
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
    if (fixture) return;
    const request = refreshRequestRef.current;
    if (
      !canRequestUiRefresh({
        request,
        visibilityState: typeof document === "undefined"
          ? "visible"
          : document.visibilityState,
        refreshInFlight: refreshInFlightRef.current,
        now: Date.now(),
        lastRefreshStartedAt: lastRefreshStartedAtRef.current,
        minIntervalMs: REFRESH_INTERVAL_MS,
      }, options)
    ) return;

    if (!request || !app.getHostCapabilities()?.serverTools) return;

    refreshInFlightRef.current = true;
    lastRefreshStartedAtRef.current = Date.now();
    setRefreshing(true);

    try {
      const result = await app.callServerTool({
        name: request.toolName,
        arguments: request.arguments,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!result.isError) consumeToolResult(result);
      else setError(t("invoice.error.refresh_failed"));
    } catch (cause) {
      setError(normalizeUiRefreshFailureMessage(cause));
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  async function callAction(
    key: string,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: string,
  ) {
    if (fixture || !app.getHostCapabilities()?.serverTools) return;
    setActionLoading(key);
    setActionMessage(null);
    setActionIsError(false);
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (result.isError) {
        const text = extractToolResultText(result);
        setActionIsError(true);
        setActionMessage(text ?? t("invoice.error.action_failed"));
      } else {
        setActionIsError(false);
        setActionMessage(successMsg);
        setTimeout(() => void requestRefresh({ ignoreInterval: true }), 1500);
      }
    } catch {
      setActionIsError(true);
      setActionMessage(t("invoice.error.action_failed"));
    } finally {
      setActionLoading(null);
    }
  }

  async function navigate(key: string, message: string) {
    if (fixture) return;
    setActionLoading(key);
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {
      // Hosts without sendMessage (Inspector) ignore this.
    }
    setActionLoading(null);
  }

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
    app.connect().then(() => bindHostContext(app)).catch(() => {});
  }, [fixture]);

  useEffect(() => {
    if (fixture) return;
    const onFocus = () => void requestRefresh({ ignoreInterval: true });
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void requestRefresh({ ignoreInterval: true });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fixture]);

  useEffect(() => {
    setExpandedIdx(null);
  }, [data?.name]);

  /* ── Early returns ────────────────────────────────────────────── */

  if (loading || !data) {
    return (
      <ViewerShell containerRef={ref}>
        <StateMessage>
          {loading ? t("invoice.loading") : t("invoice.no_data")}
        </StateMessage>
        <ConfirmSheet confirm={confirm} />
      </ViewerShell>
    );
  }

  /* ── Valeurs dérivées ─────────────────────────────────────────── */

  const ccy = data.currency ?? "EUR";
  const isCustomer = !!data.customer;
  const doctype = isCustomer ? "Sales Invoice" : "Purchase Invoice";
  const partyName = data.customer_name ?? data.customer ?? data.supplier_name ??
    data.supplier ?? "—";
  const outstanding = data.outstanding_amount ?? 0;
  const isPaid = outstanding <= 0;
  const items = data.items ?? [];
  const netTotal = data.net_total ?? items.reduce((s, i) => s + i.amount, 0);
  const taxes = data.total_taxes_and_charges ??
    ((data.grand_total ?? 0) - netTotal);
  const isDraft = data.status === "Draft" || data.docstatus === 0;
  const isSubmitted = data.docstatus === 1;
  const hasServerTools = app.getHostCapabilities()?.serverTools;
  const canMutate = Boolean(hasServerTools) && !fixture;
  const canExpand = canMutate || fixture;
  const rows: LineRow[] = items.map((item, idx) => ({ ...item, idx }));
  const previewTitle = fixture ? t("invoice.preview.title") : undefined;

  const isWide = layout === "wide";
  const isMobile = layout === "mobile";
  // panel = comme mobile, sans cibles tactiles 44px

  /* ── Messages erreur / action ─────────────────────────────────── */

  const messages = (
    <>
      {error && (
        <div class="px-4 pt-3">
          <StateMessage tone="bad">{error}</StateMessage>
        </div>
      )}
      {!error && actionMessage && (
        <div class="px-4 pt-3">
          <StateMessage tone={actionIsError ? "bad" : "neutral"}>
            {actionMessage}
          </StateMessage>
        </div>
      )}
    </>
  );

  /* ── Boutons d'action ─────────────────────────────────────────── */
  // Logique inchangée, variantes visuelles Direction B v2.

  const btnPayments = (canMutate || fixture) && (
    <Button
      variant="accent"
      class={cx(
        isMobile ? "min-h-[44px] rounded-touch text-body w-full" : "text-cell",
      )}
      disabled={fixture || actionLoading === "nav_payments"}
      title={fixture ? previewTitle : t("invoice.btn.payments.title")}
      onClick={() =>
        void navigate(
          "nav_payments",
          t("invoice.nav.payments.message", { doctype, name: data.name }),
        )}
    >
      {actionLoading === "nav_payments" ? "…" : t("invoice.btn.payments.label")}
    </Button>
  );

  const btnParty = (canMutate || fixture) &&
    (data.customer ?? data.supplier) && (
    <Button
      variant="secondary"
      class={cx(
        isMobile ? "flex-1 min-h-[44px] rounded-touch text-body" : "text-cell",
      )}
      disabled={fixture || actionLoading === "nav_party"}
      title={fixture
        ? previewTitle
        : isCustomer
        ? t("invoice.btn.party.title.customer")
        : t("invoice.btn.party.title.supplier")}
      onClick={() => {
        const party = data.customer ?? data.supplier;
        void navigate(
          "nav_party",
          t(
            isCustomer
              ? "invoice.nav.party.message.customer"
              : "invoice.nav.party.message.supplier",
            { party },
          ),
        );
      }}
    >
      {actionLoading === "nav_party"
        ? "…"
        : isMobile
        ? t("invoice.btn.party.label.mobile")
        : isCustomer
        ? t("invoice.btn.party.label.customer")
        : t("invoice.btn.party.label.supplier")}
    </Button>
  );

  const btnSubmit = isDraft && (canMutate || fixture) && (
    <Button
      variant="accent"
      class={isMobile ? "min-h-[44px] rounded-touch text-body" : "text-cell"}
      disabled={fixture || actionLoading === "submit"}
      title={fixture ? previewTitle : t("invoice.btn.submit.title")}
      onClick={() =>
        confirm.request({
          subject: data.name,
          title: t("invoice.confirm.submit"),
          detail: t("invoice.confirm.submit.detail"),
          actionLabel: t("invoice.confirm.submit.action"),
          onConfirm: () =>
            void callAction("submit", "erpnext_doc_submit", {
              doctype,
              name: data.name,
            }, t("invoice.action.submitted")),
        })}
    >
      {actionLoading === "submit" ? "…" : t("invoice.btn.submit.label")}
    </Button>
  );

  const btnCancel = isSubmitted && (canMutate || fixture) && (
    <Button
      variant="danger"
      class={cx(
        "border-bad/30",
        /* À l'écart des boutons de navigation : à droite, seul. */
        isMobile
          ? "w-full min-h-[44px] rounded-touch text-body"
          : "ml-auto text-cell",
      )}
      disabled={fixture || actionLoading === "cancel"}
      title={fixture ? previewTitle : t("invoice.btn.cancel.title")}
      onClick={() =>
        confirm.request({
          subject: data.name,
          title: t("invoice.confirm.cancel"),
          detail: t("invoice.confirm.cancel.detail"),
          actionLabel: t("invoice.confirm.cancel.action"),
          onConfirm: () =>
            void callAction("cancel", "erpnext_doc_cancel", {
              doctype,
              name: data.name,
            }, t("invoice.action.cancelled")),
        })}
    >
      {actionLoading === "cancel" ? "…" : t("invoice.btn.cancel.label")}
    </Button>
  );

  /* ── Totaux ───────────────────────────────────────────────────── */

  const totalsPanel = (
    <div class="flex flex-col gap-1.5 bg-sunken border-l border-line px-4 py-3.5">
      {/* Subtotal */}
      <div class="flex items-baseline justify-between">
        <span class="font-mono text-meta text-ink-faint">
          {t("invoice.totals.subtotal")}
        </span>
        <span class="font-mono text-body tabular-nums text-ink-2">
          {formatNumber(netTotal)}
        </span>
      </div>
      {/* Taxes */}
      <div class="flex items-baseline justify-between">
        <span class="font-mono text-meta text-ink-faint">
          {t("invoice.totals.taxes")}
        </span>
        <span class="font-mono text-body tabular-nums text-ink-faint">
          {taxes !== 0 ? formatNumber(taxes) : "—"}
        </span>
      </div>
      {/* Grand total */}
      <div class="flex items-baseline justify-between border-t border-line-soft pt-2">
        <span class="font-mono text-meta uppercase tracking-chip text-ink-muted">
          {t("invoice.totals.grand_total")}
        </span>
        <span
          class="font-display font-semibold tabular-nums text-ink"
          style={{ fontSize: "19px" }}
        >
          {formatCurrency(data.grand_total, ccy)}
        </span>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════
     MISE EN PAGE LARGE — tableau 4 colonnes + footer grid 2 cols
  ══════════════════════════════════════════════════════════════ */

  if (isWide) {
    return (
      <ViewerShell containerRef={ref}>
        {/* Header 2 colonnes */}
        <div
          class="grid gap-5 border-b border-line p-4"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          {/* Colonne gauche : eyebrow + titre + badge·party */}
          <div class="flex min-w-0 flex-col gap-1.5">
            <span class="font-mono text-micro uppercase tracking-eyebrow text-ink-faint">
              {doctype}
            </span>
            <h2
              class="m-0 font-display font-semibold text-doc text-ink"
              style={{ letterSpacing: "-0.015em" }}
            >
              {data.name}
            </h2>
            <div class="flex items-center gap-2">
              <StatusBadge status={data.status} />
              {refreshing && (
                <span class="font-mono text-nano text-ink-faint">
                  {t("common.refreshing")}
                </span>
              )}
              <span class="text-data text-ink-muted">
                {partyName}
                {data.company ? ` · ${data.company}` : ""}
              </span>
            </div>
          </div>

          {/* Colonne droite : outstanding hero */}
          <div class="flex flex-col items-end gap-1 border-l border-line pl-6">
            <span class="font-mono text-micro uppercase tracking-label text-ink-faint">
              {t("invoice.header.outstanding")}
            </span>
            <span
              class={cx(
                "font-display font-semibold tabular-nums leading-[1.05]",
                isPaid ? "text-ok" : "text-bad",
              )}
              style={{ fontSize: "30px" }}
            >
              {formatCurrency(outstanding, ccy)}
            </span>
            {data.due_date && (
              <span class="font-mono text-meta text-ink-muted">
                {t("invoice.header.due", { date: data.due_date })}
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        {messages}

        {/* En-tête de tableau */}
        <div
          class="grid border-b border-line bg-sunken"
          style={{
            gridTemplateColumns: "2.6fr 0.5fr 0.9fr 1fr",
            padding: "8px 16px",
          }}
        >
          <span class="font-mono text-micro uppercase tracking-label text-ink-faint">
            {t("invoice.table.col.item")}
          </span>
          <span class="font-mono text-micro uppercase tracking-label text-ink-faint text-right">
            {t("invoice.table.col.qty")}
          </span>
          <span class="font-mono text-micro uppercase tracking-label text-ink-faint text-right">
            {t("invoice.table.col.rate")}
          </span>
          <span class="font-mono text-micro uppercase tracking-label text-ink-faint text-right">
            {t("invoice.table.col.amount")}
          </span>
        </div>

        {/* Lignes article */}
        {rows.map((row) => {
          const isSelected = canExpand && expandedIdx === row.idx;
          return (
            <div key={`${row.idx}-${row.item_code}`}>
              <div
                class={cx(
                  "grid items-center border-b border-line-soft focus-visible:outline-2 focus-visible:outline-accent",
                  canExpand ? "cursor-pointer" : "",
                  isSelected ? "bg-row-selected" : "hover:bg-row-hover",
                )}
                style={{
                  gridTemplateColumns: "2.6fr 0.5fr 0.9fr 1fr",
                  padding: "10px 16px",
                  borderLeft: `2px solid ${
                    isSelected ? "var(--color-accent)" : "transparent"
                  }`,
                }}
                role={canExpand ? "button" : undefined}
                tabIndex={canExpand ? 0 : undefined}
                aria-expanded={canExpand ? isSelected : undefined}
                onClick={canExpand
                  ? () =>
                    setExpandedIdx(expandedIdx === row.idx ? null : row.idx)
                  : undefined}
                onKeyDown={canExpand
                  ? (e: KeyboardEvent) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setExpandedIdx(expandedIdx === row.idx ? null : row.idx);
                  }
                  : undefined}
              >
                {/* Cellule item : nom + sous-ligne code */}
                <div class="flex flex-col gap-0.5">
                  <span class="text-body text-ink">
                    {row.item_name ?? row.item_code}
                  </span>
                  <span class="font-mono text-chip text-ink-faint">
                    {row.item_code}
                  </span>
                </div>
                {/* Qty */}
                <span class="font-mono text-cell tabular-nums text-ink-2 text-right">
                  {formatNumber(row.qty)}
                </span>
                {/* Rate */}
                <span class="font-mono text-cell tabular-nums text-ink-muted text-right">
                  {formatNumber(row.rate)}
                </span>
                {/* Amount */}
                <span class="font-mono text-cell font-medium tabular-nums text-ink text-right">
                  {formatNumber(row.amount)}
                </span>
              </div>

              {/* Panneau de détail article (wide seulement) */}
              {isSelected && (
                <ItemDetailPanel
                  app={app}
                  itemCode={row.item_code}
                  fixture={fixture}
                  onClose={() => setExpandedIdx(null)}
                  lineIndex={row.idx}
                  lineCount={rows.length}
                  lineQty={row.qty}
                />
              )}
            </div>
          );
        })}

        {/* Footer : boutons gauche | totaux droite */}
        <div
          class="grid border-t border-line"
          style={{ gridTemplateColumns: "1fr 300px" }}
        >
          <div class="flex items-center gap-2 px-4 py-3.5">
            {btnSubmit}
            {btnPayments}
            {btnParty}
            {btnCancel}
          </div>
          {totalsPanel}
        </div>

        {/* Pied de marque */}
        <div class="flex justify-end border-t border-line px-4 py-[9px]">
          <CasysCredit />
        </div>
        <ConfirmSheet confirm={confirm} />
      </ViewerShell>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     MISE EN PAGE ÉTROITE — mobile (cartes) et panel (idem sans 44px)
     La maquette ne montre pas le panel pour invoice-viewer :
     on applique le layout mobile sans les cibles tactiles de 44 px.
  ══════════════════════════════════════════════════════════════ */

  return (
    <ViewerShell containerRef={ref}>
      {/* Header flex-col */}
      <div class="flex flex-col gap-[10px] border-b border-line px-3 py-[13px]">
        {/* Identité doc */}
        <div class="flex flex-col gap-[3px]">
          <span class="font-mono text-nano uppercase tracking-eyebrow text-ink-faint">
            {doctype}
          </span>
          <h3 class="m-0 font-display font-semibold text-title text-ink tracking-title">
            {data.name}
          </h3>
          <span class="text-data text-ink-muted">{partyName}</span>
        </div>

        {/* Ligne outstanding */}
        <div class="flex items-end justify-between gap-3 border-t border-line-soft pt-[10px]">
          {/* Gauche : label + montant */}
          <div class="flex flex-col gap-0.5">
            <span class="font-mono text-nano uppercase tracking-label text-ink-faint">
              {t("invoice.header.outstanding")}
            </span>
            <span
              class={cx(
                "font-display font-semibold text-amount tabular-nums leading-[1.05]",
                isPaid ? "text-ok" : "text-bad",
              )}
            >
              {formatCurrency(outstanding, ccy)}
            </span>
          </div>
          {/* Droite : badge + date */}
          <div class="flex flex-col items-end gap-[5px]">
            <StatusBadge status={data.status} />
            {data.due_date && (
              <span class="font-mono text-chip text-ink-muted">
                {t("invoice.header.due", { date: data.due_date.slice(5) })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {messages}

      {/* Section lignes — cartes */}
      <div class="flex flex-col gap-[7px] border-b border-line px-3 py-[11px]">
        <span class="font-mono text-nano uppercase tracking-label text-ink-faint">
          {t("invoice.lines.count", {
            n: rows.length,
            s: rows.length > 1 ? "s" : "",
          })}
        </span>
        {rows.map((row, i) => (
          <div
            key={`${row.idx}-${row.item_code}`}
            class="flex flex-col gap-[5px] rounded-chip border border-line bg-row-hover"
            style={{
              padding: "10px 11px",
              borderLeft: `2px solid ${
                i === 0 ? "var(--color-accent)" : "transparent"
              }`,
            }}
          >
            <span
              class={cx(
                "text-cell",
                i === 0 ? "text-ink" : "text-ink-2",
              )}
            >
              {row.item_name ?? row.item_code}
            </span>
            <div class="flex items-baseline justify-between gap-[10px]">
              <span class="font-mono text-chip text-ink-faint">
                {formatNumber(row.qty)} × {formatNumber(row.rate)}
              </span>
              <span
                class={cx(
                  "font-mono text-cell tabular-nums text-ink",
                  i === 0 ? "font-medium" : "",
                )}
              >
                {formatNumber(row.amount)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bande grand total */}
      <div class="flex items-baseline justify-between border-b border-line bg-sunken px-3 py-[11px]">
        <span class="font-mono text-micro uppercase tracking-chip text-ink-muted">
          {t("invoice.totals.grand_total")}
        </span>
        <span class="font-display text-title font-semibold tabular-nums text-ink">
          {formatCurrency(data.grand_total, ccy)}
        </span>
      </div>

      {/* CTA section */}
      {(canMutate || fixture) && (
        <div class="flex flex-col gap-[7px] px-3 py-[11px]">
          {/* Paiements — pleine largeur */}
          {btnPayments}
          {
            /* Ligne de boutons secondaires — le danger a sa propre ligne,
              pleine largeur, loin de la navigation. */
          }
          <div class="flex gap-[7px]">{btnParty}</div>
          {btnCancel}
          {/* Submit (rare en mobile, mais logique métier conservée) */}
          {btnSubmit}
        </div>
      )}

      {/* Pied de marque */}
      <div class="flex justify-end border-t border-line px-3 py-[9px]">
        <CasysCredit compact />
      </div>
      <ConfirmSheet confirm={confirm} />
    </ViewerShell>
  );
}
