/** @jsxImportSource preact */
/**
 * Invoice viewer — Direction B v2 avec pile de navigation.
 *
 * Niveau 1 : la facture telle qu'aujourd'hui.
 * Niveau 2+ : liste des paiements (DoclistBody) ou fiche client/fournisseur
 * (RecordLevel), selon le saut choisi. Sans serverTools, navigate() envoie une
 * phrase au chat exactement comme avant.
 *
 * Découpage :
 *  - InvoiceViewer : état, connexion, refresh, actions — sans hooks d'UI.
 *  - InvoiceContent : rendu, pile de navigation, boutons — data toujours dispo.
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
import { useViewerLayout, type ViewerLayout } from "~/shared/useViewerLayout";
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
import { ConfirmSheet, type ConfirmState, useConfirm } from "~/shared/confirm";
import { type NavHint } from "~/shared/jumps";
import { useViewerNav } from "~/shared/useViewerNav";
import { PathBar } from "~/shared/PathBar";
import { LevelBody } from "~/shared/levels/LevelBody";
import { StatusBadge } from "./components/StatusBadge";
import { ItemDetailPanel } from "./components/ItemDetailPanel";
import { INVOICE_FIXTURE, isFixtureMode } from "./fixture.ts";
import { invoiceJumps } from "./nav.ts";
import type { InvoiceData, InvoiceItem, InvoicePayload } from "./types.ts";

const app = new App({ name: "Invoice Viewer", version: "3.0.0" });
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

type LineRow = InvoiceItem & { idx: number };

/* ─── Props de l'inner component ──────────────────────────────────────────── */

interface InvoiceContentProps {
  data: InvoiceData;
  /** Hints du serveur ; null = pas de sauts disponibles. */
  hints: NavHint[] | null;
  error: string | null;
  refreshing: boolean;
  fixture: boolean;
  confirm: ConfirmState;
  actionLoading: string | null;
  actionMessage: string | null;
  actionIsError: boolean;
  callAction: (
    key: string,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: string,
  ) => Promise<void>;
  onNavigate: (key: string, message: string) => Promise<void>;
  setError: (msg: string | null) => void;
}

/* ══════════════════════════════════════════════════════════════════════════════
   InvoiceViewer — état, connexion, refresh, actions
══════════════════════════════════════════════════════════════════════════════ */

export function InvoiceViewer() {
  const t = useT();
  const fixture = isFixtureMode();

  /* ── État ─────────────────────────────────────────────────────────────── */

  const [data, setData] = useState<InvoiceData | null>(
    fixture ? (INVOICE_FIXTURE.data ?? null) : null,
  );
  const [hints, setHints] = useState<NavHint[] | null>(
    fixture ? (INVOICE_FIXTURE._sendMessageHints as NavHint[] ?? null) : null,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);
  const confirm = useConfirm();

  /* ── Refs ─────────────────────────────────────────────────────────────── */

  const loadingRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<InvoiceData | null>(
    fixture ? (INVOICE_FIXTURE.data ?? null) : null,
  );
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(
    fixture ? resolveUiRefreshRequest(INVOICE_FIXTURE, null) : null,
  );
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  /* ── Hydratation ──────────────────────────────────────────────────────── */

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
      // Extraire les hints de navigation du payload serveur.
      const nextHints = parsed._sendMessageHints;
      if (Array.isArray(nextHints)) setHints(nextHints as NavHint[]);
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

  /* ── Refresh ──────────────────────────────────────────────────────────── */

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

  /* ── Actions ──────────────────────────────────────────────────────────── */

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

  /**
   * Chemin de secours quand l'hôte ne relaie pas les outils :
   * envoie une phrase au chat — comportement identique à l'original.
   */
  async function navigate(key: string, message: string) {
    if (fixture) return;
    setActionLoading(key);
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {
      // Hosts without sendMessage (Inspector) ignorent silencieusement.
    }
    setActionLoading(null);
  }

  /* ── Effets ───────────────────────────────────────────────────────────── */

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

  /* ── Early returns ────────────────────────────────────────────────────── */

  if (loading || !data) {
    return (
      <ViewerShell containerRef={loadingRef}>
        <StateMessage>
          {loading ? t("invoice.loading") : t("invoice.no_data")}
        </StateMessage>
        <ConfirmSheet confirm={confirm} />
      </ViewerShell>
    );
  }

  /* ── Rendu ────────────────────────────────────────────────────────────── */

  return (
    <InvoiceContent
      key={data.name}
      data={data}
      hints={hints}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      confirm={confirm}
      actionLoading={actionLoading}
      actionMessage={actionMessage}
      actionIsError={actionIsError}
      callAction={callAction}
      onNavigate={navigate}
      setError={setError}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   InvoiceContent — rendu, pile de navigation, boutons
   Reçoit `data` toujours défini → useNavStack initialisé avec le bon titre.
   key={data.name} sur l'appelant réinitialise la pile à chaque nouvelle pièce.
══════════════════════════════════════════════════════════════════════════════ */

function InvoiceContent({
  data,
  hints,
  error,
  refreshing,
  fixture,
  confirm,
  actionLoading,
  actionMessage,
  actionIsError,
  callAction,
  onNavigate,
  setError,
}: InvoiceContentProps) {
  /* ── Hooks d'UI (inconditionnels) ────────────────────────────────────── */

  const { ref, layout } = useViewerLayout<HTMLDivElement>();
  const t = useT();

  // Pile de navigation : titre racine = nom de la pièce.
  const viewerNav = useViewerNav(app, {
    title: data.name,
    kind: "root",
    origin: "record",
  }, { fixture });
  const nav = viewerNav.nav;

  // useDoclist doit être appelé inconditionnellement avant tout return.
  const { list } = viewerNav;

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  /* ── Valeurs dérivées ─────────────────────────────────────────────────── */

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

  /* ── Sauts de navigation ─────────────────────────────────────────────── */

  /**
   * jumpsEnabled = false en mode fixture et sans serverTools.
   * Dans ce cas invoiceJumps reçoit null → sauts null → navigate() est utilisé.
   */
  const { jumpsEnabled } = viewerNav;
  const party = data.customer ?? data.supplier ?? "";
  const jumpSubtitle = t("nav.linked_to", { id: data.name });
  const { payments: paymentsJump, party: partyJump } = invoiceJumps(
    jumpsEnabled ? hints : null,
    { id: data.name, doctype, party },
    jumpSubtitle,
  );

  /** Envoie une question au chat (chemin de secours sans outils). */
  const { ask } = viewerNav;

  /* ── Messages erreur / action ─────────────────────────────────────────── */

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

  /* ── Boutons d'action ─────────────────────────────────────────────────── */

  /**
   * Paiements : saut › si l'hôte relaie et que le hint est disponible,
   * sinon navigate() envoie une phrase au chat — identique à l'original.
   */
  const btnPayments = (canMutate || fixture) && (
    <Button
      variant="accent"
      class={cx(
        "group",
        isMobile ? "min-h-[44px] rounded-touch text-body w-full" : "text-cell",
      )}
      disabled={fixture || actionLoading === "nav_payments"}
      title={fixture ? previewTitle : t("invoice.btn.payments.title")}
      onClick={() => {
        if (paymentsJump) {
          void nav.jump(paymentsJump);
        } else {
          void onNavigate(
            "nav_payments",
            t("invoice.nav.payments.message", { doctype, name: data.name }),
          );
        }
      }}
    >
      {actionLoading === "nav_payments" ? "…" : t("invoice.btn.payments.label")}
      {paymentsJump && (
        <span
          aria-hidden="true"
          class={cx(
            "ml-1 text-accent",
            !isMobile &&
              "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          ›
        </span>
      )}
    </Button>
  );

  /**
   * Tiers (client ou fournisseur) : saut › vers la fiche si l'hôte relaie,
   * sinon navigate() envoie une phrase au chat — identique à l'original.
   */
  const btnParty = (canMutate || fixture) &&
    (data.customer ?? data.supplier) && (
    <Button
      variant="secondary"
      class={cx(
        "group",
        isMobile ? "flex-1 min-h-[44px] rounded-touch text-body" : "text-cell",
      )}
      disabled={fixture || actionLoading === "nav_party"}
      title={fixture
        ? previewTitle
        : isCustomer
        ? t("invoice.btn.party.title.customer")
        : t("invoice.btn.party.title.supplier")}
      onClick={() => {
        if (partyJump) {
          void nav.jump(partyJump);
        } else {
          void onNavigate(
            "nav_party",
            t(
              isCustomer
                ? "invoice.nav.party.message.customer"
                : "invoice.nav.party.message.supplier",
              { party: data.customer ?? data.supplier },
            ),
          );
        }
      }}
    >
      {
        /* Un saut ouvre la fiche du tiers : il porte le libellé du hint (« Client »),
          pas celui de la phrase (« Factures du client »). */
      }
      {actionLoading === "nav_party"
        ? "…"
        : partyJump
        ? partyJump.label
        : isMobile
        ? t("invoice.btn.party.label.mobile")
        : isCustomer
        ? t("invoice.btn.party.label.customer")
        : t("invoice.btn.party.label.supplier")}
      {partyJump && (
        <span
          aria-hidden="true"
          class={cx(
            "ml-1 text-accent",
            !isMobile &&
              "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
          )}
        >
          ›
        </span>
      )}
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

  /* ── Totaux ───────────────────────────────────────────────────────────── */

  const totalsPanel = (
    <div class="flex flex-col gap-1.5 bg-sunken border-l border-line px-4 py-3.5">
      <div class="flex items-baseline justify-between">
        <span class="font-mono text-meta text-ink-faint">
          {t("invoice.totals.subtotal")}
        </span>
        <span class="font-mono text-body tabular-nums text-ink-2">
          {formatNumber(netTotal)}
        </span>
      </div>
      <div class="flex items-baseline justify-between">
        <span class="font-mono text-meta text-ink-faint">
          {t("invoice.totals.taxes")}
        </span>
        <span class="font-mono text-body tabular-nums text-ink-faint">
          {taxes !== 0 ? formatNumber(taxes) : "—"}
        </span>
      </div>
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
     MISE EN PAGE LARGE
  ══════════════════════════════════════════════════════════════ */

  if (isWide) {
    return (
      <ViewerShell containerRef={ref}>
        {/* Header 2 colonnes — toujours visible */}
        <div
          class="grid gap-5 border-b border-line p-4"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          <div class="flex min-w-0 flex-col gap-1.5">
            <span class="font-mono text-micro uppercase tracking-eyebrow text-ink-faint">
              {doctype}
            </span>
            <h2
              class="m-0 font-display font-semibold text-doc text-ink"
              style={{ letterSpacing: "-0.015em" }}
            >
              {nav.isRoot ? data.name : nav.current.title}
            </h2>
            <div class="flex items-center gap-2">
              {nav.isRoot && <StatusBadge status={data.status} />}
              {refreshing && (
                <span class="font-mono text-nano text-ink-faint">
                  {t("common.refreshing")}
                </span>
              )}
              {nav.isRoot && (
                <span class="text-data text-ink-muted">
                  {partyName}
                  {data.company ? ` · ${data.company}` : ""}
                </span>
              )}
            </div>
          </div>

          {nav.isRoot && (
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
          )}
        </div>

        {/* PathBar — invisible au niveau 1 (crumbs.showBar = false) */}
        <PathBar
          layout={layout}
          stack={nav.stack}
          onBack={nav.pop}
          onJump={nav.popTo}
          loading={nav.current.loading}
        />

        {/* Corps du niveau courant ; les enfants = contenu racine niveau 1 */}
        <LevelBody
          level={nav.current}
          app={app}
          list={list}
          layout={layout as ViewerLayout}
          fixture={fixture}
          onJump={jumpsEnabled ? nav.jump : undefined}
          onAsk={ask}
          onError={setError}
          onMutated={nav.markStale}
          onRefresh={() => void nav.refreshLevel()}
        >
          {/* ── Contenu racine (niveau 1 seulement) ── */}
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
                  <div class="flex flex-col gap-0.5">
                    <span class="text-body text-ink">
                      {row.item_name ?? row.item_code}
                    </span>
                    <span class="font-mono text-chip text-ink-faint">
                      {row.item_code}
                    </span>
                  </div>
                  <span class="font-mono text-cell tabular-nums text-ink-2 text-right">
                    {formatNumber(row.qty)}
                  </span>
                  <span class="font-mono text-cell tabular-nums text-ink-muted text-right">
                    {formatNumber(row.rate)}
                  </span>
                  <span class="font-mono text-cell font-medium tabular-nums text-ink text-right">
                    {formatNumber(row.amount)}
                  </span>
                </div>

                {isSelected && (
                  <ItemDetailPanel
                    app={app}
                    itemCode={row.item_code}
                    fixture={fixture}
                    hints={hints ?? data._sendMessageHints}
                    onJump={jumpsEnabled ? nav.jump : undefined}
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
        </LevelBody>

        {/* Pied de marque — toujours visible */}
        <div class="flex justify-end border-t border-line px-4 py-[9px]">
          <CasysCredit />
        </div>
        <ConfirmSheet confirm={confirm} />
      </ViewerShell>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     MISE EN PAGE ÉTROITE — mobile et panel
  ══════════════════════════════════════════════════════════════ */

  return (
    <ViewerShell containerRef={ref}>
      {/* Header flex-col — toujours visible */}
      <div class="flex flex-col gap-[10px] border-b border-line px-3 py-[13px]">
        <div class="flex flex-col gap-[3px]">
          <span class="font-mono text-nano uppercase tracking-eyebrow text-ink-faint">
            {doctype}
          </span>
          <h3 class="m-0 font-display font-semibold text-title text-ink tracking-title">
            {nav.isRoot ? data.name : nav.current.title}
          </h3>
          {nav.isRoot && (
            <span class="text-data text-ink-muted">{partyName}</span>
          )}
        </div>

        {nav.isRoot && (
          <div class="flex items-end justify-between gap-3 border-t border-line-soft pt-[10px]">
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
            <div class="flex flex-col items-end gap-[5px]">
              <StatusBadge status={data.status} />
              {data.due_date && (
                <span class="font-mono text-chip text-ink-muted">
                  {t("invoice.header.due", { date: data.due_date.slice(5) })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PathBar — invisible au niveau 1 */}
      <PathBar
        layout={layout}
        stack={nav.stack}
        onBack={nav.pop}
        onJump={nav.popTo}
        loading={nav.current.loading}
      />

      {/* Corps du niveau courant */}
      <LevelBody
        level={nav.current}
        app={app}
        list={list}
        layout={layout as ViewerLayout}
        fixture={fixture}
        onJump={jumpsEnabled ? nav.jump : undefined}
        onAsk={ask}
        onError={setError}
        onMutated={nav.markStale}
        onRefresh={() => void nav.refreshLevel()}
      >
        {/* ── Contenu racine (niveau 1 seulement) ── */}
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
            {btnPayments}
            <div class="flex gap-[7px]">{btnParty}</div>
            {btnCancel}
            {btnSubmit}
          </div>
        )}
      </LevelBody>

      {/* Pied de marque — toujours visible */}
      <div class="flex justify-end border-t border-line px-3 py-[9px]">
        <CasysCredit compact />
      </div>
      <ConfirmSheet confirm={confirm} />
    </ViewerShell>
  );
}
