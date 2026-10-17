import type { TFunction } from "../i18n-hook.ts";

const LABEL_KEYS: Record<string, string> = {
  company_name: "document.company.field.company_name",
  abbr: "document.company.field.abbr",
  country: "document.company.field.country",
  default_currency: "document.company.field.default_currency",
  domain: "document.company.field.domain",
  is_group: "document.company.field.is_group",
};

export function companyFieldLabel(
  key: string,
  translate: TFunction,
): string | undefined {
  const label = LABEL_KEYS[key];
  return label ? translate(label) : undefined;
}
