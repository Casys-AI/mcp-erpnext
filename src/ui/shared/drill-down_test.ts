/**
 * Tests du partage de sélection.
 *
 * Le choix du canal est une fonction pure des capacités de l'hôte ; le texte
 * poussé est une ligne déterministe dans la langue courante ; et un refus de
 * l'hôte ne remonte jamais à la vue autrement que par « none ».
 */

import { assertEquals } from "@std/assert";
import {
  type DrillDownChannel,
  drillDownChannel,
  type DrillDownHost,
  type HostCapabilities,
  selectionContext,
  sharedLabel,
  shareSelection,
} from "./drill-down.ts";
import { setLangSource } from "./i18n.ts";

const SEL = {
  view: "Revenue Trend",
  label: "Mars",
  value: "21 300 €",
  suggested: "Show sales invoices for Mar",
};

function fakeHost(caps: HostCapabilities | undefined, reject = false) {
  const calls: { method: string; text: string }[] = [];
  const fail = () => Promise.reject(new Error("refusé"));
  const host: DrillDownHost = {
    getHostCapabilities: () => caps,
    updateModelContext: (p) => {
      if (reject) return fail();
      calls.push({ method: "updateModelContext", text: p.content[0].text });
      return Promise.resolve({});
    },
    sendMessage: (p) => {
      if (reject) return fail();
      calls.push({ method: "sendMessage", text: p.content[0].text });
      return Promise.resolve({});
    },
  };
  return { host, calls };
}

Deno.test("drillDownChannel : updateModelContext prime sur tout le reste", () => {
  assertEquals(
    drillDownChannel({ updateModelContext: { text: {} }, serverTools: {} }),
    "context",
  );
});

Deno.test("drillDownChannel : message ou serverTools → message ; rien → none", () => {
  assertEquals(drillDownChannel({ message: { text: {} } }), "message");
  assertEquals(drillDownChannel({ serverTools: {} }), "message");
  assertEquals(drillDownChannel({}), "none");
  assertEquals(drillDownChannel(undefined), "none");
});

Deno.test("selectionContext : une ligne, valeur optionnelle, langue courante", () => {
  setLangSource(() => "fr-FR");
  assertEquals(
    selectionContext(SEL),
    "Sélection de l'utilisateur dans « Revenue Trend » : Mars — 21 300 €. " +
      "S'il demande le détail : Show sales invoices for Mar",
  );
  assertEquals(
    selectionContext({ ...SEL, value: undefined }),
    "Sélection de l'utilisateur dans « Revenue Trend » : Mars. " +
      "S'il demande le détail : Show sales invoices for Mar",
  );
  setLangSource(() => "en-US");
  assertEquals(
    selectionContext(SEL),
    "User selection in “Revenue Trend”: Mars — 21 300 €. " +
      "If they ask for details: Show sales invoices for Mar",
  );
});

Deno.test("shareSelection : contexte → updateModelContext seul, texte de contexte", async () => {
  setLangSource(() => "fr-FR");
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(await shareSelection(host, SEL), "context");
  assertEquals(calls.map((c) => c.method), ["updateModelContext"]);
  assertEquals(calls[0].text, selectionContext(SEL));
});

Deno.test("shareSelection : message → sendMessage avec l'action suggérée telle quelle", async () => {
  const { host, calls } = fakeHost({ serverTools: {} });
  assertEquals(await shareSelection(host, SEL), "message");
  assertEquals(calls, [{ method: "sendMessage", text: SEL.suggested }]);
});

Deno.test("shareSelection : hôte muet → none, aucun appel", async () => {
  const { host, calls } = fakeHost({});
  assertEquals(await shareSelection(host, SEL), "none");
  assertEquals(calls, []);
});

Deno.test("shareSelection : refus de l'hôte → none, sans lever", async () => {
  const { host } = fakeHost({ updateModelContext: { text: {} } }, true);
  assertEquals(await shareSelection(host, SEL), "none");
});

Deno.test("sharedLabel : un libellé par canal, null pour none", () => {
  setLangSource(() => "fr-FR");
  const labels: Record<DrillDownChannel, string | null> = {
    context: "Sélection partagée — demandez le détail dans la conversation",
    message: "Envoyé à la conversation",
    none: null,
  };
  for (const [channel, label] of Object.entries(labels)) {
    assertEquals(sharedLabel(channel as DrillDownChannel), label);
  }
});
