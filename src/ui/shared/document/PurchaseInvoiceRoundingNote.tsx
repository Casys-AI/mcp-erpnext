/** @jsxImportSource preact */

import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useT } from "../i18n-hook.ts";
import { cx } from "../ui.tsx";
import {
  clampAnchoredPopover,
  DISABLE_ROUNDED_TOTAL_LABEL,
  formatPurchaseInvoiceAmount,
  formatSignedPurchaseInvoiceAmount,
  purchaseInvoiceRoundingAria,
} from "./purchase-invoice.ts";

const LEAVE_MS = 120;

export function PurchaseInvoiceRoundingNote({
  calculatedTotal,
  roundingAdjustment,
  invoiceTotal,
  currency,
  isDraft,
  panelId,
}: {
  calculatedTotal: number;
  roundingAdjustment: number;
  invoiceTotal: number;
  currency: string;
  isDraft: boolean;
  panelId: string;
}) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const visible = pinned || (!dismissed && (hovered || focused));
  const signed = formatSignedPurchaseInvoiceAmount(
    roundingAdjustment,
    currency,
  );
  const aria = purchaseInvoiceRoundingAria(
    roundingAdjustment,
    invoiceTotal,
    currency,
  );
  const hint = t(
    isDraft
      ? "document.purchase_invoice.hint.draft"
      : "document.purchase_invoice.hint.submitted",
    { label: DISABLE_ROUNDED_TOTAL_LABEL },
  );

  function cancelLeave() {
    if (leaveTimerRef.current === null) return;
    clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  }

  function scheduleLeave() {
    cancelLeave();
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setHovered(false);
    }, LEAVE_MS);
  }

  function dismiss() {
    cancelLeave();
    setHovered(false);
    setFocused(false);
    setPinned(false);
    setDismissed(true);
  }

  useEffect(() => {
    setHovered(false);
    setFocused(false);
    setPinned(false);
    setDismissed(false);
  }, [panelId, calculatedTotal, roundingAdjustment, invoiceTotal, currency]);

  useEffect(() => () => cancelLeave(), []);

  useEffect(() => {
    if (!visible) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null);
      return;
    }
    function update() {
      const anchor = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor) return;
      const size = panel
        ? { width: panel.offsetWidth, height: panel.offsetHeight }
        : { width: 260, height: 160 };
      setCoords(
        clampAnchoredPopover(
          anchor,
          { width: window.innerWidth, height: window.innerHeight },
          size,
        ),
      );
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [visible, hint, signed]);

  const panel = visible
    ? createPortal(
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label={t("document.purchase_invoice.details")}
        onPointerEnter={() => {
          cancelLeave();
          setHovered(true);
          setDismissed(false);
        }}
        onPointerLeave={scheduleLeave}
        class={cx(
          "fixed z-50 box-border w-max max-w-[min(17.5rem,calc(100vw-1rem))]",
          "rounded-control border border-line bg-surface p-2.5 shadow-modal",
          "text-chip text-ink-2",
        )}
        style={{
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? "visible" : "hidden",
        }}
      >
        <PanelRow
          label={t("document.purchase_invoice.calculated")}
          value={formatPurchaseInvoiceAmount(calculatedTotal, currency)}
        />
        <PanelRow
          label={t("document.purchase_invoice.rounding")}
          value={signed}
        />
        <PanelRow
          label={t("document.purchase_invoice.total")}
          value={formatPurchaseInvoiceAmount(invoiceTotal, currency)}
          bold
        />
        <p class="mt-2 mb-0 leading-snug">{hint}</p>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={visible}
        aria-controls={panelId}
        aria-label={t(aria.key, aria.params)}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          cancelLeave();
          setHovered(true);
          setDismissed(false);
        }}
        onPointerLeave={scheduleLeave}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => setFocused(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelLeave();
          setPinned((current) => !current);
          setDismissed(pinned);
        }}
        class={cx(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
          "bg-transparent text-ink-faint transition-colors",
          "hover:text-accent",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          visible && "text-accent",
        )}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
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
      {panel}
    </>
  );
}

function PanelRow(
  { label, value, bold }: { label: string; value: string; bold?: boolean },
) {
  return (
    <div class="flex items-baseline justify-between gap-3 py-0.5">
      <span class="text-ink-faint">{label}</span>
      <span
        class={cx(
          "font-mono tabular-nums",
          bold ? "font-bold text-accent" : "font-medium text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
