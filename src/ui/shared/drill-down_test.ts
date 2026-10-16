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

type Outcome = "ok" | "isError" | "throw";

interface FakeBehavior {
  context?: Outcome;
  message?: Outcome;
}

interface HostCall {
  method: "updateModelContext" | "sendMessage";
  text?: string;
  structuredContent?: Record<string, unknown>;
}

function outcome(value: Outcome | undefined): Promise<unknown> {
  if (value === "throw") return Promise.reject(new Error("refusé"));
  return Promise.resolve(value === "isError" ? { isError: true } : {});
}

function fakeHost(
  caps: HostCapabilities | undefined,
  behavior: FakeBehavior = {},
) {
  const calls: HostCall[] = [];
  const host: DrillDownHost = {
    getHostCapabilities: () => caps,
    updateModelContext: (p) => {
      calls.push({
        method: "updateModelContext",
        text: p.content?.[0]?.text,
        structuredContent: p.structuredContent,
      });
      return outcome(behavior.context);
    },
    sendMessage: (p) => {
      calls.push({ method: "sendMessage", text: p.content[0].text });
      return outcome(behavior.message);
    },
  };
  return { host, calls };
}

Deno.test("drillDownChannel : updateModelContext prime sur tout le reste", () => {
  assertEquals(
    drillDownChannel({
      updateModelContext: { text: {} },
      message: { text: {} },
      serverTools: {},
    }),
    "context",
  );
});

Deno.test("drillDownChannel : structuredContent est une modalité de contexte", () => {
  assertEquals(
    drillDownChannel({ updateModelContext: { structuredContent: {} } }),
    "context",
  );
});

Deno.test("drillDownChannel : seul message.text autorise un message", () => {
  assertEquals(drillDownChannel({ message: { text: {} } }), "message");
  assertEquals(
    drillDownChannel({ message: { structuredContent: {} } }),
    "none",
  );
  assertEquals(drillDownChannel({ message: {} }), "none");
  assertEquals(drillDownChannel({ serverTools: {} }), "none");
  assertEquals(
    drillDownChannel({ updateModelContext: {}, message: { text: {} } }),
    "message",
  );
  assertEquals(drillDownChannel({}), "none");
  assertEquals(drillDownChannel(undefined), "none");
});

Deno.test("selectionContext : une ligne, valeur optionnelle, langue courante", () => {
  setLangSource(() => "fr-FR");
  assertEquals(
    selectionContext(SEL),
    "Sélection active dans « Revenue Trend » : Mars — 21 300 €.",
  );
  assertEquals(
    selectionContext({ ...SEL, value: undefined }),
    "Sélection active dans « Revenue Trend » : Mars.",
  );
  setLangSource(() => "en-US");
  assertEquals(
    selectionContext(SEL),
    "Active selection in “Revenue Trend”: Mars — 21 300 €.",
  );
});

Deno.test("shareSelection : contexte → updateModelContext seul, texte de contexte", async () => {
  setLangSource(() => "fr-FR");
  const { host, calls } = fakeHost({ updateModelContext: { text: {} } });
  assertEquals(await shareSelection(host, SEL), "context");
  assertEquals(calls.map((c) => c.method), ["updateModelContext"]);
  assertEquals(calls[0].text, selectionContext(SEL));
  assertEquals(calls[0].structuredContent, undefined);
});

Deno.test("shareSelection : structuredContent seul → contexte structuré seul", async () => {
  const { host, calls } = fakeHost({
    updateModelContext: { structuredContent: {} },
  });
  assertEquals(await shareSelection(host, SEL), "context");
  assertEquals(calls, [{
    method: "updateModelContext",
    text: undefined,
    structuredContent: {
      selection: {
        view: SEL.view,
        label: SEL.label,
        value: SEL.value,
      },
    },
  }]);
});

Deno.test("shareSelection : message.text → action suggérée telle quelle", async () => {
  const { host, calls } = fakeHost({ message: { text: {} } });
  assertEquals(await shareSelection(host, SEL), "message");
  assertEquals(calls, [{ method: "sendMessage", text: SEL.suggested }]);
});

Deno.test("shareSelection : hôte muet → none, aucun appel", async () => {
  const { host, calls } = fakeHost({});
  assertEquals(await shareSelection(host, SEL), "none");
  assertEquals(calls, []);
});

Deno.test("shareSelection : serverTools seul → aucun message", async () => {
  const { host, calls } = fakeHost({ serverTools: {} });
  assertEquals(await shareSelection(host, SEL), "none");
  assertEquals(calls, []);
});

Deno.test("shareSelection : isError du message → none", async () => {
  const { host } = fakeHost(
    { message: { text: {} } },
    { message: "isError" },
  );
  assertEquals(await shareSelection(host, SEL), "none");
});

Deno.test("shareSelection : refus du contexte → fallback message.text", async () => {
  for (const context of ["throw", "isError"] as const) {
    const { host, calls } = fakeHost(
      {
        updateModelContext: { text: {} },
        message: { text: {} },
      },
      { context },
    );
    assertEquals(await shareSelection(host, SEL), "message");
    assertEquals(calls.map((call) => call.method), [
      "updateModelContext",
      "sendMessage",
    ]);
  }
});

Deno.test("shareSelection : refus du contexte sans message.text → none", async () => {
  const { host, calls } = fakeHost(
    {
      updateModelContext: { text: {} },
      message: { structuredContent: {} },
      serverTools: {},
    },
    { context: "isError" },
  );
  assertEquals(await shareSelection(host, SEL), "none");
  assertEquals(calls.map((call) => call.method), ["updateModelContext"]);
});

Deno.test("shareSelection : isError du fallback message → none", async () => {
  const { host, calls } = fakeHost(
    {
      updateModelContext: { text: {} },
      message: { text: {} },
    },
    { context: "isError", message: "isError" },
  );
  assertEquals(await shareSelection(host, SEL), "none");
  assertEquals(calls.map((call) => call.method), [
    "updateModelContext",
    "sendMessage",
  ]);
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
