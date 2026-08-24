/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import { formatNumber, toNumber } from "../format";
import { type TFunction, useT } from "../i18n-hook";
import { TONE_BADGE, toneForStatus } from "../status";
import type { ViewerLayout } from "../useViewerLayout";
import { CountBadge, cx, Label, ProgressBar } from "../ui";
import type {
  DocumentCollectionModel,
  DocumentDisplayValue,
  DocumentFieldModel,
} from "./types.ts";

export interface ScalarFieldsProps {
  fields: readonly DocumentFieldModel[];
  longFields?: readonly DocumentFieldModel[];
  progressFields?: readonly DocumentFieldModel[];
  collections?: readonly DocumentCollectionModel[];
  systemFields?: readonly DocumentFieldModel[];
  layout: ViewerLayout;
  /** `null` retire le titre quand la surface hôte le fournit déjà. */
  heading?: string | null;
  class?: string;
}

function displayValue(value: DocumentDisplayValue, t: TFunction): string {
  if (value === null || value === "") return t("document.empty_value");
  if (typeof value === "boolean") {
    return t(value ? "document.boolean.true" : "document.boolean.false");
  }
  if (typeof value === "number") {
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  return value;
}

export function DocumentFieldValue(
  { field, class: klass }: { field: DocumentFieldModel; class?: string },
) {
  const t = useT();
  if (field.kind === "status" && field.value !== null) {
    const status = String(field.value);
    return (
      <span
        class={cx(
          "inline-flex rounded-badge px-[7px] py-0.5 font-mono text-micro uppercase tracking-chip",
          TONE_BADGE[toneForStatus(status)],
          klass,
        )}
      >
        {status}
      </span>
    );
  }
  return (
    <span
      class={cx(
        field.kind === "number" || field.kind === "date" ||
          field.kind === "datetime"
          ? "font-mono tabular-nums"
          : undefined,
        field.kind === "empty" ? "text-ink-dim" : undefined,
        klass,
      )}
    >
      {displayValue(field.value, t)}
    </span>
  );
}

function FieldsGrid(
  { fields, layout }: {
    fields: readonly DocumentFieldModel[];
    layout: ViewerLayout;
  },
) {
  return (
    <dl
      class={cx(
        "grid gap-x-7",
        layout === "wide" ? "grid-cols-2 gap-y-2" : "grid-cols-1 gap-y-1",
      )}
    >
      {fields.map((field) => (
        <div
          key={field.key}
          class={cx(
            "flex min-w-0 items-baseline justify-between gap-2.5",
            layout !== "wide" && "min-h-6",
          )}
        >
          <dt class="shrink-0 font-mono text-chip text-ink-faint">
            {field.label}
          </dt>
          <dd class="min-w-0 truncate text-right text-note text-ink-2">
            <DocumentFieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section(
  { label, aside, children, first }: {
    label: string | null;
    aside?: ComponentChildren;
    children: ComponentChildren;
    first?: boolean;
  },
) {
  return (
    <section
      class={cx(
        "flex flex-col gap-2 px-4 py-3.5",
        !first && "border-t border-line-soft",
      )}
    >
      {(label || aside) && (
        <div class="flex items-baseline justify-between gap-3">
          {label ? <Label>{label}</Label> : <span />}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function ScalarFields({
  fields,
  longFields = [],
  progressFields = [],
  collections = [],
  systemFields = [],
  layout,
  heading,
  class: klass,
}: ScalarFieldsProps) {
  const t = useT();
  const title = heading === undefined ? t("document.fields") : heading;
  const hasContent = fields.length > 0 || longFields.length > 0 ||
    progressFields.length > 0 || collections.length > 0 ||
    systemFields.length > 0;
  if (!hasContent) return null;

  let first = true;
  const consumeFirst = () => {
    const current = first;
    first = false;
    return current;
  };

  return (
    <div class={cx("flex flex-col", klass)}>
      {fields.length > 0 && (
        <Section label={title} first={consumeFirst()}>
          <FieldsGrid fields={fields} layout={layout} />
        </Section>
      )}

      {longFields.map((field) => (
        <Section key={field.key} label={field.label} first={consumeFirst()}>
          {field.kind === "json"
            ? (
              <pre class="scroll-slim max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line-soft bg-sunken p-2.5 font-mono text-chip leading-relaxed text-ink-2">
                {displayValue(field.value, t)}
              </pre>
            )
            : (
              <p class="whitespace-pre-wrap break-words text-cell leading-[1.55] text-ink-2">
                {displayValue(field.value, t)}
              </p>
            )}
        </Section>
      ))}

      {progressFields.map((field) => {
        const value = toNumber(field.value) ?? 0;
        return (
          <Section
            key={field.key}
            label={field.label}
            first={consumeFirst()}
            aside={
              <span class="font-mono text-meta tabular-nums text-ink-muted">
                {t("document.progress_value", {
                  value: formatNumber(value, 0),
                })}
              </span>
            }
          >
            <ProgressBar value={value} />
          </Section>
        );
      })}

      {collections.map((collection) => (
        <Section
          key={collection.key}
          label={collection.label}
          first={consumeFirst()}
        >
          {collection.values.length === 0
            ? (
              <span class="font-mono text-chip text-ink-dim">
                {t("document.empty_value")}
              </span>
            )
            : (
              <div class="flex flex-wrap gap-1.5">
                {collection.values.map((value, index) => (
                  <span
                    key={`${collection.key}-${index}`}
                    class="max-w-full truncate rounded-chip border border-line bg-control px-2 py-1 font-mono text-chip text-ink-muted"
                  >
                    {displayValue(value, t)}
                  </span>
                ))}
              </div>
            )}
        </Section>
      ))}

      {systemFields.length > 0 && (
        <details
          class={cx(
            "group border-t border-line-soft px-4 py-3",
            first && "border-t-0",
          )}
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 rounded-control font-mono text-micro uppercase tracking-label text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span>{t("document.system_fields")}</span>
            <CountBadge narrow>{systemFields.length}</CountBadge>
          </summary>
          <div class="pt-3">
            <FieldsGrid fields={systemFields} layout={layout} />
          </div>
        </details>
      )}
    </div>
  );
}
