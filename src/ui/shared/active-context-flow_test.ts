import { assertEquals } from "@std/assert";
import type { ContextSelectionItem } from "./active-context.ts";
import {
  activateContext,
  type ActiveContextFlowHost,
  activeContextPresentationEffect,
  contextFallbackForInlineJump,
} from "./active-context-flow.ts";

const ITEM: ContextSelectionItem = {
  id: "chart:revenue:aug",
  view: "Revenue",
  label: "Aug",
  value: "12 400 €",
};

type Result = "ok" | "isError" | "throw";

/** Hôte qui annonce aussi `message.text` : le flux ne doit jamais l'utiliser. */
function host(context: Result) {
  const calls: string[] = [];
  const fake: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
      message: { text: {} },
    }),
    updateModelContext: () => {
      calls.push("context");
      if (context === "throw") return Promise.reject(new Error("context"));
      return Promise.resolve(context === "isError" ? { isError: true } : {});
    },
    sendMessage: () => {
      calls.push("message");
      return Promise.resolve({});
    },
  };
  return { fake, calls };
}

Deno.test("activation : succès contexte, aucun message envoyé", async () => {
  const { fake, calls } = host("ok");
  assertEquals(await activateContext(fake, [ITEM]), "context");
  assertEquals(calls, ["context"]);
});

Deno.test("activation : refus contexte → none, jamais de message de repli", async () => {
  // L'hôte annonce message.text : le repli conversationnel n'existe plus.
  for (const context of ["isError", "throw"] as const) {
    const { fake, calls } = host(context);
    assertEquals(await activateContext(fake, [ITEM]), "none");
    assertEquals(calls, ["context"]);
  }
});

Deno.test("activation : requête dépassée → superseded", async () => {
  const { fake, calls } = host("isError");
  assertEquals(
    await activateContext(fake, [ITEM], () => false),
    "superseded",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("présentation : un fallback message reste un échec de contexte", () => {
  assertEquals(activeContextPresentationEffect("context"), "replace");
  assertEquals(activeContextPresentationEffect("message"), "failure");
  assertEquals(activeContextPresentationEffect("none"), "failure");
  assertEquals(activeContextPresentationEffect("superseded"), "ignore");
});

Deno.test("navigation : un saut inline supprime toujours le fallback message", () => {
  assertEquals(contextFallbackForInlineJump("Show August", true), undefined);
  assertEquals(
    contextFallbackForInlineJump("Show August", false),
    "Show August",
  );
});

Deno.test("génération : un changement pendant l'update ne produit aucun repli", async () => {
  let current = true;
  const calls: string[] = [];
  const fake: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
      message: { text: {} },
    }),
    updateModelContext: () => {
      calls.push("context");
      current = false;
      return Promise.resolve({ isError: true });
    },
    sendMessage: () => {
      calls.push("message");
      return Promise.resolve({});
    },
  };

  assertEquals(
    await activateContext(fake, [ITEM], () => current),
    "superseded",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("génération : un contexte confirmé reste observable après changement", async () => {
  let current = true;
  const calls: string[] = [];
  const fake: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
      message: { text: {} },
    }),
    updateModelContext: () => {
      calls.push("context");
      current = false;
      return Promise.resolve({});
    },
    sendMessage: () => {
      calls.push("message");
      return Promise.resolve({});
    },
  };

  assertEquals(
    await activateContext(fake, [ITEM], () => current),
    "context",
  );
  assertEquals(calls, ["context"]);
});
