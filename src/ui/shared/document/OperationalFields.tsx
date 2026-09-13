/** @jsxImportSource preact */
import { useT } from "../i18n-hook.ts";
import { formatNumber } from "../format.ts";
import { cx, Label, ProgressBar } from "../ui.tsx";
import type { ViewerLayout } from "../useViewerLayout.ts";
import { DocumentFieldValue, ScalarFields } from "./ScalarFields.tsx";
import {
  operationalField,
  operationalProgress,
  operationalRemainder,
  operationalUnit,
} from "./operational-model.ts";
import type {
  OperationalField,
  OperationalProfile,
} from "./operational-model.ts";
import type { DocumentModel } from "./types.ts";

function Value(
  { model, spec, prominent = false }: {
    model: DocumentModel;
    spec: OperationalField;
    prominent?: boolean;
  },
) {
  const t = useT();
  const field = operationalField(model, spec);
  const missing = field.kind === "empty";
  const unit = operationalUnit(model, spec);
  return (
    <div
      class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
      title={spec.key}
    >
      <span
        class={cx(
          "min-w-0 break-words [overflow-wrap:anywhere]",
          prominent && !missing
            ? "font-display text-doc font-semibold tracking-title text-ink"
            : "text-data text-ink-2",
        )}
      >
        {missing
          ? (
            <span class="font-sans text-chip font-normal text-ink-faint">
              {t("dossier.not_provided")}
            </span>
          )
          : spec.unit === "percent" && typeof field.value === "number"
          ? formatNumber(field.value, Number.isInteger(field.value) ? 0 : 2)
          : <DocumentFieldValue field={field} />}
      </span>
      {!missing && spec.unit && (
        <span class="font-mono text-chip text-ink-faint">
          {spec.unit === "percent"
            ? "%"
            : spec.unit === "hours"
            ? t("dossier.hours")
            : spec.unit === "minutes"
            ? t("dossier.minutes")
            : unit ?? t(
              spec.unit === "currency"
                ? "dossier.currency_unspecified"
                : "dossier.uom_unspecified",
            )}
        </span>
      )}
    </div>
  );
}

export function OperationalFields(
  { model, profile, layout }: {
    model: DocumentModel;
    profile: OperationalProfile;
    layout: ViewerLayout;
  },
) {
  const t = useT();
  const remainder = operationalRemainder(model, profile);
  const wide = layout === "wide";
  const modified = model.envelope.document.modified;
  return (
    <div class="operational-fields min-w-0">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-sunken px-4 py-2.5">
        <span class="font-mono text-micro uppercase tracking-label text-accent-text">
          {t(`dossier.title.${profile.title}`)}
        </span>
        <span class="min-w-0 break-words font-mono text-nano text-ink-faint">
          {t("dossier.modified")} ·{" "}
          {typeof modified === "string" && modified.trim()
            ? modified
            : t("dossier.not_provided")}
        </span>
      </div>
      <dl class="grid grid-cols-3 border-b border-line">
        {profile.metrics.map((spec) => {
          const progress = spec.unit === "percent"
            ? operationalProgress(model.envelope.document[spec.key])
            : null;
          return (
            <div
              key={spec.key}
              class={cx(
                "flex min-w-0 flex-col gap-2 border-r border-line last:border-r-0",
                wide ? "px-4 py-5" : "px-3 py-4",
              )}
            >
              <dt
                class={cx(
                  "font-mono text-micro uppercase tracking-label text-ink-faint",
                  wide ? "min-h-7" : "min-h-11",
                )}
              >
                {t(`dossier.field.${spec.label}`)}
              </dt>
              <dd class="flex min-w-0 flex-col gap-3">
                <Value model={model} spec={spec} prominent />
                {progress !== null && (
                  <div
                    role="meter"
                    aria-label={t(`dossier.field.${spec.label}`)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <ProgressBar value={progress} />
                  </div>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {profile.groups.map((group, index) => (
        <section
          key={group.title}
          aria-label={t(`dossier.section.${group.title}`)}
          class={cx(
            "grid gap-3 border-b border-line-soft px-4 py-4",
            wide && "grid-cols-[128px_minmax(0,1fr)] gap-6",
          )}
        >
          <h3 class="flex items-baseline gap-2.5">
            <span
              aria-hidden="true"
              class="font-mono text-micro text-accent-text"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <Label>{t(`dossier.section.${group.title}`)}</Label>
          </h3>
          <div class="min-w-0">
            <dl
              class={cx(
                "grid min-w-0 gap-x-5 gap-y-3",
                (wide || group.title === "schedule") && "grid-cols-2",
              )}
            >
              {group.fields.map((spec) => (
                <div key={spec.key} class="flex min-w-0 flex-col gap-1">
                  <dt class="font-mono text-chip text-ink-faint">
                    {t(`dossier.field.${spec.label}`)}
                  </dt>
                  <dd>
                    <Value model={model} spec={spec} />
                  </dd>
                </div>
              ))}
            </dl>
            {group.title === "costing" && (
              <p class="col-span-full mt-1 text-chip leading-relaxed text-ink-faint">
                {t("dossier.cost_source")}
              </p>
            )}
          </div>
        </section>
      ))}
      <details class="border-b border-line-soft">
        <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 font-mono text-chip text-ink-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
          {t("dossier.more_fields")}
        </summary>
        <ScalarFields
          fields={remainder.fields}
          longFields={remainder.longFields}
          progressFields={remainder.progressFields}
          collections={remainder.collections}
          systemFields={remainder.systemFields}
          layout={layout}
          heading={null}
        />
      </details>
    </div>
  );
}
