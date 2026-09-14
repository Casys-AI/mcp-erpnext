/**
 * Invoice Viewer — Sales/Purchase Invoice display
 *
 * Inspired by mcp-einvoice pattern:
 * - Party columns (Customer/Supplier + Company)
 * - Inline dates
 * - Clickable item rows with drill-down panel
 * - Action buttons with loading state tracking
 * - sendMessage navigation with loading feedback
 * - FeedbackBanner for errors/success
 *
 * @module lib/erpnext/src/ui/invoice-viewer
 */

import { useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, formatCurrency, styles } from "~/shared/theme";
import { ErpNextBrandFooter, ErpNextBrandHeader } from "~/shared/ErpNextBrand";
import { bindHostLocale, useT } from "~/shared/i18n-hook";
import { type InvoiceMessage, invoiceMessage } from "./messages";
import { ActionButton } from "~/shared/ActionButton";
import {
  canRequestUiRefresh,
  extractToolResultText,
  resolveUiRefreshRequest,
  type ToolResultPayload,
  type UiRefreshRequestData,
} from "~/shared/refresh";
import { StatusBadge } from "./components/StatusBadge";
import { ItemDetailPanel } from "./components/ItemDetailPanel";
import { RoundingNote } from "./RoundingNote";
import {
  type ActionFeedbackKind,
  buildDocSubmitArguments,
  formatPurchaseInvoiceAmount,
  interpretPurchaseInvoiceSubmitResult,
  interpretSubmitTransportFailure,
  PURCHASE_INVOICE_DOCTYPE,
  purchaseInvoiceEffectiveTotal,
  resolveInvoiceDoctype,
} from "./submission";

// ============================================================================
// MCP App
// ============================================================================

const app = new App({ name: "Invoice Viewer", version: "3.0.0" });
const REFRESH_INTERVAL_MS = 15_000;
const TOOL_CALL_TIMEOUT_MS = 10_000;

// ============================================================================
// Types
// ============================================================================

interface InvoiceItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  [key: string]: unknown;
  name: string;
  doctype?: string;
  customer?: string;
  customer_name?: string;
  supplier?: string;
  supplier_name?: string;
  company?: string;
  posting_date: string;
  due_date?: string;
  status: string;
  docstatus?: number;
  grand_total: number;
  net_total?: number;
  total_taxes_and_charges?: number;
  outstanding_amount?: number;
  currency?: string;
  disable_rounded_total?: number;
  rounded_total?: number;
  rounding_adjustment?: number;
  base_rounded_total?: number;
  items?: InvoiceItem[];
  contact_email?: string;
  address_display?: string;
}

interface InvoicePayload {
  data?: InvoiceData;
  refreshRequest?: UiRefreshRequestData;
  [key: string]: unknown;
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: i === 1 ? 32 : 20,
            width: `${40 + i * 10}%`,
            marginBottom: 8,
          }}
        />
      ))}
    </div>
  );
}

function InvoiceEmptyState() {
  const t = useT();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        color: colors.text.muted,
        gap: 12,
        flex: 1,
      }}
    >
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        fill="none"
        style={{ opacity: 0.35 }}
      >
        <rect
          x="12"
          y="6"
          width="32"
          height="44"
          rx="3"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M20 16h16M20 22h12M20 28h14M20 34h8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
      <div style={{ fontSize: 13 }}>{t("invoice.no_data")}</div>
    </div>
  );
}

function FeedbackBanner(
  { type, message, onDismiss }: {
    type: ActionFeedbackKind;
    message: string;
    onDismiss?: () => void;
  },
) {
  const t = useT();
  const tone = type === "error"
    ? { fg: colors.error, bg: colors.errorDim }
    : type === "attention"
    ? { fg: colors.warning, bg: colors.warningDim }
    : { fg: colors.success, bg: colors.successDim };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        marginBottom: 12,
        borderRadius: 8,
        fontSize: 12,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={t("common.close")}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function TotalRow(
  { label, value, bold }: { label: string; value: string; bold?: boolean },
) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: bold ? 14 : 13,
      }}
    >
      <span style={{ color: colors.text.secondary }}>{label}</span>
      <span
        dir="auto"
        style={{
          fontFamily: fonts.mono,
          fontWeight: bold ? 700 : 400,
          color: bold ? colors.accent : colors.text.primary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceViewer() {
  const t = useT();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<InvoiceMessage | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<InvoiceMessage | null>(
    null,
  );
  const [actionFeedbackType, setActionFeedbackType] = useState<
    ActionFeedbackKind
  >("success");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [roundingOpen, setRoundingOpen] = useState(false);
  const dataRef = useRef<InvoiceData | null>(null);
  const refreshRequestRef = useRef<UiRefreshRequestData | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);

  function hydrateData(nextData: InvoiceData) {
    dataRef.current = nextData;
    setData(nextData);
  }

  function consumeToolResult(result: ToolResultPayload): boolean {
    if (result.isError) {
      const text = extractToolResultText(result);
      setError(text ?? { key: "invoice.error.tool_error" });
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
      setError({ key: "invoice.error.parse_failed" });
      setLoading(false);
      return false;
    }
  }

  async function requestRefresh(options: { ignoreInterval?: boolean } = {}) {
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
      else setError({ key: "invoice.error.refresh_failed" });
    } catch (cause) {
      setError({
        key: cause instanceof Error && /timed? out/i.test(cause.message)
          ? "common.error.refresh_timeout"
          : "invoice.error.refresh_failed",
      });
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }

  function applyActionFeedback(
    kind: ActionFeedbackKind,
    message: InvoiceMessage,
    refresh: boolean,
    invoice?: Record<string, unknown>,
  ) {
    setActionFeedbackType(kind);
    setActionMessage(message);
    if (invoice && typeof invoice.name === "string") {
      hydrateData(invoice as unknown as InvoiceData);
    }
    if (refresh) {
      setTimeout(() => void requestRefresh({ ignoreInterval: true }), 1500);
    }
  }

  async function callAction(
    key: string,
    toolName: string,
    args: Record<string, unknown>,
    successMsg: InvoiceMessage,
  ) {
    if (!app.getHostCapabilities()?.serverTools) return;
    const isPiSubmit = toolName === "erpnext_doc_submit" &&
      args.doctype === PURCHASE_INVOICE_DOCTYPE;
    setActionLoading(key);
    setActionMessage(null);
    try {
      const result = await app.callServerTool({
        name: toolName,
        arguments: args,
      }, { timeout: TOOL_CALL_TIMEOUT_MS });
      if (isPiSubmit) {
        const requestedName = typeof args.name === "string" ? args.name : "";
        const feedback = interpretPurchaseInvoiceSubmitResult(
          result,
          requestedName,
        );
        applyActionFeedback(
          feedback.kind,
          feedback.messageKey ? { key: feedback.messageKey } : feedback.message,
          feedback.refresh,
          feedback.invoice,
        );
        return;
      }
      if (result.isError) {
        const text = extractToolResultText(result);
        applyActionFeedback(
          "error",
          text ?? { key: "invoice.error.action_failed" },
          false,
        );
      } else {
        applyActionFeedback("success", successMsg, true);
      }
    } catch (cause) {
      if (isPiSubmit) {
        const feedback = interpretSubmitTransportFailure(cause);
        applyActionFeedback(
          feedback.kind,
          feedback.messageKey ? { key: feedback.messageKey } : feedback.message,
          feedback.refresh,
        );
      } else {
        applyActionFeedback(
          "error",
          { key: "invoice.error.action_failed" },
          false,
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function navigate(key: string, message: string) {
    setActionLoading(key);
    try {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    } catch {}
    setActionLoading(null);
  }

  useEffect(() => {
    app.ontoolresult = (result: ToolResultPayload) => {
      consumeToolResult(result);
    };
    app.ontoolinputpartial = () => {
      if (!dataRef.current) setLoading(true);
    };
    app.connect().then(() => bindHostLocale(app)).catch(() => {});
  }, []);

  useEffect(() => {
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
  }, []);

  // Reset expanded item when invoice changes
  useEffect(() => {
    setExpandedIdx(null);
  }, [data?.name]);

  useEffect(() => {
    setRoundingOpen(false);
  }, [
    data?.name,
    data?.disable_rounded_total,
    data?.rounded_total,
    data?.rounding_adjustment,
    data?.grand_total,
  ]);

  if (loading) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <ErpNextBrandHeader />
        <LoadingSkeleton />
        <ErpNextBrandFooter />
      </div>
    );
  }
  if (!data) {
    return (
      <div
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <ErpNextBrandHeader />
        <InvoiceEmptyState />
        <ErpNextBrandFooter />
      </div>
    );
  }

  const ccy = data.currency ?? "USD";
  const isCustomer = !!data.customer;
  const doctype = resolveInvoiceDoctype(data);
  const piGross = doctype === PURCHASE_INVOICE_DOCTYPE
    ? purchaseInvoiceEffectiveTotal(data)
    : null;
  const partyName = data.customer_name ?? data.customer ?? data.supplier_name ??
    data.supplier ?? "—";
  const outstanding = data.outstanding_amount ?? 0;
  const isPaid = outstanding <= 0;
  const items = data.items ?? [];
  const netTotal = data.net_total ?? items.reduce((s, i) => s + i.amount, 0);
  const taxes = data.total_taxes_and_charges ?? (data.grand_total - netTotal);
  const isDraft = data.status === "Draft" || data.docstatus === 0;
  const isSubmitted = data.docstatus === 1;
  const hasServerTools = app.getHostCapabilities()?.serverTools;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <ErpNextBrandHeader />
      <div
        style={{ padding: 16, fontFamily: fonts.sans, flex: 1, maxWidth: 720 }}
      >
        {/* Title + Status */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 4,
              }}
            >
              {t(
                doctype === PURCHASE_INVOICE_DOCTYPE
                  ? "stable.invoice.doctype.purchase"
                  : "stable.invoice.doctype.sales",
              )}
            </div>
            <div
              dir="auto"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: colors.text.primary,
                fontFamily: fonts.mono,
              }}
            >
              {data.name}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <StatusBadge status={data.status} />
              {data.company && (
                <span
                  dir="auto"
                  style={{ fontSize: 11, color: colors.text.faint }}
                >
                  {data.company}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => void requestRefresh({ ignoreInterval: true })}
            disabled={refreshing}
            style={styles.button}
          >
            {refreshing ? "…" : t("common.refresh")}
          </button>
        </div>

        {/* Feedback */}
        {error && (
          <FeedbackBanner
            type="error"
            message={invoiceMessage(error, t)}
            onDismiss={() => setError(null)}
          />
        )}
        {actionMessage && (
          <FeedbackBanner
            type={actionFeedbackType}
            message={invoiceMessage(actionMessage, t)}
          />
        )}

        {/* Parties — two columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 16,
            borderBottom: `1px solid ${colors.border}`,
            paddingBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              {t(
                isCustomer
                  ? "invoice.party.type.customer"
                  : "invoice.party.type.supplier",
              )}
            </div>
            <div
              dir="auto"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: colors.text.primary,
              }}
            >
              {partyName}
            </div>
            {data.contact_email && (
              <div
                dir="auto"
                style={{ fontSize: 11, color: colors.text.secondary }}
              >
                {data.contact_email}
              </div>
            )}
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                color: colors.text.muted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              {t("invoice.header.outstanding")}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: isPaid ? colors.success : colors.error,
                fontFamily: fonts.mono,
              }}
            >
              {formatCurrency(outstanding, ccy)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: isPaid ? colors.success : colors.error,
              }}
            >
              {t(isPaid ? "invoice.status.paid" : "invoice.status.unpaid")}
            </div>
          </div>
        </div>

        {/* Dates — inline */}
        <div
          style={{ display: "flex", gap: 24, marginBottom: 16, fontSize: 12 }}
        >
          <span>
            <span style={{ color: colors.text.muted }}>
              {t("invoice.header.date")}
            </span>
            <span
              dir="auto"
              style={{ color: colors.text.primary, fontWeight: 500 }}
            >
              {data.posting_date}
            </span>
          </span>
          {data.due_date && (
            <span>
              <span style={{ color: colors.text.muted }}>
                {t("invoice.header.due_label")}
              </span>
              <span
                dir="auto"
                style={{ color: colors.text.primary, fontWeight: 500 }}
              >
                {data.due_date}
              </span>
            </span>
          )}
        </div>

        {/* Line Items — clickable for item drill-down */}
        {items.length > 0 && (
          <div
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              overflowX: "auto",
              marginBottom: 16,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...styles.tableHeader,
                      background: colors.bg.surface,
                    }}
                  >
                    {t("invoice.table.col.item")}
                  </th>
                  <th
                    style={{
                      ...styles.tableHeader,
                      background: colors.bg.surface,
                      textAlign: "end",
                    }}
                  >
                    {t("invoice.table.col.qty")}
                  </th>
                  <th
                    style={{
                      ...styles.tableHeader,
                      background: colors.bg.surface,
                      textAlign: "end",
                    }}
                  >
                    {t("invoice.table.col.rate")}
                  </th>
                  <th
                    style={{
                      ...styles.tableHeader,
                      background: colors.bg.surface,
                      textAlign: "end",
                    }}
                  >
                    {t("invoice.table.col.amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isExpanded = expandedIdx === idx;
                  return (
                    <tr key={idx}>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "35% 15% 25% 25%",
                            cursor: hasServerTools ? "pointer" : "default",
                            transition: "background 0.1s",
                            background: isExpanded
                              ? colors.bg.hover
                              : "transparent",
                          }}
                          onClick={hasServerTools
                            ? () => setExpandedIdx(isExpanded ? null : idx)
                            : undefined}
                          onMouseEnter={(e) => {
                            if (!isExpanded) {
                              (e.currentTarget as HTMLElement).style
                                .background = colors.bg.hover;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) {
                              (e.currentTarget as HTMLElement).style
                                .background = "transparent";
                            }
                          }}
                        >
                          <div style={styles.tableCell}>
                            <div
                              dir="auto"
                              style={{
                                fontWeight: 500,
                                color: colors.text.primary,
                              }}
                            >
                              {item.item_name ?? item.item_code}
                            </div>
                            {item.item_name && (
                              <div
                                dir="auto"
                                style={{
                                  fontSize: 11,
                                  color: colors.text.faint,
                                  fontFamily: fonts.mono,
                                }}
                              >
                                {item.item_code}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              ...styles.tableCell,
                              textAlign: "end",
                              fontFamily: fonts.mono,
                            }}
                          >
                            {item.qty}
                          </div>
                          <div
                            style={{
                              ...styles.tableCell,
                              textAlign: "end",
                              fontFamily: fonts.mono,
                              color: colors.text.secondary,
                            }}
                          >
                            {formatCurrency(item.rate, ccy)}
                          </div>
                          <div
                            style={{
                              ...styles.tableCell,
                              textAlign: "end",
                              fontFamily: fonts.mono,
                              fontWeight: 500,
                            }}
                          >
                            {formatCurrency(item.amount, ccy)}
                          </div>
                        </div>
                        {isExpanded && (
                          <ItemDetailPanel
                            app={app}
                            itemCode={item.item_code}
                            onClose={() => setExpandedIdx(null)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals — aligned right */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 16,
            width: "100%",
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: "1 1 220px",
              maxWidth: 360,
              minWidth: 0,
              borderTop: `1px solid ${colors.border}`,
              paddingTop: 8,
            }}
          >
            <TotalRow
              label={t("invoice.totals.subtotal")}
              value={formatCurrency(netTotal, ccy)}
            />
            {taxes !== 0 && (
              <TotalRow
                label={t("invoice.totals.taxes")}
                value={formatCurrency(taxes, ccy)}
              />
            )}
            <TotalRow
              label={t("invoice.totals.grand_total")}
              value={formatCurrency(data.grand_total, ccy)}
              bold={!piGross?.ok}
            />
            {piGross?.ok && piGross.roundingAdjustment !== 0 && (
              <RoundingNote
                calculatedTotal={data.grand_total}
                roundingAdjustment={piGross.roundingAdjustment}
                invoiceTotal={piGross.amount}
                currency={piGross.currency}
                isDraft={isDraft}
                open={roundingOpen}
                onToggle={() => setRoundingOpen((current) => !current)}
                panelId={`invoice-rounding-note-${
                  data.name.replace(/[^A-Za-z0-9_-]/g, "-")
                }`}
              />
            )}
            {piGross?.ok && piGross.roundingAdjustment === 0 && (
              <TotalRow
                label={t("document.purchase_invoice.total")}
                value={formatPurchaseInvoiceAmount(
                  piGross.amount,
                  piGross.currency,
                )}
                bold
              />
            )}
          </div>
        </div>

        {/* Actions */}
        {hasServerTools && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              padding: "12px 0",
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {isDraft && (
              <ActionButton
                label={piGross?.ok
                  ? t("invoice.confirm.submit.action_with_amount", {
                    amount: formatPurchaseInvoiceAmount(
                      piGross.amount,
                      piGross.currency,
                    ),
                  })
                  : t("invoice.btn.submit.label")}
                variant="success"
                confirm
                loading={actionLoading === "submit"}
                onClick={() => {
                  const built = buildDocSubmitArguments(data);
                  if (!built.ok) {
                    applyActionFeedback(
                      "error",
                      built.errorKey ? { key: built.errorKey } : built.error,
                      false,
                    );
                    return;
                  }
                  void callAction(
                    "submit",
                    "erpnext_doc_submit",
                    built.args,
                    { key: "invoice.action.submitted" },
                  );
                }}
              />
            )}
            {isSubmitted && (
              <ActionButton
                label={t("invoice.btn.cancel.label")}
                variant="error"
                confirm
                loading={actionLoading === "cancel"}
                onClick={() =>
                  callAction("cancel", "erpnext_doc_cancel", {
                    doctype,
                    name: data.name,
                  }, { key: "invoice.action.cancelled" })}
              />
            )}
            <ActionButton
              label={t("doclist.hint.payments")}
              loading={actionLoading === "nav_payments"}
              onClick={() =>
                navigate(
                  "nav_payments",
                  t("stable.invoice.navigation.payments", {
                    doctype,
                    name: data.name,
                  }),
                )}
            />
            {(data.customer ?? data.supplier) && (
              <ActionButton
                label={t(
                  isCustomer
                    ? "stable.invoice.navigation.customer_label"
                    : "stable.invoice.navigation.supplier_label",
                )}
                loading={actionLoading === "nav_party"}
                onClick={() => {
                  const party = data.customer ?? data.supplier;
                  navigate(
                    "nav_party",
                    t(
                      isCustomer
                        ? "stable.invoice.navigation.customer"
                        : "stable.invoice.navigation.supplier",
                      { party: party ?? "" },
                    ),
                  );
                }}
              />
            )}
          </div>
        )}
      </div>
      <ErpNextBrandFooter />
    </div>
  );
}
