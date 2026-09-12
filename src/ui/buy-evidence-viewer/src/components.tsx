/** @jsxImportSource preact */

import { useEffect } from "preact/hooks";
import { defineComponentRegistry } from "@casys/mcp-view-components";
import {
  definePreactComponent,
  type PreactSurfaceComponentProps,
} from "@casys/mcp-view-components/preact";
import { DocumentSurface } from "../../shared/document/DocumentSurface.tsx";
import { mergeHostContext } from "../../shared/host-context.ts";
import { ViewerShell } from "../../shared/ui.tsx";
import { useViewerLayout } from "../../shared/useViewerLayout.ts";
import type { BuyEvidenceViewData } from "./model.ts";
import { buyResultToDocumentModel } from "./document-model.ts";

export const BUY_COMPONENT_KEYS = {
  configurationCost: "buy.configuration-cost",
} as const;

const BuyEvidenceCard = (
  { data, context }: PreactSurfaceComponentProps<BuyEvidenceViewData>,
) => {
  const host = context.hostContext as {
    theme?: string;
    locale?: string;
  };
  useEffect(() => {
    mergeHostContext({
      ...(host.theme === "light" || host.theme === "dark"
        ? { theme: host.theme }
        : {}),
      ...(typeof host.locale === "string" ? { locale: host.locale } : {}),
    });
  }, [host.theme, host.locale]);
  const { ref, layout, boundsStyle } = useViewerLayout<HTMLDivElement>();
  const model = buyResultToDocumentModel(data);
  return (
    <ViewerShell
      containerRef={ref}
      style={boundsStyle}
      class="buy-evidence-shell"
    >
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

export const BUY_COMPONENT_REGISTRY = defineComponentRegistry<
  BuyEvidenceViewData
>({
  components: {
    [BUY_COMPONENT_KEYS.configurationCost]: definePreactComponent(
      { title: "Buy configuration cost" },
      BuyEvidenceCard,
    ),
  },
  defaultSurface: {
    layout: { type: "stack", gap: "sm" },
    components: [{
      id: "evidence",
      component: BUY_COMPONENT_KEYS.configurationCost,
    }],
  },
});
