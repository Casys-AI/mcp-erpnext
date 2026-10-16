import { assertEquals } from "@std/assert";
import {
  getHostContext,
  mergeHostContext,
  subscribeHostContext,
} from "./host-context.ts";

// Les notifications host-context-changed sont PARTIELLES : chacune ne porte
// que les champs qui ont bougé. C'est le cœur du magasin — si on écrase au
// lieu de fusionner, la locale reçue à la connexion disparaît au premier
// changement de thème.
Deno.test("host-context - fusionne les notifications partielles, n'écrase jamais", () => {
  mergeHostContext({ locale: "fr-FR", theme: "dark" });
  mergeHostContext({ theme: "light" });
  const ctx = getHostContext();
  assertEquals(ctx.theme, "light");
  assertEquals(ctx.locale, "fr-FR"); // survit au changement de thème
});

Deno.test("host-context - une notification vide ou absente ne fait rien", () => {
  const before = { ...getHostContext() };
  mergeHostContext(undefined);
  mergeHostContext({});
  assertEquals(getHostContext(), before);
});

Deno.test("host-context - prévient les abonnés, et l'abonnement se défait", () => {
  const seen: string[] = [];
  const off = subscribeHostContext((c) => seen.push(String(c.locale)));
  mergeHostContext({ locale: "de-DE" });
  off();
  mergeHostContext({ locale: "es-ES" });
  assertEquals(seen, ["de-DE"]); // plus rien après off()
});

Deno.test("host-context - deviceCapabilities est remplacé en bloc, pas fusionné en profondeur", () => {
  // Une fusion superficielle est voulue : l'hôte renvoie l'objet complet.
  mergeHostContext({ deviceCapabilities: { touch: true, hover: true } });
  mergeHostContext({ deviceCapabilities: { touch: true } });
  assertEquals(getHostContext().deviceCapabilities, { touch: true });
});
