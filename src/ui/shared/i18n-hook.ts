import { useMemo, useSyncExternalStore } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { applyDocumentLocale } from "./document-locale.ts";
import {
  getHostLocale,
  mergeHostLocale,
  subscribeHostLocale,
} from "./host-locale.ts";
import { t } from "./i18n.ts";

export type TFunction = typeof t;

function updateDocumentLocale(): void {
  if (typeof document !== "undefined") {
    applyDocumentLocale(getHostLocale(), document.documentElement);
  }
}

subscribeHostLocale(updateDocumentLocale);

export function useT(): TFunction {
  const locale = useSyncExternalStore(
    subscribeHostLocale,
    getHostLocale,
    getHostLocale,
  );
  return useMemo(() => (key, params) => t(key, params), [locale]);
}

export function bindHostLocale(app: App): void {
  const previous = app.onhostcontextchanged;
  app.onhostcontextchanged = (patch) => {
    mergeHostLocale(patch);
    previous?.(patch);
  };
  mergeHostLocale(app.getHostContext());
  updateDocumentLocale();
}
