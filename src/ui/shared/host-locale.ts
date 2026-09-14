import { setLangSource } from "./i18n.ts";

let locale: string | undefined;
const listeners = new Set<() => void>();

setLangSource(() => locale);

export function getHostLocale(): string | undefined {
  return locale;
}

export function subscribeHostLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mergeHostLocale(patch: unknown): void {
  if (!patch || typeof patch !== "object") return;
  const next = (patch as { locale?: unknown }).locale;
  if (typeof next !== "string" || next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}

export function currentLocale(): string {
  try {
    return new Intl.Locale(locale?.trim() || "en-US").toString();
  } catch {
    return "en-US";
  }
}
