import { assertEquals, assertExists } from "@std/assert";
import { createActiveContextController } from "../../shared/active-context-controller.ts";
import type { ActiveContextFlowHost } from "../../shared/active-context-flow.ts";
import {
  canReplaceActiveContext,
  type ContextSelectionItem,
} from "../../shared/active-context.ts";
import { createClickIntentArbiter } from "../../shared/click-intent.ts";
import {
  canSendTextMessage,
  sendTextMessage,
} from "../../shared/host-message.ts";
import { createFunnelStageIntent } from "./funnel-nav.ts";

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 32; i++) await Promise.resolve();
}

function stageItem(label: string): ContextSelectionItem {
  return {
    id: `funnel:Sales Pipeline:${label}`,
    label,
    view: "Sales Pipeline",
    value: "12",
  };
}

function harness({ context = true, message = true } = {}) {
  const capabilities = {
    ...(context ? { updateModelContext: { structuredContent: {} } } : {}),
    ...(message ? { message: { text: {} } } : {}),
  };
  const requests: {
    labels: string[];
    response: ReturnType<typeof deferred>;
  }[] = [];
  const messages: { text: string; selected: string[] }[] = [];
  const host: ActiveContextFlowHost = {
    getHostCapabilities: () => capabilities,
    updateModelContext(params) {
      const response = deferred();
      const items =
        (params.structuredContent?.items ?? []) as ContextSelectionItem[];
      requests.push({ labels: items.map((item) => item.label), response });
      return response.promise;
    },
    sendMessage(params) {
      messages.push({ text: params.content[0].text, selected: selected() });
      return Promise.resolve({});
    },
  };
  const controller = createActiveContextController(host, "funnel-root");
  const actions = controller.actionsForScope("funnel-root");
  const arbiter = createClickIntentArbiter(() => () => {});
  const selected = () =>
    controller.getSnapshot().selections.map((selection) =>
      selection.item.label
    );
  const intent = (
    label = "Leads",
    messageText: string | undefined = "Show all leads",
  ) =>
    createFunnelStageIntent({
      key: stageItem(label).id,
      contextSupported: canReplaceActiveContext(capabilities),
      messageSupported: Boolean(messageText) &&
        canSendTextMessage(capabilities),
      onContext: () => actions.toggleReversible(stageItem(label)),
      runConversation: actions.runConversation,
      onConversation: () => {
        if (messageText) void sendTextMessage(host, messageText);
      },
    });
  async function ack(index: number, accepted = true) {
    assertExists(requests[index], `context request ${index}`);
    if (accepted) requests[index].response.resolve({});
    else requests[index].response.reject(new Error("Host rejected context"));
    await flush();
  }
  async function seed(...labels: string[]) {
    for (const label of labels) {
      const index = requests.length;
      const pending = actions.activate(stageItem(label));
      await flush();
      await ack(index);
      await pending;
    }
  }
  return {
    controller,
    actions,
    arbiter,
    requests,
    messages,
    intent,
    selected,
    ack,
    seed,
  };
}

Deno.test("funnel click and Space only toggle acknowledged context", async () => {
  for (const gesture of ["click", "Space"]) {
    const h = harness();
    const intent = h.intent();
    const activate = () => {
      if (gesture === "click") h.arbiter.click(intent, 1);
      else h.arbiter.keyDown(intent, { key: " ", preventDefault() {} });
    };
    activate();
    await flush();
    assertEquals(h.requests[0].labels, ["Leads"]);
    assertEquals(h.selected(), []);
    assertEquals(h.controller.getSnapshot().pending, true);
    assertEquals(h.messages, []);
    await h.ack(0);
    assertEquals(h.selected(), ["Leads"]);
    activate();
    await flush();
    assertEquals(h.requests[1].labels, []);
    assertEquals(h.selected(), ["Leads"]);
    await h.ack(1);
    assertEquals(h.selected(), []);
    assertEquals(h.messages, []);
    h.arbiter.cancelAll();
  }
});

Deno.test("funnel without host context never turns click or Space into a message", async () => {
  for (const conversationGesture of ["double", "Enter"]) {
    const h = harness({ context: false });
    const intent = h.intent();
    h.arbiter.click(intent, 1);
    h.arbiter.keyDown(intent, { key: " ", preventDefault() {} });
    await flush();
    assertEquals(h.requests, []);
    assertEquals(h.messages, []);
    assertEquals(h.controller.getSnapshot().failed, false);
    if (conversationGesture === "double") {
      h.arbiter.click(intent, 1);
      h.arbiter.click(intent, 2);
      h.arbiter.doubleClick(intent);
    } else {
      h.arbiter.keyDown(intent, { key: "Enter", preventDefault() {} });
    }
    await flush();
    assertEquals(h.messages, [{ text: "Show all leads", selected: [] }]);
    assertEquals(h.requests, []);
    h.arbiter.cancelAll();
  }
});

Deno.test("funnel native double click waits for both ACKs and restores the pregesture selection", async () => {
  for (const alreadySelected of [false, true]) {
    const h = harness();
    await h.seed("Orders", ...(alreadySelected ? ["Leads"] : []));
    const before = h.selected();
    const start = h.requests.length;
    const intent = h.intent();
    h.arbiter.click(intent, 1);
    h.arbiter.click(intent, 2);
    h.arbiter.doubleClick(intent);
    await flush();
    assertEquals(h.messages, []);
    assertEquals(h.selected(), before);
    await h.ack(start);
    assertEquals(h.messages, []);
    assertEquals(h.requests[start + 1].labels, before);
    assertEquals(h.controller.getSnapshot().pending, true);
    await h.ack(start + 1);
    assertEquals(h.selected(), before);
    assertEquals(h.messages, [{ text: "Show all leads", selected: before }]);
    assertEquals(h.controller.getSnapshot().pending, false);
    h.arbiter.cancelAll();
  }
});

Deno.test("funnel Enter preserves an existing selection without context writes", async () => {
  const h = harness();
  await h.seed("Leads", "Orders");
  const before = h.selected();
  const writes = h.requests.length;
  h.arbiter.keyDown(h.intent(), { key: "Enter", preventDefault() {} });
  await flush();
  assertEquals(h.selected(), before);
  assertEquals(h.requests.length, writes);
  assertEquals(h.messages, [{ text: "Show all leads", selected: before }]);
  h.arbiter.cancelAll();
});

Deno.test("funnel Enter waits for a prior deliberate selection ACK without undoing it", async () => {
  const h = harness();
  const intent = h.intent();
  h.arbiter.click(intent, 1);
  h.arbiter.keyDown(intent, { key: "Enter", preventDefault() {} });
  await flush();
  assertEquals(h.messages, []);
  await h.ack(0);
  assertEquals(h.requests.length, 1);
  assertEquals(h.selected(), ["Leads"]);
  assertEquals(h.messages, [{ text: "Show all leads", selected: ["Leads"] }]);
  h.arbiter.cancelAll();
});

Deno.test("funnel double click retains later selections and waits for their ACK", async () => {
  const h = harness();
  const intent = h.intent();
  h.arbiter.click(intent, 1);
  h.arbiter.click(intent, 2);
  h.arbiter.doubleClick(intent);
  await flush();
  await h.ack(0);
  const laterSelection = h.actions.toggle(stageItem("Orders"));
  await h.ack(1);
  assertEquals(h.messages, []);
  assertEquals(h.requests[2].labels, ["Orders"]);
  await h.ack(2);
  await laterSelection;
  assertEquals(h.selected(), ["Orders"]);
  assertEquals(h.messages, [{ text: "Show all leads", selected: ["Orders"] }]);
  h.arbiter.cancelAll();
});

Deno.test("funnel refuses conversation after a rejected selection or compensation ACK", async () => {
  for (const rejection of ["selection", "compensation"]) {
    const h = harness();
    const intent = h.intent();
    h.arbiter.click(intent, 1);
    h.arbiter.click(intent, 2);
    h.arbiter.doubleClick(intent);
    await flush();
    await h.ack(0, rejection !== "selection");
    if (rejection === "compensation") await h.ack(1, false);
    assertEquals(h.messages, []);
    assertEquals(h.controller.getSnapshot().pending, false);
    assertEquals(h.controller.getSnapshot().failed, true);
    h.arbiter.cancelAll();
  }
});

Deno.test("funnel root replacement cancels an old conversation waiting for context ACK", async () => {
  const h = harness();
  const intent = h.intent();
  h.arbiter.click(intent, 1);
  h.arbiter.click(intent, 2);
  h.arbiter.doubleClick(intent);
  await flush();
  h.controller.setScope("another-funnel-root");
  const cleared = h.controller.clearPreviousScope();
  await h.ack(0);
  assertEquals(h.requests[1].labels, []);
  assertEquals(h.messages, []);
  await h.ack(1);
  await cleared;
  assertEquals(h.selected(), []);
  assertEquals(h.messages, []);
  h.arbiter.keyDown(intent, { key: "Enter", preventDefault() {} });
  h.arbiter.click(intent, 1);
  await flush();
  assertEquals(h.requests.length, 2);
  assertEquals(h.messages, []);
  h.arbiter.cancelAll();
});

Deno.test("funnel conversation requires both host message support and a stage message", async () => {
  for (const messageSupported of [false, true]) {
    const h = harness({ message: messageSupported });
    await h.seed("Orders");
    const intent = h.intent(
      "Custom stage",
      messageSupported ? "" : "Show stage",
    );
    h.arbiter.keyDown(intent, { key: "Enter", preventDefault() {} });
    await flush();
    assertEquals(h.messages, []);
    assertEquals(h.selected(), ["Orders"]);
    assertEquals(h.requests.length, 1);
    h.arbiter.cancelAll();
  }
});
