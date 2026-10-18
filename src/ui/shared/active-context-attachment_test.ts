import { assertEquals, assertStringIncludes } from "@std/assert";
import { activeContextAttachmentNotice } from "./active-context-attachment.ts";
import type { ContextSelectionItem } from "./active-context.ts";
import { setLocaleSource } from "./format.ts";
import { setLangSource, SUPPORTED_LANGS, translatorForLocale } from "./i18n.ts";

const ITEM: ContextSelectionItem = {
  id: "attachment:FILE-0001",
  view: "Lead LEAD-0001",
  label: "devis.pdf",
  value: "Note métier sans taille de fichier",
};

Deno.test("contexte actif : l'avis de pièce jointe annonce le futur transfert", () => {
  assertEquals(
    translatorForLocale("fr")("context.active.attachment", {
      name: "devis.pdf",
      size: "12 Ko",
    }),
    "devis.pdf · 12 Ko · Ce fichier sera transmis au modèle",
  );
});

Deno.test("contexte actif : seuls les fichiers locaux reçoivent un avis", () => {
  assertEquals(activeContextAttachmentNotice(ITEM), null);
  assertEquals(
    activeContextAttachmentNotice({ ...ITEM, resource: undefined }),
    null,
  );
});

Deno.test("contexte actif : l'avis utilise le nom et la taille des octets joints", () => {
  setLangSource(() => "fr");
  setLocaleSource(() => "fr-FR");
  try {
    assertEquals(
      activeContextAttachmentNotice({
        ...ITEM,
        resource: {
          uri: "erpnext://file/FILE-0001",
          mimeType: "application/pdf",
          bytes: new Uint8Array(12 * 1024),
        },
      }),
      "devis.pdf · 12 Ko · Ce fichier sera transmis au modèle",
    );
  } finally {
    setLangSource(() => undefined);
    setLocaleSource(() => undefined);
  }
});

Deno.test("contexte actif : les huit langues affichent le fichier et sa taille", () => {
  for (const locale of SUPPORTED_LANGS) {
    const notice = translatorForLocale(locale)("context.active.attachment", {
      name: "devis.pdf",
      size: "12 Ko",
    });
    assertStringIncludes(notice, "devis.pdf", locale);
    assertStringIncludes(notice, "12 Ko", locale);
    assertEquals(notice.includes("{"), false, locale);
  }
});
