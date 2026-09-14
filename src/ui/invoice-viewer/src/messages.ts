import type { t as Translate } from "../../shared/i18n.ts";

export type InvoiceMessage = string | {
  key: string;
  params?: Record<string, string | number>;
};

export function invoiceMessage(
  message: InvoiceMessage,
  t: typeof Translate,
): string {
  return typeof message === "string" ? message : t(message.key, message.params);
}
