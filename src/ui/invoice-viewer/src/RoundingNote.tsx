import { useEffect, useRef, useState } from "react";
import { colors, fonts } from "~/shared/theme";
import {
  formatPurchaseInvoiceAmount,
  formatSignedPurchaseInvoiceAmount,
} from "./submission";

export function RoundingNote({
  calculatedTotal,
  roundingAdjustment,
  invoiceTotal,
  currency,
  isDraft,
  open,
  onToggle,
  panelId,
}: {
  calculatedTotal: number;
  roundingAdjustment: number;
  invoiceTotal: number;
  currency: string;
  isDraft: boolean;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = open || (!dismissed && (hovered || focused));

  useEffect(() => {
    if (!visible) return;
    const closeOutside = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setHovered(false);
      setDismissed(true);
      if (open) onToggle();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [visible, open, onToggle]);

  const signed = formatSignedPurchaseInvoiceAmount(
    roundingAdjustment,
    currency,
  );
  const accessibleName = roundingAccessibleName(
    roundingAdjustment,
    invoiceTotal,
    currency,
  );
  const hint = isDraft
    ? "To keep the calculated total, enable “Disable Rounded Total” on the draft invoice, then save and review its total."
    : "“Disable Rounded Total” applies before submission. Enable it on future invoices to keep the calculated total.";

  return (
    <div
      ref={containerRef}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        setDismissed(true);
        if (open) onToggle();
      }}
      style={{ position: "relative", minWidth: 0, maxWidth: "100%" }}
    >
      <style>
        {`
          .invoice-rounding-note-btn:focus { outline: none; }
          .invoice-rounding-note-btn:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
          }
        `}
      </style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          padding: "4px 0",
          fontSize: 14,
        }}
      >
        <span style={{ color: colors.text.secondary }}>Invoice Total</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 4,
            minWidth: 0,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontWeight: 700,
              color: colors.accent,
            }}
          >
            {formatPurchaseInvoiceAmount(invoiceTotal, currency)}
          </span>
          <button
            type="button"
            className="invoice-rounding-note-btn"
            aria-expanded={visible}
            aria-controls={panelId}
            aria-label={accessibleName}
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              setHovered(true);
              setDismissed(false);
            }}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
            }}
            onBlur={() => setFocused(false)}
            onClick={() => {
              setDismissed(open);
              onToggle();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              flexShrink: 0,
              padding: 3,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: visible ? colors.accent : colors.text.muted,
              cursor: "pointer",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="10" cy="10" r="7.5" />
              <path d="M10 9v5" />
              <circle
                cx="10"
                cy="6.5"
                r="0.75"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
        </div>
      </div>
      <div
        id={panelId}
        hidden={!visible}
        role="region"
        aria-label="Rounding details"
        style={{
          display: visible ? "block" : "none",
          position: "absolute",
          top: "100%",
          right: 0,
          zIndex: 10,
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          borderRadius: 8,
          background: colors.bg.elevated,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
          fontSize: 12,
          color: colors.text.secondary,
          maxWidth: "100%",
          overflowWrap: "anywhere",
        }}
      >
        <PanelRow
          label="Calculated"
          value={formatPurchaseInvoiceAmount(calculatedTotal, currency)}
        />
        <PanelRow label="Rounding" value={signed} />
        <PanelRow
          label="Invoice Total"
          value={formatPurchaseInvoiceAmount(invoiceTotal, currency)}
          bold
        />
        <p style={{ margin: "8px 0 0", lineHeight: 1.45 }}>{hint}</p>
      </div>
    </div>
  );
}

function roundingAccessibleName(
  adjustment: number,
  invoiceTotal: number,
  currency: string,
): string {
  const signed = formatSignedPurchaseInvoiceAmount(adjustment, currency);
  if (invoiceTotal < 0) {
    return `Rounding adjustment ${signed}`;
  }
  if (adjustment > 0) {
    return `Rounding adds ${
      formatPurchaseInvoiceAmount(adjustment, currency)
    } to the invoice total`;
  }
  return `Rounding reduces the invoice total by ${
    formatPurchaseInvoiceAmount(Math.abs(adjustment), currency)
  }`;
}

function PanelRow(
  { label, value, bold }: { label: string; value: string; bold?: boolean },
) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "2px 0",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: fonts.mono,
          fontWeight: bold ? 700 : 500,
          color: bold ? colors.accent : colors.text.primary,
        }}
      >
        {value}
      </span>
    </div>
  );
}
