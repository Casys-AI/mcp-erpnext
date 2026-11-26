/** @jsxImportSource preact */

import { useEffect } from "preact/hooks";
import { defineComponentRegistry } from "@mcpview/components";
import {
  definePreactComponent,
  type PreactSurfaceComponentProps,
} from "@mcpview/components/preact";
import { DocumentSurface } from "../../shared/document/DocumentSurface.tsx";
import { translatorForLocale } from "../../shared/i18n.ts";
import { mergeHostContext } from "../../shared/host-context.ts";
import { applyDocumentLocale } from "../../shared/document-locale.ts";
import { useActiveContext } from "../../shared/useActiveContext.ts";
import { canReplaceActiveContext } from "../../shared/active-context.ts";
import { ActiveContextChip } from "../../shared/ActiveContextChip.tsx";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { DocumentSurfaceProps } from "../../shared/document/DocumentSurface.tsx";
import {
  buyEvidenceContextItem,
  type createEvidencePinLifetime,
} from "./context.ts";
import { ViewerShell } from "../../shared/ui.tsx";
import { useViewerLayout } from "../../shared/useViewerLayout.ts";
import type { BuyEvidenceViewData } from "./model.ts";
import { buyResultToDocumentModel } from "./document-model.ts";

export const BUY_COMPONENT_KEYS = {
  configurationCost: "buy.configuration-cost",
} as const;

const BuyEvidenceCard = (
  { data, context, lifetime }:
    & PreactSurfaceComponentProps<BuyEvidenceViewData>
    & {
      lifetime: ReturnType<typeof createEvidencePinLifetime>;
    },
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
    applyDocumentLocale(host.locale, document.documentElement);
  }, [host.theme, host.locale]);
  const { ref, layout, boundsStyle } = useViewerLayout<HTMLDivElement>();
  const model = buyResultToDocumentModel(
    data,
    translatorForLocale(host.locale),
  );
  const surface = {
    model,
    layout,
    live: false,
    scrollMode: "flow" as const,
    childRowsExpandable: true,
  };
  const app = context.app;
  const canPin = typeof app?.getHostCapabilities === "function" &&
    typeof app.updateModelContext === "function" &&
    canReplaceActiveContext(app.getHostCapabilities());
  return (
    <ViewerShell
      containerRef={ref}
      style={boundsStyle}
      class="buy-evidence-shell"
    >
      {canPin
        ? (
          <PinnableEvidence
            data={data}
            app={app}
            lifetime={lifetime}
            surface={surface}
            locale={host.locale}
          />
        )
        : <DocumentSurface {...surface} />}
    </ViewerShell>
  );
};

function PinnableEvidence({ data, app, lifetime, surface, locale }: {
  data: BuyEvidenceViewData;
  app: App;
  lifetime: ReturnType<typeof createEvidencePinLifetime>;
  surface: DocumentSurfaceProps;
  locale?: string;
}) {
  const item = buyEvidenceContextItem(data, translatorForLocale(locale));
  const active = useActiveContext(app, item.id, lifetime.forHost(app, item.id));
  return (
    <DocumentSurface
      {...surface}
      contextSupported
      contextTarget={{
        label: item.label,
        selected: active.isSelected(item),
        onActivate: () => void active.toggle(item),
      }}
      contextChip={
        <ActiveContextChip
          selections={active.selections}
          selection={active.selection}
          onRemoveGroup={active.removeGroup}
          failed={active.failed}
          pending={active.pending}
          evictedLabel={active.evictedLabel}
          onRemove={active.remove}
          onClear={active.clear}
          compact={surface.layout !== "wide"}
        />
      }
    />
  );
}

export function buyComponentRegistry(
  lifetime: ReturnType<typeof createEvidencePinLifetime>,
) {
  return defineComponentRegistry<BuyEvidenceViewData>({
    components: {
      [BUY_COMPONENT_KEYS.configurationCost]: definePreactComponent<BuyEvidenceViewData>(
        { title: "Buy configuration cost" },
        (props) => <BuyEvidenceCard {...props} lifetime={lifetime} />,
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
}
