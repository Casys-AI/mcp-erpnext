import type { App } from "@modelcontextprotocol/ext-apps";
import { createActiveContextController } from "../../shared/active-context-controller.ts";
import type { ContextSelectionItem } from "../../shared/active-context.ts";
import type { TFunction } from "../../shared/i18n-hook.ts";
import type { BuyEvidenceViewData } from "./model.ts";

export function buyEvidenceContextItem(
  data: BuyEvidenceViewData,
  t: TFunction,
): ContextSelectionItem {
  return {
    id: `buy-evidence:${data.sessionFingerprint}`,
    view: t("buy.title"),
    label: data.configuration.subjectId,
    value: data.coverage.status,
    fields: [
      {
        label: t("buy.field.configuration_revision"),
        value: String(data.configuration.configurationRevision),
      },
      {
        label: t("buy.field.observed_at"),
        value: data.pricingContext.observedAt,
      },
      ...data.totals.map((total) => ({
        label: t(
          total.kind === "covered-subtotal"
            ? "buy.field.covered_subtotal"
            : "buy.field.complete_total",
        ),
        value: `${total.amount} ${total.currency}`,
      })),
    ],
  };
}

/** Surface locale changes may remount a component without changing its verified evidence. */
export function createEvidencePinLifetime() {
  let controller: ReturnType<typeof createActiveContextController> | undefined;
  return {
    forHost(app: App, scope: string) {
      return controller ??= createActiveContextController(app, scope);
    },
    async clear() {
      controller?.setScope("buy-evidence:inactive");
      await controller?.clearPreviousScope();
    },
  };
}
