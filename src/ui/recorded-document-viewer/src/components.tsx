/** @jsxImportSource preact */

import { useEffect } from "preact/hooks";
import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  type LayoutHostHints,
  useViewerLayout as useKitViewerLayout,
} from "@casys/mcp-view-components/layout";
import {
  definePreactComponent,
  type PreactSurfaceComponentProps,
} from "@casys/mcp-view-components/preact";
import { DocumentSurface } from "../../shared/document/DocumentSurface.tsx";
import { translatorForLocale } from "../../shared/i18n.ts";
import { mergeHostContext } from "../../shared/host-context.ts";
import { ViewerShell } from "../../shared/ui.tsx";
import type { RecordedDocumentViewData } from "./model.ts";
import { recordedViewDataToDocumentModel } from "./document-model.ts";

export const RECORDED_COMPONENT_KEYS = {
  document: "recorded.document",
} as const;

function compactSiteId(siteId: string): string {
  return siteId.length > 24 ? `${siteId.slice(0, 18)}…` : siteId;
}

interface RecordedHostContext {
  theme?: string;
  locale?: string;
  containerDimensions?: {
    width?: number;
    maxWidth?: number;
    height?: number;
    maxHeight?: number;
  };
  deviceCapabilities?: { touch?: boolean; hover?: boolean };
}

/**
 * Layout hints read synchronously from the surface context: the first paint
 * already uses the host-declared width instead of flashing wide and
 * correcting through the host-context store.
 */
function layoutHints(host: RecordedHostContext): LayoutHostHints {
  const dimensions = host.containerDimensions;
  const capabilities = host.deviceCapabilities;
  return {
    ...(dimensions === undefined ? {} : {
      containerDimensions: {
        ...(typeof dimensions.width === "number"
          ? { width: dimensions.width }
          : {}),
        ...(typeof dimensions.maxWidth === "number"
          ? { maxWidth: dimensions.maxWidth }
          : {}),
        ...(typeof dimensions.height === "number"
          ? { height: dimensions.height }
          : {}),
        ...(typeof dimensions.maxHeight === "number"
          ? { maxHeight: dimensions.maxHeight }
          : {}),
      },
    }),
    ...(capabilities === undefined ? {} : {
      deviceCapabilities: {
        ...(typeof capabilities.touch === "boolean"
          ? { touch: capabilities.touch }
          : {}),
        ...(typeof capabilities.hover === "boolean"
          ? { hover: capabilities.hover }
          : {}),
      },
    }),
  };
}

const RecordedDocumentCard = (
  { data, context }: PreactSurfaceComponentProps<RecordedDocumentViewData>,
) => {
  const host = context.hostContext as RecordedHostContext;
  useEffect(() => {
    mergeHostContext({
      ...(host.theme === "light" || host.theme === "dark"
        ? { theme: host.theme }
        : {}),
      ...(typeof host.locale === "string" ? { locale: host.locale } : {}),
    });
  }, [host.theme, host.locale]);
  const { ref, layout, boundsStyle } = useKitViewerLayout<HTMLDivElement>(
    layoutHints(host),
  );
  const t = translatorForLocale(host.locale);
  const model = recordedViewDataToDocumentModel(data);
  const { record, applicability } = data;
  return (
    <ViewerShell
      containerRef={ref}
      style={boundsStyle}
      class="recorded-document-shell"
    >
      <div class="recorded-document-banner flex shrink-0 flex-col gap-1 border-b border-line bg-sunken px-4 py-2.5">
        <span class="font-mono text-micro uppercase tracking-label text-accent-text">
          {t("recorded.title")}
        </span>
        <dl class="flex min-w-0 flex-col gap-0.5">
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 font-mono text-chip text-ink-faint">
              {t("recorded.field.doctype")}
            </dt>
            <dd class="min-w-0 truncate text-right text-note text-ink-2">
              {record.doctype}
            </dd>
          </div>
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 font-mono text-chip text-ink-faint">
              {t("recorded.field.name")}
            </dt>
            <dd class="min-w-0 truncate text-right text-note text-ink-2">
              {record.name}
            </dd>
          </div>
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 font-mono text-chip text-ink-faint">
              {t("recorded.field.modified")}
            </dt>
            <dd class="min-w-0 truncate text-right font-mono text-note tabular-nums text-ink-2">
              {record.modified}
            </dd>
          </div>
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 font-mono text-chip text-ink-faint">
              {t("recorded.field.observed_at")}
            </dt>
            <dd class="min-w-0 truncate text-right font-mono text-note tabular-nums text-ink-2">
              {record.observedAt}
            </dd>
          </div>
          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <dt class="shrink-0 font-mono text-chip text-ink-faint">
              {t("recorded.field.site")}
            </dt>
            <dd
              class="min-w-0 truncate text-right font-mono text-note text-ink-2"
              title={record.sourceInstance.siteId}
            >
              {compactSiteId(record.sourceInstance.siteId)}
            </dd>
          </div>
          {applicability !== undefined && (
            <div class="flex min-w-0 items-baseline justify-between gap-3">
              <dt class="shrink-0 font-mono text-chip text-ink-faint">
                {t("recorded.field.historical")}
              </dt>
              <dd class="min-w-0 break-words text-right text-note text-ink-2">
                {t("recorded.historical.note")} · {applicability.reason}
              </dd>
            </div>
          )}
        </dl>
      </div>
      <DocumentSurface
        model={model}
        layout={layout}
        live={false}
        scrollMode="flow"
        childRowsExpandable
      />
    </ViewerShell>
  );
};

export const RECORDED_COMPONENT_REGISTRY = defineComponentRegistry<
  RecordedDocumentViewData
>({
  components: {
    [RECORDED_COMPONENT_KEYS.document]: definePreactComponent(
      { title: "Recorded document" },
      RecordedDocumentCard,
    ),
  },
  defaultSurface: {
    layout: { type: "stack", gap: "sm" },
    components: [{
      id: "document",
      component: RECORDED_COMPONENT_KEYS.document,
    }],
  },
});
