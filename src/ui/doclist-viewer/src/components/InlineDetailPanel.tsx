/** @jsxImportSource preact */
/**
 * L'inspecteur.
 *
 * La maquette le sort de la ligne : il n'est plus une ligne dépliée sous le
 * document, mais une colonne de 268 px à droite du tableau, sur fond enfoncé.
 * La liste reste donc lisible pendant qu'on inspecte, et le tableau ne saute
 * plus quand on ouvre une pièce.
 */

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { App } from "@modelcontextprotocol/ext-apps";
import { Button, InfoRow, Label, Skeleton } from "~/shared/ui";
import { useT } from "~/shared/i18n-hook";
import { ConfirmSheet, useConfirm } from "~/shared/confirm";
import { TONE_AMOUNT, toneForStatus } from "~/shared/status";
import { StatusBadge, StatusCell } from "./StatusCell";
import type { SendMessageHint } from "../types";
import { formatCell } from "../helpers";
import type { ViewerLayout } from "~/shared/useViewerLayout";

/** Champs mis en avant sous le titre, dans cet ordre, avant le reste. */
const LEAD_FIELDS = ["grand_total", "outstanding_amount", "total"];

export function InlineDetailPanel(
  {
    app,
    data,
    loading,
    doctype,
    sendMessageHints,
    fixture,
    layout,
    onClose,
    onAction,
  }: {
    app: App;
    data: Record<string, unknown> | null;
    loading: boolean;
    doctype?: string;
    sendMessageHints?: SendMessageHint[];
    fixture?: boolean;
    /** Mise en page courante — détermine le header de l'inspecteur et les tailles. */
    layout?: ViewerLayout;
    onClose: () => void;
    onAction: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<boolean>;
  },
) {
  const t = useT();
  const narrow = layout !== "wide";
  const [actLoading, setActLoading] = useState<string | null>(null);
  const confirm = useConfirm();
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);

  async function act(
    key: string,
    tool: string,
    args: Record<string, unknown>,
    msg: string,
  ) {
    if (fixture) return;
    setActLoading(key);
    setActMsg(null);
    const ok = await onAction(tool, args);
    setActOk(ok);
    setActMsg(ok ? msg : t("doclist.detail.action_failed"));
    setActLoading(null);
  }

  if (loading) {
    return (
      <InspectorFrame narrow={narrow} onClose={onClose}>
        <div class="flex flex-col gap-3.5 p-3.5">
          <Skeleton class="h-[15px] w-3/4" />
          <Skeleton class="h-[15px] w-1/3" />
          {Array.from(
            { length: 5 },
            (_, index) => <Skeleton key={index} class="h-3" />,
          )}
        </div>
      </InspectorFrame>
    );
  }
  if (!data) return null;

  const entries: { id: string; label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_") || key === "refreshRequest" || key === "doctype") {
      continue;
    }
    if (value == null) continue;
    const label = key.replace(/_/g, " ").replace(/\./g, " > ");
    if (Array.isArray(value)) {
      entries.push({
        id: key,
        label,
        value: t("doclist.detail.array_count", {
          n: value.length,
          s: value.length > 1 ? "s" : "",
        }),
      });
    } else if (typeof value === "object") {
      for (
        const [sub, subValue] of Object.entries(
          value as Record<string, unknown>,
        )
      ) {
        if (subValue != null && typeof subValue !== "object") {
          entries.push({
            id: `${key}.${sub}`,
            label: `${label} > ${sub.replace(/_/g, " ")}`,
            value: String(subValue),
          });
        }
      }
    } else {
      entries.push({ id: key, label, value: formatCell(value) });
    }
  }

  const docName = String(data.name ?? "");
  const status = String(data.status ?? "");
  const tone = toneForStatus(status);
  const isDraft = status === "Draft" || data.docstatus === 0;
  const isSubmitted = data.docstatus === 1;

  const lead = entries.filter((entry) => LEAD_FIELDS.includes(entry.id));
  const rest = entries.filter((entry) => !LEAD_FIELDS.includes(entry.id));

  /* Le libellé vient du catalogue quand le serveur donne une clé, sinon du
     serveur lui-même (anglais). */
  const hintLabel = (hint: SendMessageHint) => {
    const key = hint.key ? `doclist.hint.${hint.key}` : null;
    const translated = key ? t(key) : null;
    return translated && translated !== key ? translated : hint.label;
  };
  const hints = sendMessageHints?.map((hint) => ({
    ...hint,
    label: hintLabel(hint),
    message: hint.message
      .replace(/\{id\}/g, docName)
      .replace(/\{doctype\}/g, doctype ?? ""),
  })) ?? [];

  function ask(text: string) {
    void app.sendMessage({
      role: "user",
      content: [{ type: "text", text }],
    }).catch(() => {});
  }

  return (
    <InspectorFrame narrow={narrow} onClose={onClose}>
      <div class="flex flex-col gap-3.5 p-3.5">
        <div class="flex flex-col gap-1.5">
          <span class="break-all font-display text-[15px] font-semibold text-ink">
            {docName || t("doclist.detail.document_fallback")}
          </span>
          <div class="flex items-center gap-[7px]">
            {/* En narrow le badge adopte la forme pill (radius-pill 13px) pour la maquette mobile. */}
            {status && narrow
              ? (
                <StatusBadge tone={toneForStatus(status)} pill>
                  {status}
                </StatusBadge>
              )
              : status
              ? <StatusCell value={status} />
              : null}
            {data.docstatus != null && (
              <span class="font-mono text-chip text-ink-faint">
                docstatus {String(data.docstatus)}
              </span>
            )}
          </div>
        </div>

        {rest.length > 0 && (
          <div class="flex flex-col gap-[9px] border-t border-line-soft pt-3">
            {rest.slice(0, 10).map((entry) => (
              <InfoRow key={entry.id} label={entry.label}>
                {entry.value}
              </InfoRow>
            ))}
          </div>
        )}

        {lead.length > 0 && (
          <div class="flex flex-col gap-1.5 border-t border-line-soft pt-3">
            {lead.map((entry, index) => (
              <div
                key={entry.id}
                class="flex items-baseline justify-between gap-2.5"
              >
                <span class="font-mono text-chip text-ink-faint">
                  {entry.label}
                </span>
                <span
                  class={[
                    "font-mono tabular-nums",
                    // Le dernier montant de la pile est le chiffre qui compte.
                    // En narrow il monte à 20 px (text-metric-unit) pour la lisibilité mobile.
                    index === lead.length - 1
                      ? `${
                        narrow
                          ? "text-metric-unit tracking-tight"
                          : "text-total"
                      } font-semibold ${TONE_AMOUNT[tone]}`
                      : "text-body text-ink-2",
                  ].join(" ")}
                >
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {actMsg && (
          <p
            class={`font-mono text-chip ${actOk ? "text-ok" : "text-bad"}`}
          >
            {actMsg}
          </p>
        )}

        {/* En narrow les boutons ont une cible tactile min-h-[44px] (maquette mobile). */}
        <div
          class={`flex flex-col border-t border-line-soft pt-3 ${
            narrow ? "gap-2" : "gap-1.5"
          }`}
        >
          {hints.map((hint, index) => (
            <Button
              key={index}
              variant={index === 0 ? "accent" : "secondary"}
              disabled={fixture}
              title={fixture ? t("doclist.preview.no_host") : hint.label}
              class={narrow
                ? "min-h-[44px] rounded-control text-body"
                : undefined}
              onClick={() => ask(hint.message)}
            >
              {hint.label}
            </Button>
          ))}
          {docName && doctype && hints.length === 0 && (
            <Button
              variant="accent"
              disabled={fixture}
              title={fixture
                ? t("doclist.preview.no_host")
                : t("doclist.detail.full_detail")}
              class={narrow
                ? "min-h-[44px] rounded-control text-body"
                : undefined}
              onClick={() =>
                ask(
                  t("doclist.detail.full_detail_message", {
                    doctype: doctype ?? "",
                    id: docName,
                  }),
                )}
            >
              {t("doclist.detail.full_detail")}
            </Button>
          )}
          {isDraft && docName && (
            <Button
              variant="secondary"
              disabled={actLoading === "submit" || fixture}
              title={fixture
                ? t("doclist.preview.no_host")
                : t("doclist.detail.action.submit_title")}
              class={narrow
                ? "min-h-[44px] rounded-control text-body"
                : undefined}
              onClick={() =>
                confirm.request({
                  subject: `${doctype ?? ""} ${docName}`.trim(),
                  title: t("doclist.confirm.submit"),
                  detail: t("doclist.confirm.submit.detail"),
                  actionLabel: t("doclist.confirm.submit.action"),
                  onConfirm: () =>
                    void act("submit", "erpnext_doc_submit", {
                      doctype: doctype ?? "",
                      name: docName,
                    }, t("doclist.detail.action.submit_ok")),
                })}
            >
              {actLoading === "submit" ? "…" : t("common.submit")}
            </Button>
          )}
          {isSubmitted && docName && (
            <Button
              variant="danger"
              disabled={actLoading === "cancel" || fixture}
              title={fixture
                ? t("doclist.preview.no_host")
                : t("doclist.detail.action.cancel_label")}
              class={narrow
                ? "min-h-[44px] rounded-control text-body"
                : undefined}
              onClick={() =>
                confirm.request({
                  subject: `${doctype ?? ""} ${docName}`.trim(),
                  title: t("doclist.confirm.cancel"),
                  detail: t("doclist.confirm.cancel.detail"),
                  actionLabel: t("doclist.confirm.cancel.action"),
                  onConfirm: () =>
                    void act("cancel", "erpnext_doc_cancel", {
                      doctype: doctype ?? "",
                      name: docName,
                    }, t("doclist.detail.action.cancel_ok")),
                })}
            >
              {actLoading === "cancel"
                ? "…"
                : t("doclist.detail.action.cancel_label")}
            </Button>
          )}
        </div>
      </div>
      <ConfirmSheet confirm={confirm} />
    </InspectorFrame>
  );
}

function InspectorFrame(
  { children, narrow, onClose }: {
    children: ComponentChildren;
    /** En narrow : header = ‹ liste + label (sans ×). En wide : label + ×. */
    narrow?: boolean;
    onClose: () => void;
  },
) {
  const t = useT();
  return (
    <aside class="scroll-slim flex min-h-0 flex-col overflow-y-auto bg-sunken">
      <div class="flex shrink-0 items-center justify-between border-b border-line px-3.5 py-[11px]">
        {narrow
          ? (
            <>
              {/* Narrow : ‹ liste à gauche = retour, label à droite, pas de × */}
              <button
                type="button"
                onClick={onClose}
                aria-label={t("doclist.detail.back_to_list")}
                class="font-mono text-chip text-accent-text transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {t("doclist.detail.back_list_label")}
              </button>
              <Label>{t("doclist.detail.inspector_label")}</Label>
            </>
          )
          : (
            <>
              {/* Wide : label à gauche, × à droite */}
              <Label>{t("doclist.detail.inspector_label")}</Label>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("doclist.detail.close_inspector")}
                class="text-lede leading-none text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                ×
              </button>
            </>
          )}
      </div>
      {children}
    </aside>
  );
}
