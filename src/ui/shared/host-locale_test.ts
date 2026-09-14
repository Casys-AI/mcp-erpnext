import { assertEquals } from "@std/assert";
import { applyDocumentLocale } from "./document-locale.ts";
import {
  currentLocale,
  getHostLocale,
  mergeHostLocale,
  subscribeHostLocale,
} from "./host-locale.ts";
import { t } from "./i18n.ts";
import { formatCurrency, formatNumber } from "./number-format.ts";

Deno.test("host locale patches update translations and preserve locale on theme changes", () => {
  mergeHostLocale({ locale: "en-US" });
  let changes = 0;
  const unsubscribe = subscribeHostLocale(() => changes++);
  try {
    mergeHostLocale({ locale: "fr-FR" });
    assertEquals(t("common.loading"), "Chargement…");
    mergeHostLocale({ theme: "dark" });
    mergeHostLocale({ locale: undefined });
    mergeHostLocale({ locale: 42 });
    mergeHostLocale(null);
    mergeHostLocale({ locale: "fr-FR" });
    assertEquals(getHostLocale(), "fr-FR");
    assertEquals(changes, 1);
    assertEquals(
      formatNumber(1234.5),
      (1234.5).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    const root = { lang: "", dir: "" };
    mergeHostLocale({ locale: "ur-PK" });
    applyDocumentLocale(getHostLocale(), root);
    assertEquals(root, { lang: "ur", dir: "rtl" });
    mergeHostLocale({ locale: "zh-Hant-TW" });
    applyDocumentLocale(getHostLocale(), root);
    assertEquals(root, { lang: "zh-Hant", dir: "ltr" });
    assertEquals(changes, 3);
    unsubscribe();
    mergeHostLocale({ locale: "en-US" });
    assertEquals(changes, 3);
  } finally {
    unsubscribe();
    mergeHostLocale({ locale: "en-US" });
  }
});

Deno.test("number formatting follows region while invalid locale safely falls back", () => {
  try {
    mergeHostLocale({ locale: "hi-IN" });
    assertEquals(
      formatNumber(1234567.5),
      (1234567.5).toLocaleString("hi-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    assertEquals(
      formatCurrency(42.5, "EUR"),
      (42.5).toLocaleString("hi-IN", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    mergeHostLocale({ locale: "not_a_locale" });
    assertEquals(currentLocale(), "en-US");
    assertEquals(t("common.loading"), "Loading…");
    assertEquals(formatNumber(1234.5), "1,234.50");
  } finally {
    mergeHostLocale({ locale: "en-US" });
  }
});
