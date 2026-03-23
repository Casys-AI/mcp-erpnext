/** Expandable detail panel shown under a clicked row */

import { useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { colors, fonts, styles } from "~/shared/theme";
import { ActionButton } from "~/shared/ActionButton";
import { InfoField } from "~/shared/InfoField";
import { DOC_STATUS } from "./StatusCell";
import type { SendMessageHint } from "../types";
import { formatCell } from "../helpers";

export function InlineDetailPanel(
  { app, data, loading, doctype, sendMessageHints, onClose, onAction }: {
    app: App;
    data: Record<string, unknown> | null;
    loading: boolean;
    doctype?: string;
    sendMessageHints?: SendMessageHint[];
    onClose: () => void;
    onAction: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<boolean>;
  },
) {
  const [actLoading, setActLoading] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [actOk, setActOk] = useState(true);

  if (loading) {
    return (
      <div style={{ padding: 16, background: colors.bg.surface }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 14, width: `${30 + i * 15}%`, marginBottom: 8 }}
          />
        ))}
      </div>
    );
  }
  if (!data) return null;

  async function act(
    key: string,
    tool: string,
    args: Record<string, unknown>,
    msg: string,
  ) {
    setActLoading(key);
    setActMsg(null);
    const ok = await onAction(tool, args);
    setActOk(ok);
    setActMsg(ok ? msg : "Action failed");
    setActLoading(null);
  }

  // Flatten nested objects for display
  const flatEntries: [string, string][] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_") || k === "refreshRequest" || k === "doctype") {
      continue;
    }
    if (v == null) continue;
    if (Array.isArray(v)) {
      flatEntries.push([k, `${v.length} item${v.length > 1 ? "s" : ""}`]);
    } else if (typeof v === "object") {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv != null && typeof sv !== "object") {
          flatEntries.push([`${k}.${sk}`, String(sv)]);
        }
      }
    } else {
      flatEntries.push([k, formatCell(v)]);
    }
  }

  const docName = String(data.name ?? "");
  const status = String(data.status ?? data.docstatus ?? "");
  const statusScheme = DOC_STATUS[status];
  const isDraft = status === "Draft" || data.docstatus === 0;
  const isSubmitted = data.docstatus === 1;

  // Build sendMessage hints — replace {id} with doc name
  const hints = sendMessageHints?.map((h) => ({
    ...h,
    message: h.message.replace(/\{id\}/g, docName).replace(
      /\{doctype\}/g,
      doctype ?? "",
    ),
  })) ?? [];

  return (
    <div
      style={{
        padding: 16,
        background: colors.bg.surface,
        borderTop: `2px solid ${colors.accent}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: colors.text.primary,
              fontFamily: fonts.mono,
            }}
          >
            {docName}
          </span>
          {statusScheme && (
            <span style={styles.badge(statusScheme.color, statusScheme.bg)}>
              {status}
            </span>
          )}
          {doctype && (
            <span style={{ fontSize: 11, color: colors.text.muted }}>
              {doctype}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ ...styles.button, padding: "2px 8px", fontSize: 11 }}
        >
          ✕
        </button>
      </div>

      {/* Info grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {flatEntries.slice(0, 12).map(([k, v]) => (
          <InfoField
            key={k}
            label={k.replace(/_/g, " ").replace(/\./g, " > ")}
            value={v}
            bold={k === "grand_total" || k === "total" || k === "amount"}
          />
        ))}
      </div>

      {/* Action feedback */}
      {actMsg && (
        <div
          style={{
            fontSize: 11,
            color: actOk ? colors.success : colors.error,
            marginBottom: 8,
          }}
        >
          {actMsg}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          paddingTop: 8,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        {isDraft && docName && (
          <ActionButton
            label="Submit"
            variant="success"
            loading={actLoading === "submit"}
            confirm
            onClick={() =>
              act("submit", "erpnext_doc_submit", {
                doctype: doctype ?? "",
                name: docName,
              }, "Submitted")}
          />
        )}

        {isSubmitted && docName && (
          <ActionButton
            label="Cancel"
            variant="error"
            loading={actLoading === "cancel"}
            confirm
            onClick={() =>
              act("cancel", "erpnext_doc_cancel", {
                doctype: doctype ?? "",
                name: docName,
              }, "Cancelled")}
          />
        )}

        {hints.map((hint, i) => (
          <ActionButton
            key={i}
            label={hint.label}
            onClick={async () => {
              try {
                await app.sendMessage({
                  role: "user",
                  content: [{ type: "text", text: hint.message }],
                });
              } catch { /* host may not support sendMessage */ }
            }}
          />
        ))}

        {docName && doctype && hints.length === 0 && (
          <ActionButton
            label="Full details"
            onClick={async () => {
              try {
                await app.sendMessage({
                  role: "user",
                  content: [{
                    type: "text",
                    text: `Show me the full details of ${doctype} ${docName}`,
                  }],
                });
              } catch { /* host may not support sendMessage */ }
            }}
          />
        )}
      </div>
    </div>
  );
}
