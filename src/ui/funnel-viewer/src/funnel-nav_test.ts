import { assertEquals } from "@std/assert";
import { setLocaleSource } from "../../shared/format.ts";
import type {
  TextMessageCapabilities,
  TextMessageHost,
} from "../../shared/host-message.ts";
import { translatorForLocale } from "../../shared/i18n.ts";
import type { UiRefreshRequestData } from "../../shared/refresh.ts";
import {
  canRefreshFunnel,
  funnelStageValueText,
  sendFunnelMessage,
  stageMessage,
} from "./funnel-nav.ts";

const refreshRequest: UiRefreshRequestData = {
  toolName: "erpnext_sales_funnel",
  arguments: { company: "Example" },
};

Deno.test("funnel refresh supports stable payloads without a tool manifest, including empty stages", () => {
  for (
    const payload of [{ stages: [] }, { title: "Sales Pipeline" }, undefined]
  ) {
    assertEquals(canRefreshFunnel(payload, refreshRequest, {}), true);
  }
  assertEquals(
    canRefreshFunnel(
      { stages: [], _availableTools: [refreshRequest.toolName] },
      refreshRequest,
      {},
    ),
    true,
  );
});

Deno.test("funnel refresh rejects explicit empty, denied and malformed tool manifests", () => {
  for (
    const available of [[], ["erpnext_customer_list"], null, undefined, "all"]
  ) {
    assertEquals(
      canRefreshFunnel({ _availableTools: available }, refreshRequest, {}),
      false,
    );
  }
});

Deno.test("funnel refresh requires both a refresh request and host server tools", () => {
  assertEquals(canRefreshFunnel({}, null, {}), false);
  for (const serverTools of [undefined, null, false]) {
    assertEquals(canRefreshFunnel({}, refreshRequest, serverTools), false);
  }
});

function messageHost(
  capabilities: TextMessageCapabilities | undefined,
  response: () => Promise<unknown> = () => Promise.resolve({}),
) {
  const calls: Parameters<TextMessageHost["sendMessage"]>[0][] = [];
  const host: TextMessageHost = {
    getHostCapabilities: () => capabilities,
    sendMessage(params) {
      calls.push(params);
      return response();
    },
  };
  return { host, calls };
}

Deno.test("funnel message without message.text returns none without sending", async () => {
  for (
    const capabilities of [
      undefined,
      {},
      { serverTools: {} },
      { message: {} },
      { message: { text: null } },
    ]
  ) {
    const { host, calls } = messageHost(capabilities);
    assertEquals(await sendFunnelMessage(host, "Show all leads"), "none");
    assertEquals(calls, []);
  }
});

Deno.test("funnel message success sends exactly one request with the requested text", async () => {
  for (const result of [{}, { isError: false }, undefined]) {
    const { host, calls } = messageHost(
      { message: { text: {} } },
      () => Promise.resolve(result),
    );
    assertEquals(await sendFunnelMessage(host, "Show all leads"), "message");
    assertEquals(calls, [{
      role: "user",
      content: [{ type: "text", text: "Show all leads" }],
    }]);
  }
});

Deno.test("funnel message reports returned errors, rejection and thrown errors without retrying", async () => {
  for (
    const response of [
      () => Promise.resolve({ isError: true }),
      () => Promise.reject(new Error("Host rejected message")),
      () => {
        throw new Error("Host send failed");
      },
    ]
  ) {
    const { host, calls } = messageHost({ message: { text: {} } }, response);
    assertEquals(await sendFunnelMessage(host, "Show all leads"), "error");
    assertEquals(calls.length, 1);
  }
});

Deno.test("funnel conversation uses the explicit stage message before a fallback", () => {
  const fallbackLabels: string[] = [];
  const message = stageMessage(
    {
      label: "Opportunities",
      _drillDown: "  Show opportunities for this region  ",
    },
    (label) => {
      fallbackLabels.push(label);
      return "Show all opportunities";
    },
  );
  assertEquals(message, "Show opportunities for this region");
  assertEquals(fallbackLabels, []);
});

Deno.test("funnel conversation retains the localized fallback for a known stage", () => {
  for (const locale of ["en-US", "fr-FR", "zh-TW"]) {
    const t = translatorForLocale(locale);
    const fallback = (label: string) =>
      label === "Leads" ? t("funnel.drill_down.leads") : undefined;
    for (const explicit of [undefined, "", "   "]) {
      assertEquals(
        stageMessage({ label: "Leads", _drillDown: explicit }, fallback),
        t("funnel.drill_down.leads"),
      );
    }
    assertEquals(stageMessage({ label: "Custom stage" }, fallback), undefined);
  }
});

Deno.test("funnel stage amounts use payload currency and the current host locale", () => {
  let locale = "en-US";
  setLocaleSource(() => locale);
  try {
    for (const hostLocale of ["en-US", "fr-FR", "zh-TW"]) {
      locale = hostLocale;
      for (const currency of ["GBP", "USD", "TWD"]) {
        assertEquals(
          funnelStageValueText(1234.5, currency),
          new Intl.NumberFormat(hostLocale, {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(1234.5),
        );
      }
    }
    assertEquals(
      funnelStageValueText(1234.5, undefined),
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1234.5),
    );
  } finally {
    setLocaleSource(() => undefined);
  }
});

Deno.test("funnel keeps the empty amount marker for stages without a positive amount", () => {
  for (const value of [undefined, null, 0, -1]) {
    assertEquals(funnelStageValueText(value, "GBP"), "—");
  }
});

Deno.test("funnel root does not import inline navigation or document context surfaces", async () => {
  const source = await Deno.readTextFile(
    new URL("./FunnelViewer.tsx", import.meta.url),
  );
  for (
    const forbidden of [
      "useViewerNav",
      "PathBar",
      "LevelBody",
      "DocumentContext",
      "_stageJumps",
      "jumpFromHint",
    ]
  ) {
    assertEquals(source.includes(forbidden), false, forbidden);
  }
});
