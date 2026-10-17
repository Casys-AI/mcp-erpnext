/** @jsxImportSource preact */

import { formatNumber } from "../format.ts";
import { useT } from "../i18n-hook.ts";
import { cx } from "../ui.tsx";
import { documentPreviewFieldsOf } from "./preview-fields.ts";
import { formatDocumentPreviewText } from "./preview-format.ts";
import { companyFieldLabel } from "./company-field-labels.ts";

export function DocumentPreviewFields({ document }: {
  document: Record<string, unknown>;
}) {
  const t = useT();
  const fields = documentPreviewFieldsOf(document);
  if (fields.length === 0) return null;
  return (
    <dl class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-1.5 p-4">
      {fields.map((field) => (
        <div key={field.key} class="min-w-0">
          <dt class="font-mono text-chip text-ink-faint [overflow-wrap:anywhere]">
            {(document.doctype === "Company"
              ? companyFieldLabel(field.key, t)
              : undefined) ??
              field.key.replace(/_/g, " ").replace(/\./g, " > ")}
          </dt>
          <dd
            class={cx(
              "text-note text-ink-2 [overflow-wrap:anywhere]",
              ["grand_total", "total", "amount"].includes(field.key) &&
                "font-semibold text-ink",
            )}
          >
            {field.arrayCount !== undefined
              ? t("doclist.detail.array_count", {
                n: field.arrayCount,
                s: field.arrayCount > 1 ? "s" : "",
              })
              : typeof field.value === "number"
              ? formatNumber(field.value, Number.isInteger(field.value) ? 0 : 2)
              : typeof field.value === "boolean"
              ? t(
                field.value
                  ? "document.boolean.true"
                  : "document.boolean.false",
              )
              : formatDocumentPreviewText(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
