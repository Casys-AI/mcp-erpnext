import { assertEquals, assertExists } from "@std/assert";
import { createActiveContextController } from "../../shared/active-context-controller.ts";
import type { ActiveContextFlowHost } from "../../shared/active-context-flow.ts";
import type { ContextSelectionItem } from "../../shared/active-context.ts";
import { createClickIntentArbiter } from "../../shared/click-intent.ts";
import {
  canSendTextMessage,
  sendTextMessage,
} from "../../shared/host-message.ts";
import {
  handleKpiContextKey,
  kpiCanRefresh,
  kpiCardLayout,
  kpiClickIntent,
  kpiContextEnabled,
  kpiErrorRetry,
  kpiKeyShortcuts,
} from "./kpi-interactions.ts";

async function flush() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

function harness(contextSupported = true, messageSupported = true) {
  const requests: Array<{ ids: string[]; resolve: (result: unknown) => void }> =
    [];
  const messages: string[] = [];
  const host = {
    getHostCapabilities: () => ({
      ...(contextSupported
        ? { updateModelContext: { structuredContent: {} } }
        : {}),
      ...(messageSupported ? { message: { text: {} } } : {}),
      serverTools: {},
    }),
    updateModelContext: (params) =>
      new Promise((resolve) => {
        const items =
          (params.structuredContent?.items ?? []) as ContextSelectionItem[];
        requests.push({ ids: items.map((item) => item.id), resolve });
      }),
    sendMessage: (params) => {
      messages.push(params.content[0].text);
      return Promise.resolve({});
    },
  } satisfies ActiveContextFlowHost;
  const controller = createActiveContextController(host, "kpi-root");
  const actions = controller.actionsForScope("kpi-root");
  const arbiter = createClickIntentArbiter(() => () => {});
  const item: ContextSelectionItem = {
    id: "kpi:Revenue:trend:2026-08",
    view: "KPI",
    label: "Revenue · 2026-08",
    value: "210 EUR",
  };
  const target = kpiClickIntent({
    key: item.id,
    contextEnabled: kpiContextEnabled(contextSupported, true),
    onSingle: () => actions.toggleReversible(item),
    onDouble: () => {
      if (canSendTextMessage(host.getHostCapabilities())) {
        void sendTextMessage(host, "Show revenue trend");
      }
    },
    runConversation: actions.runConversation,
  });
  async function ack(index: number, accepted = true) {
    assertExists(requests[index]);
    requests[index].resolve(accepted ? {} : { isError: true });
    await flush();
  }
  return {
    requests,
    messages,
    controller,
    actions,
    arbiter,
    target,
    ack,
    item,
  };
}

Deno.test("KPI click toggles only context, and selection waits for the host ACK", async () => {
  const h = harness();
  h.arbiter.click(h.target, 1);
  await flush();
  assertEquals(h.requests.map((request) => request.ids), [[h.item.id]]);
  assertEquals(h.controller.getSnapshot().selections, []);
  assertEquals(h.messages, []);
  await h.ack(0);
  assertEquals(h.controller.getSnapshot().selections.length, 1);
  h.arbiter.click(h.target, 1);
  await flush();
  assertEquals(h.requests[1].ids, []);
  await h.ack(1);
  assertEquals(h.controller.getSnapshot().selections, []);
  assertEquals(h.messages, []);
  h.arbiter.cancelAll();
});

Deno.test("KPI native double-click waits for compensation before asking for details", async () => {
  const h = harness();
  h.arbiter.click(h.target, 1);
  h.arbiter.click(h.target, 2);
  h.arbiter.doubleClick(h.target);
  await flush();
  assertEquals(h.messages, []);
  await h.ack(0);
  assertEquals(h.requests[1].ids, []);
  assertEquals(h.messages, []);
  await h.ack(1);
  assertEquals(h.controller.getSnapshot().selections, []);
  assertEquals(h.messages, ["Show revenue trend"]);
  h.arbiter.cancelAll();
});

Deno.test("KPI double-click preserves an already selected month", async () => {
  const h = harness();
  const initial = h.actions.toggle(h.item);
  await flush();
  await h.ack(0);
  await initial;
  h.arbiter.click(h.target, 1);
  h.arbiter.click(h.target, 2);
  h.arbiter.doubleClick(h.target);
  await flush();
  assertEquals(h.requests[1].ids, []);
  await h.ack(1);
  assertEquals(h.requests[2].ids, [h.item.id]);
  assertEquals(h.messages, []);
  await h.ack(2);
  assertEquals(h.controller.getSnapshot().selections[0].item.id, h.item.id);
  assertEquals(h.messages, ["Show revenue trend"]);
  h.arbiter.cancelAll();
});

Deno.test("KPI failed compensation prevents a conversation with inconsistent context", async () => {
  const h = harness();
  h.arbiter.click(h.target, 1);
  h.arbiter.click(h.target, 2);
  h.arbiter.doubleClick(h.target);
  await flush();
  await h.ack(0);
  await h.ack(1, false);
  assertEquals(h.messages, []);
  assertEquals(h.controller.getSnapshot().failed, true);
  h.arbiter.cancelAll();
});

Deno.test("KPI message-only host stays neutral on click and Space, then asks on Enter", async () => {
  const h = harness(false);
  h.arbiter.click(h.target, 1);
  h.arbiter.keyDown(h.target, { key: " ", preventDefault() {} });
  await flush();
  assertEquals(h.requests, []);
  assertEquals(h.messages, []);
  assertEquals(h.controller.getSnapshot().failed, false);
  assertEquals(h.controller.getSnapshot().selections, []);
  h.arbiter.keyDown(h.target, { key: "Enter", preventDefault() {} });
  await flush();
  assertEquals(h.messages, ["Show revenue trend"]);
  assertEquals(h.controller.getSnapshot().selections, []);
  h.arbiter.cancelAll();
});

Deno.test("KPI serverTools alone never authorizes a conversation or a selection", async () => {
  const h = harness(false, false);
  h.arbiter.click(h.target, 1);
  h.arbiter.doubleClick(h.target);
  await flush();
  assertEquals(h.requests, []);
  assertEquals(h.messages, []);
  assertEquals(h.controller.getSnapshot().failed, false);
  h.arbiter.cancelAll();
});

Deno.test("KPI scalar and unavailable-detail shortcuts expose only supported gestures", () => {
  assertEquals(kpiContextEnabled(true, false), false);
  assertEquals(kpiContextEnabled(false, true), false);
  assertEquals(kpiContextEnabled(true, true), true);
  assertEquals(kpiKeyShortcuts(false, false), undefined);
  assertEquals(kpiKeyShortcuts(false, true), "Enter");
  assertEquals(kpiKeyShortcuts(true, false), "Space");
  assertEquals(kpiKeyShortcuts(true, true), "Space Enter");
});

Deno.test("KPI context-only buttons consume Enter and repeated keys without toggling", () => {
  let toggles = 0;
  let prevented = 0;
  for (
    const [key, repeat] of [["Enter", false], ["Enter", true], [
      " ",
      true,
    ]] as const
  ) {
    handleKpiContextKey(
      {
        key,
        repeat,
        preventDefault() {
          prevented++;
        },
      },
      true,
      () => toggles++,
    );
  }
  assertEquals(prevented, 3);
  assertEquals(toggles, 0);
  handleKpiContextKey(
    {
      key: " ",
      preventDefault() {
        prevented++;
      },
    },
    true,
    () => toggles++,
  );
  assertEquals(toggles, 1);
  assertEquals(prevented, 4);
  handleKpiContextKey(
    {
      key: " ",
      preventDefault() {
        prevented++;
      },
    },
    false,
    () => toggles++,
  );
  assertEquals(toggles, 1);
  assertEquals(prevented, 5);
});

Deno.test("KPI refresh accepts stable payloads and honors an explicit tool allowlist", () => {
  const tool = "erpnext_kpi_revenue";
  assertEquals(kpiCanRefresh({}, {}, tool), true);
  assertEquals(kpiCanRefresh(undefined, {}, tool), false);
  assertEquals(kpiCanRefresh({}, { _availableTools: [] }, tool), false);
  assertEquals(kpiCanRefresh({}, { _availableTools: [tool] }, tool), true);
  assertEquals(
    kpiCanRefresh({}, { _availableTools: ["another_tool"] }, tool),
    false,
  );
});

Deno.test("KPI uses its compact card when the metric and 300px trend cannot fit", () => {
  assertEquals(kpiCardLayout("wide", 480), "panel");
  assertEquals(kpiCardLayout("wide", 679), "panel");
  assertEquals(kpiCardLayout("wide", 680), "wide");
  assertEquals(kpiCardLayout("wide", 1280), "wide");
  assertEquals(kpiCardLayout("panel", 380), "panel");
  assertEquals(kpiCardLayout("mobile", 390), "mobile");
});

Deno.test("KPI message failures never offer data refresh as Retry", () => {
  let refreshes = 0;
  const refresh = () => {
    refreshes++;
  };
  const message = "Could not complete the request";
  const conversationRetry = kpiErrorRetry(
    { origin: "conversation", message },
    false,
    refresh,
  );
  assertEquals(conversationRetry, undefined);
  conversationRetry?.();
  assertEquals(refreshes, 0);
  kpiErrorRetry({ origin: "data", message }, false, refresh)?.();
  assertEquals(refreshes, 1);
  assertEquals(
    kpiErrorRetry({ origin: "data", message }, true, refresh),
    undefined,
  );
  assertEquals(
    kpiErrorRetry({ origin: "data", message }, false, undefined),
    undefined,
  );
});
