import { assertEquals } from "@std/assert";
import type { ContextSelectionItem } from "./active-context.ts";
import {
  activateContextWithFallback,
  type ActiveContextFlowHost,
  activeContextPresentationEffect,
  contextFallbackForConfirmedContext,
  contextFallbackForInlineJump,
} from "./active-context-flow.ts";

const ITEM: ContextSelectionItem = {
  id: "chart:revenue:aug",
  view: "Revenue",
  label: "Aug",
  value: "12 400 €",
};

type Result = "ok" | "isError" | "throw";

function host(
  context: Result,
  message: Result = "ok",
  messageText = true,
) {
  const calls: string[] = [];
  const fake: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
      ...(messageText ? { message: { text: {} } } : {}),
    }),
    updateModelContext: () => {
      calls.push("context");
      if (context === "throw") return Promise.reject(new Error("context"));
      return Promise.resolve(context === "isError" ? { isError: true } : {});
    },
    sendMessage: () => {
      calls.push("message");
      if (message === "throw") return Promise.reject(new Error("message"));
      return Promise.resolve(message === "isError" ? { isError: true } : {});
    },
  };
  return { fake, calls };
}

Deno.test("activation : succès contexte sans double envoi", async () => {
  const { fake, calls } = host("ok");
  assertEquals(
    await activateContextWithFallback(fake, [ITEM], "Show August"),
    "context",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("activation : refus contexte → message.text seulement", async () => {
  for (const context of ["isError", "throw"] as const) {
    const { fake, calls } = host(context);
    assertEquals(
      await activateContextWithFallback(fake, [ITEM], "Show August"),
      "message",
    );
    assertEquals(calls, ["context", "message"]);
  }
});

Deno.test("activation : aucun message sans message.text", async () => {
  const { fake, calls } = host("isError", "ok", false);
  assertEquals(
    await activateContextWithFallback(fake, [ITEM], "Show August"),
    "none",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("activation : requête dépassée ne déclenche pas son fallback", async () => {
  const { fake, calls } = host("isError");
  assertEquals(
    await activateContextWithFallback(fake, [ITEM], "Show August", () => false),
    "superseded",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("activation : refus du message reste un échec visible", async () => {
  const { fake, calls } = host("isError", "isError");
  assertEquals(
    await activateContextWithFallback(fake, [ITEM], "Show August"),
    "none",
  );
  assertEquals(calls, ["context", "message"]);
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

Deno.test("fallback : exige un panier confirmé vide et un distant vide connu", () => {
  assertEquals(
    contextFallbackForConfirmedContext("Show August", false, true),
    "Show August",
  );
  assertEquals(
    contextFallbackForConfirmedContext("Show August", true, false),
    undefined,
  );
  assertEquals(
    contextFallbackForConfirmedContext("Show August", false, false),
    undefined,
  );
});

Deno.test("fallback : l'échec de B avec A confirmé n'envoie aucun message B", async () => {
  const { fake, calls } = host("isError");
  const fallback = contextFallbackForConfirmedContext(
    "Show September",
    true,
    false,
  );
  assertEquals(
    await activateContextWithFallback(fake, [ITEM], fallback),
    "none",
  );
  assertEquals(calls, ["context"]);
});

Deno.test("génération : un changement pendant l'update bloque le fallback", async () => {
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
    await activateContextWithFallback(
      fake,
      [ITEM],
      "Show August",
      () => current,
    ),
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
    await activateContextWithFallback(
      fake,
      [ITEM],
      "Show August",
      () => current,
    ),
    "context",
  );
  assertEquals(calls, ["context"]);
});
