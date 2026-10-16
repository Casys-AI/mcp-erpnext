import { directionForLocale, resolveLang } from "./i18n.ts";

export function applyDocumentLocale(
  locale: string | undefined,
  root: { lang: string; dir: string },
): void {
  root.lang = resolveLang(locale);
  root.dir = directionForLocale(locale);
}
