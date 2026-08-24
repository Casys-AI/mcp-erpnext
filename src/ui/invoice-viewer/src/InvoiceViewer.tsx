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
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { App } from "@modelcontextprotocol/ext-apps";
import { bindHostContext } from "~/shared/host-context-hook";
import type { DocumentChangeEvent } from "~/shared/document-events";
import { AttachmentsSection } from "~/shared/document/AttachmentsSection";
import { documentCapabilities } from "~/shared/document/capabilities";
import { useAttachments } from "~/shared/document/useAttachments";
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
  beginUiRefresh,
  canRequestUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  extractToolResultText,
  invalidateUiRefresh,
  normalizeUiRefreshFailureMessage,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { useT } from "~/shared/i18n-hook";
import { ConfirmSheet, type ConfirmState, useConfirm } from "~/shared/confirm";
import { useViewerNav } from "~/shared/useViewerNav";
import { viewerRootKey } from "~/shared/nav-stack";
import { PathBar } from "~/shared/PathBar";
import { LevelBody } from "~/shared/levels/LevelBody";
import { canSendTextMessage, sendTextMessage } from "~/shared/host-message";
import { hasAvailableTool } from "~/shared/viewer-tools";
import { StatusBadge } from "./components/StatusBadge";
import { ItemDetailPanel } from "./components/ItemDetailPanel";
import {
  INVOICE_ATTACHMENT_FIXTURES,
  INVOICE_FIXTURE,
  isFixtureMode,
} from "./fixture.ts";
import {
  canOfferNavigation,
  invoiceJumps,
  invoiceMutationActions,
  invoiceRootDocumentChange,
  type InvoiceRootMutation,
  nextInvoiceMutationCommitted,
} from "./nav.ts";
import {
  type InvoiceData,
  type InvoiceDocumentEnvelope,
  invoiceDocumentEnvelope,
  type InvoiceItem,
  type InvoicePayload,
} from "./types.ts";

const app = new App({ name: "Invoice Viewer", version: "3.0.0" });
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;
const CANONICAL_READBACK_DELAY_MS = 1_500;
const ATTACHMENT_SIDEBAR_MIN_WIDTH = 960;

type LineRow = InvoiceItem & { idx: number };

/* ─── Props de l'inner component ──────────────────────────────────────────── */

interface InvoiceContentProps {
  data: InvoiceData;
  envelope: InvoiceDocumentEnvelope;
  mutationCommitted: boolean;
  error: string | null;
  refreshing: boolean;
  fixture: boolean;
  confirm: ConfirmState;
  actionLoading: string | null;
  actionMessage: string | null;
  actionIsError: boolean;
  rootFreshEvent: number;
  rootMutationEvent: number;
  callAction: (
    mutation: InvoiceRootMutation,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: string,
    target: { doctype: string; name: string },
    onDocumentChanged: (event: DocumentChangeEvent) => void,
  ) => Promise<void>;
  onBeginCanonicalReadback: () => void;
  onCanonicalRefresh: () => Promise<boolean>;
  onNavigate: (key: string, message: string) => Promise<boolean>;
  setError: (msg: string | null) => void;
}

/* ══════════════════════════════════════════════════════════════════════════════
   InvoiceViewer — état, connexion, refresh, actions
══════════════════════════════════════════════════════════════════════════════ */

export function InvoiceViewer() {
  const t = useT();
  const fixture = isFixtureMode();
  const initialEnvelope = fixture
    ? invoiceDocumentEnvelope(INVOICE_FIXTURE)
    : null;

  /* ── État ─────────────────────────────────────────────────────────────── */

  const [envelope, setEnvelope] = useState<InvoiceDocumentEnvelope | null>(
    initialEnvelope,
  );
  const [loading, setLoading] = useState(!fixture);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);
  const [mutationCommitted, setMutationCommitted] = useState(false);
  const [rootFreshEvent, setRootFreshEvent] = useState(0);
  const [rootMutationEvent, setRootMutationEvent] = useState(0);
  const confirm = useConfirm();

  /* ── Refs ─────────────────────────────────────────────────────────────── */

  const loadingRef = useRef<HTMLDivElement>(null);
  const envelopeRef = useRef<InvoiceDocumentEnvelope | null>(initialEnvelope);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(
    initialEnvelope?.refreshRequest ?? null,
  );
  const refreshSequenceRef = useRef(createUiRefreshSequence());
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastRefreshStartedAtRef = useRef(0);
  const availableToolsRef = useRef<readonly string[] | undefined>(
    initialEnvelope?.availableTools,
  );
  const actionInFlightRef = useRef(false);
  const mutationCommittedRef = useRef(false);
  const canonicalRefreshBlockedRef = useRef(false);
  const rootEventRef = useRef(0);

  /* ── Hydratation ──────────────────────────────────────────────────────── */

  function hydrateData(nextEnvelope: InvoiceDocumentEnvelope) {
    envelopeRef.current = nextEnvelope;
    setEnvelope(nextEnvelope);
    canonicalRefreshBlockedRef.current = false;
    mutationCommittedRef.current = false;
    setMutationCommitted((current) =>
      nextInvoiceMutationCommitted(current, "canonical-hydrated")
    );
    setRootFreshEvent(++rootEventRef.current);
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
      const parsedEnvelope = invoiceDocumentEnvelope(parsed);
      if (!parsedEnvelope) {
        throw new Error("Missing explicit document identity");
      }
      availableToolsRef.current = parsedEnvelope.availableTools;
      const refreshRequest = resolveUiRefreshRequest(
        parsed,
        refreshRequestRef.current,
      );
      refreshRequestRef.current = refreshRequest;
      hydrateData({
        ...parsedEnvelope,
        ...(refreshRequest ? { refreshRequest } : {}),
      });
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

  async function requestRefresh(
    options: { ignoreInterval?: boolean; force?: boolean } = {},
  ): Promise<boolean> {
    if (fixture || canonicalRefreshBlockedRef.current) return false;

    const current = refreshSequenceRef.current;
    if (options.force) {
      if (current.inFlight !== null) {
        // Invalide immédiatement le read antérieur et coalesce toutes les
        // mutations derrière son unique drain canonique.
        refreshSequenceRef.current = beginUiRefresh(current, {
          force: true,
        }).state;
        return refreshPromiseRef.current ?? false;
      }

      // Conserve la relecture obligatoire si elle ne peut pas partir tout de
      // suite (vue masquée ou capacité momentanément absente).
      refreshSequenceRef.current = {
        ...invalidateUiRefresh(current),
        pendingForced: true,
      };
    } else if (current.inFlight !== null) {
      return false;
    }

    const operation = (async (): Promise<boolean> => {
      try {
        while (true) {
          const sequence = refreshSequenceRef.current;
          const request = refreshRequestRef.current;
          const forced = sequence.pendingForced;

          if (
            !request ||
            !app.getHostCapabilities()?.serverTools ||
            !hasAvailableTool(availableToolsRef.current, request.toolName) ||
            !canRequestUiRefresh({
              request,
              visibilityState: typeof document === "undefined"
                ? "visible"
                : document.visibilityState,
              refreshInFlight: false,
              now: Date.now(),
              lastRefreshStartedAt: lastRefreshStartedAtRef.current,
              minIntervalMs: REFRESH_INTERVAL_MS,
            }, { ignoreInterval: options.ignoreInterval || forced })
          ) return false;

          const started = beginUiRefresh(sequence, { force: forced });
          if (started.generation === null) return false;
          refreshSequenceRef.current = started.state;
          lastRefreshStartedAtRef.current = Date.now();
          setRefreshing(true);

          let result: ToolResultPayload | null = null;
          let failure: { cause: unknown } | null = null;
          try {
            result = await app.callServerTool({
              name: request.toolName,
              arguments: request.arguments,
            }, { timeout: TOOL_CALL_TIMEOUT_MS });
          } catch (cause) {
            failure = { cause };
          }

          const completed = completeUiRefresh(
            refreshSequenceRef.current,
            started.generation,
          );
          refreshSequenceRef.current = completed.state;
          let succeeded = false;
          if (completed.accept) {
            if (failure) {
              setError(normalizeUiRefreshFailureMessage(failure.cause));
            } else if (result?.isError) {
              setError(t("invoice.error.refresh_failed"));
            } else if (result) {
              succeeded = consumeToolResult(result);
            }
          }

          if (!completed.runPending) return succeeded;
          // La boucle revalide requête, visibilité et capacité. Tant qu'elle
          // ne peut pas repartir, pendingForced reste posé pour le focus futur.
        }
      } finally {
        setRefreshing(false);
      }
    })();
    refreshPromiseRef.current = operation;
    void operation.finally(() => {
      if (refreshPromiseRef.current === operation) {
        refreshPromiseRef.current = null;
      }
    });
    return operation;
  }

  /* ── Actions ──────────────────────────────────────────────────────────── */

  function invalidateRefresh() {
    refreshSequenceRef.current = invalidateUiRefresh(
      refreshSequenceRef.current,
    );
  }

  function beginCanonicalReadback() {
    canonicalRefreshBlockedRef.current = true;
    invalidateRefresh();
    setRootMutationEvent(++rootEventRef.current);
  }

  function requestCanonicalRefresh(): Promise<boolean> {
    canonicalRefreshBlockedRef.current = false;
    return requestRefresh({ ignoreInterval: true, force: true });
  }

  async function callAction(
    mutation: InvoiceRootMutation,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: string,
    target: { doctype: string; name: string },
    onDocumentChanged: (event: DocumentChangeEvent) => void,
  ) {
    if (
      fixture ||
      actionInFlightRef.current ||
      !app.getHostCapabilities()?.serverTools ||
      !hasAvailableTool(availableToolsRef.current, toolName)
    ) return;
    actionInFlightRef.current = true;
    setActionLoading(mutation);
    setActionMessage(null);
    setActionIsError(false);
    const targetIsCurrent = () => {
      const current = envelopeRef.current;
      return current?.doctype === target.doctype &&
        current.name === target.name;
    };
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (!targetIsCurrent()) return;
      if (result.isError) {
        const text = extractToolResultText(result);
        setActionIsError(true);
        setActionMessage(text ?? t("invoice.error.action_failed"));
      } else {
        mutationCommittedRef.current = true;
        setMutationCommitted((current) =>
          nextInvoiceMutationCommitted(current, "mutation-committed")
        );
        onDocumentChanged(invoiceRootDocumentChange(
          target.doctype,
          target.name,
          mutation,
          new Date().toISOString(),
        ));
        beginCanonicalReadback();
        setActionIsError(false);
        setActionMessage(successMsg);
        await new Promise<void>((resolve) =>
          setTimeout(resolve, CANONICAL_READBACK_DELAY_MS)
        );
        if (!targetIsCurrent()) return;
        const refreshed = await requestCanonicalRefresh();
        if (!refreshed && mutationCommittedRef.current) {
          setActionIsError(true);
          setActionMessage(t("invoice.error.refresh_failed"));
        }
      }
    } catch {
      if (targetIsCurrent()) {
        setActionIsError(true);
        setActionMessage(t("invoice.error.action_failed"));
      }
    } finally {
      actionInFlightRef.current = false;
      setActionLoading(null);
    }
  }

  /**
   * Chemin de secours quand l'hôte ne relaie pas les outils :
   * envoie une phrase au chat — comportement identique à l'original.
   */
  async function navigate(key: string, message: string) {
    if (fixture) return false;
    setActionLoading(key);
    setActionMessage(null);
    setActionIsError(false);
    const sent = await sendTextMessage(app, message);
    if (!sent) {
      setActionIsError(true);
      setActionMessage(t("invoice.error.action_failed"));
    }
    setActionLoading(null);
    return sent;
  }

  /* ── Effets ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (fixture) return;
    app.ontoolresult = (result: ToolResultPayload) => {
      invalidateRefresh();
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!envelopeRef.current) setLoading(true);
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

  if (loading || !envelope) {
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

  const data = envelope.document;

  return (
    <InvoiceContent
      key={`${data.doctype}:${data.name}`}
      data={data}
      envelope={envelope}
      mutationCommitted={mutationCommitted}
      error={error}
      refreshing={refreshing}
      fixture={fixture}
      confirm={confirm}
      actionLoading={actionLoading}
      actionMessage={actionMessage}
      actionIsError={actionIsError}
      rootFreshEvent={rootFreshEvent}
      rootMutationEvent={rootMutationEvent}
      callAction={callAction}
      onBeginCanonicalReadback={beginCanonicalReadback}
      onCanonicalRefresh={requestCanonicalRefresh}
      onNavigate={navigate}
      setError={setError}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   InvoiceContent — rendu, pile de navigation, boutons
   Reçoit `data` toujours défini → useNavStack initialisé avec le bon titre.
   key={doctype:name} sur l'appelant réinitialise la pile à chaque nouvelle pièce.
══════════════════════════════════════════════════════════════════════════════ */

function InvoiceContent({
  data,
  envelope,
  mutationCommitted,
  error,
  refreshing,
  fixture,
  confirm,
  actionLoading,
  actionMessage,
  actionIsError,
  rootFreshEvent,
  rootMutationEvent,
  callAction,
  onBeginCanonicalReadback,
  onCanonicalRefresh,
  onNavigate,
  setError,
}: InvoiceContentProps) {
  /* ── Hooks d'UI (inconditionnels) ────────────────────────────────────── */

  const { ref, width, layout } = useViewerLayout<HTMLDivElement>();
  const t = useT();

  // Pile de navigation : titre racine = nom de la pièce.
  const viewerNav = useViewerNav(app, {
    title: data.name,
    kind: "root",
    origin: "record",
    key: viewerRootKey("invoice", undefined, {
      doctype: data.doctype,
      name: data.name,
    }),
  }, { fixture });
  const nav = viewerNav.nav;

  const rootLevelId = nav.stack.levels[0].id;
  useLayoutEffect(() => {
    if (rootFreshEvent > rootMutationEvent) nav.clearStale(rootLevelId);
  }, [rootFreshEvent, rootMutationEvent, rootLevelId]);

  // useDoclist doit être appelé inconditionnellement avant tout return.
  const { list } = viewerNav;

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [canonicalRefreshPending, setCanonicalRefreshPending] = useState(false);
  const delayedRefreshRef = useRef<number | null>(null);
  const delayedRefreshGenerationRef = useRef(0);

  useEffect(() => () => {
    delayedRefreshGenerationRef.current += 1;
    if (delayedRefreshRef.current !== null) {
      clearTimeout(delayedRefreshRef.current);
    }
  }, []);

  const hostCapabilities = fixture ? undefined : app.getHostCapabilities();
  const availableTools = envelope.availableTools;
  const hints = envelope.sendMessageHints
    ? [...envelope.sendMessageHints]
    : null;
  const baseDocumentCapabilities = documentCapabilities(
    hostCapabilities,
    availableTools,
    envelope.refreshRequest,
  );
  const attachmentCapabilities = {
    ...baseDocumentCapabilities,
    canUploadAttachment: baseDocumentCapabilities.canUploadAttachment &&
      actionLoading === null && !mutationCommitted &&
      !canonicalRefreshPending,
  };

  function scheduleCanonicalRefresh(invalidate = true) {
    if (invalidate) onBeginCanonicalReadback();
    setCanonicalRefreshPending(true);
    const generation = ++delayedRefreshGenerationRef.current;
    if (delayedRefreshRef.current !== null) {
      clearTimeout(delayedRefreshRef.current);
    }
    delayedRefreshRef.current = window.setTimeout(() => {
      delayedRefreshRef.current = null;
      const finish = () => {
        if (delayedRefreshGenerationRef.current !== generation) return false;
        setCanonicalRefreshPending(false);
        return true;
      };
      void onCanonicalRefresh().then((refreshed) => {
        if (finish() && !refreshed) {
          setError(t("invoice.error.refresh_failed"));
        }
      }, () => {
        if (finish()) setError(t("invoice.error.refresh_failed"));
      });
    }, CANONICAL_READBACK_DELAY_MS);
  }

  const attachments = useAttachments({
    app,
    envelope,
    capabilities: attachmentCapabilities,
    fixtureFiles: fixture ? INVOICE_ATTACHMENT_FIXTURES : undefined,
    onDocumentChanged: (event) => {
      nav.reportDocumentChange(event);
      scheduleCanonicalRefresh();
    },
  });
  const attachmentMutationBusy = attachments.state.upload !== "idle" &&
    attachments.state.upload !== "error";

  /* ── Valeurs dérivées ─────────────────────────────────────────────────── */

  const ccy = data.currency ?? "EUR";
  const doctype = data.doctype;
  const isCustomer = Boolean(
    data.customer || (data.quotation_to === "Customer" && data.party_name),
  );
  const partyName = data.customer_name ?? data.customer ?? data.supplier_name ??
    data.supplier ?? data.party_name ?? "—";
  const outstanding = data.outstanding_amount ?? 0;
  const isPaid = outstanding <= 0;
  const items = data.items ?? [];
  const netTotal = data.net_total ?? items.reduce((s, i) => s + i.amount, 0);
  const taxes = data.total_taxes_and_charges ??
    ((data.grand_total ?? 0) - netTotal);
  const isDraft = data.status === "Draft" || data.docstatus === 0;
  const isSubmitted = data.docstatus === 1;
  const hasServerTools = Boolean(hostCapabilities?.serverTools);
  const canInspectItem = hasServerTools && (
    hasAvailableTool(availableTools, "erpnext_item_get") ||
    hasAvailableTool(availableTools, "erpnext_stock_balance")
  );
  const messagesEnabled = !fixture &&
    canSendTextMessage(app.getHostCapabilities());
  const paymentMessagesEnabled = messagesEnabled &&
    (doctype === "Sales Invoice" || doctype === "Purchase Invoice");
  const canExpand = canInspectItem || messagesEnabled || fixture;
  const rows: LineRow[] = items.map((item, idx) => ({ ...item, idx }));
  const previewTitle = fixture ? t("invoice.preview.title") : undefined;
  const isWide = layout === "wide";
  const isMobile = layout === "mobile";
  const rootStale = nav.stack.levels[0].stale;
  const rootStaleIndicator = nav.isRoot && rootStale
    ? (
      <span
        role="status"
        aria-label={t("nav.stale_values", { at: rootStale.at })}
        title={t("nav.stale_title")}
        class="inline-flex items-center gap-1.5 font-mono text-nano text-warn"
      >
        <span aria-hidden="true" class="size-[5px] rounded-full bg-warn" />
        {!isMobile && <span>{t("nav.stale_values", { at: rootStale.at })}
        </span>}
      </span>
    )
    : null;

  const showAttachments = fixture ||
    baseDocumentCapabilities.canListAttachments;
  const showAttachmentSidebar = showAttachments && isWide &&
    width !== null && width >= ATTACHMENT_SIDEBAR_MIN_WIDTH;
  const attachmentSection = showAttachments
    ? (
      <AttachmentsSection
        controller={attachments}
        capabilities={attachmentCapabilities}
        layout={layout}
      />
    )
    : null;

  /* ── Sauts de navigation ─────────────────────────────────────────────── */

  /**
   * jumpsEnabled = false en mode fixture et sans serverTools.
   * Dans ce cas invoiceJumps reçoit null → sauts null → navigate() est utilisé.
   */
  const { jumpsEnabled } = viewerNav;
  const party = data.customer ?? data.supplier ?? data.party_name ?? "";
  const jumpSubtitle = t("nav.linked_to", { id: data.name });
  const { payments: paymentsJump, party: partyJump } = invoiceJumps(
    jumpsEnabled ? hints : null,
    { id: data.name, doctype, party },
    jumpSubtitle,
    jumpsEnabled ? availableTools : [],
  );
  const mutations = invoiceMutationActions(
    doctype,
    data.name,
    hasServerTools ? availableTools : [],
    mutationCommitted,
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
  const btnPayments = canOfferNavigation(
    paymentsJump,
    paymentMessagesEnabled,
    fixture,
  ) && (
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
  const btnParty = canOfferNavigation(partyJump, messagesEnabled, fixture) &&
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

  const btnSubmit = isDraft && (mutations.submit || fixture) && (
    <Button
      variant="accent"
      class={isMobile ? "min-h-[44px] rounded-touch text-body" : "text-cell"}
      disabled={fixture || actionLoading === "submit" ||
        canonicalRefreshPending ||
        attachmentMutationBusy}
      title={fixture ? previewTitle : t("invoice.btn.submit.title")}
      onClick={() =>
        confirm.request({
          subject: data.name,
          title: t("invoice.confirm.submit"),
          detail: t("invoice.confirm.submit.detail"),
          actionLabel: t("invoice.confirm.submit.action"),
          onConfirm: () => {
            if (!mutations.submit) return;
            void callAction(
              "submit",
              mutations.submit.toolName,
              mutations.submit.args,
              t("invoice.action.submitted"),
              { doctype, name: data.name },
              nav.reportDocumentChange,
            );
          },
        })}
    >
      {actionLoading === "submit" ? "…" : t("invoice.btn.submit.label")}
    </Button>
  );

  const btnCancel = isSubmitted && (mutations.cancel || fixture) && (
    <Button
      variant="danger"
      class={cx(
        "border-bad/30",
        isMobile
          ? "w-full min-h-[44px] rounded-touch text-body"
          : "ml-auto text-cell",
      )}
      disabled={fixture || actionLoading === "cancel" ||
        canonicalRefreshPending ||
        attachmentMutationBusy}
      title={fixture ? previewTitle : t("invoice.btn.cancel.title")}
      onClick={() =>
        confirm.request({
          subject: data.name,
          title: t("invoice.confirm.cancel"),
          detail: t("invoice.confirm.cancel.detail"),
          actionLabel: t("invoice.confirm.cancel.action"),
          onConfirm: () => {
            if (!mutations.cancel) return;
            void callAction(
              "cancel",
              mutations.cancel.toolName,
              mutations.cancel.args,
              t("invoice.action.cancelled"),
              { doctype, name: data.name },
              nav.reportDocumentChange,
            );
          },
        })}
    >
      {actionLoading === "cancel" ? "…" : t("invoice.btn.cancel.label")}
    </Button>
  );
  const hasActionButtons = Boolean(
    btnPayments || btnParty || btnSubmit || btnCancel,
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
              {rootStaleIndicator}
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
          onDocumentChanged={nav.reportDocumentChange}
          onMutationInvalidate={onBeginCanonicalReadback}
          onMutationRefresh={() => scheduleCanonicalRefresh(false)}
          onRefresh={() => void nav.refreshLevel()}
        >
          {/* ── Contenu racine (niveau 1 seulement) ── */}
          {messages}

          <div
            class={showAttachmentSidebar ? "grid min-w-0" : "min-w-0"}
            style={showAttachmentSidebar
              ? { gridTemplateColumns: "minmax(0, 1fr) 268px" }
              : undefined}
          >
            <div class="min-w-0">
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
                          setExpandedIdx(
                            expandedIdx === row.idx ? null : row.idx,
                          )
                        : undefined}
                      onKeyDown={canExpand
                        ? (e: KeyboardEvent) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          setExpandedIdx(
                            expandedIdx === row.idx ? null : row.idx,
                          );
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
                        availableTools={availableTools}
                        hints={hints ?? undefined}
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
              {!showAttachmentSidebar && attachmentSection && (
                <div class="border-t border-line">{attachmentSection}</div>
              )}
            </div>
            {showAttachmentSidebar && (
              <aside class="min-w-0 border-l border-line bg-sunken/35">
                {attachmentSection}
              </aside>
            )}
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
              {rootStaleIndicator}
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
        onDocumentChanged={nav.reportDocumentChange}
        onMutationInvalidate={onBeginCanonicalReadback}
        onMutationRefresh={() => scheduleCanonicalRefresh(false)}
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

        {attachmentSection && (
          <div class="border-b border-line">{attachmentSection}</div>
        )}

        {/* CTA section */}
        {hasActionButtons && (
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
