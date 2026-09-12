import { act } from "preact/test-utils";
import { mergeHostContext } from "../../shared/host-context.ts";
import { assert, assertEquals } from "@std/assert";
import { createElement } from "preact";
import { defineComponentRegistry } from "@casys/mcp-view-components";
import { definePreactComponent } from "@casys/mcp-view-components/preact";
import {
  fakeApp,
  PERMISSIONS,
  until,
  withDocument,
} from "@casys/mcp-view-components/testing";
import {
  SESSION_REJECTED_CODE,
  startBuyEvidenceApp,
  TOOL_RESULT_REJECTED_CODE,
  toSurfaceState,
} from "./app.ts";
import { BUY_COMPONENT_REGISTRY } from "./components.tsx";
import type { BuyEvidenceViewData } from "./model.ts";
import { sealBuySourceCapture } from "../../../buy/capture.ts";
import {
  syntheticAvailableSession,
  syntheticCapture,
  syntheticCompleteResult,
  syntheticPartialResult,
  syntheticUnavailableSession,
} from "../../../buy/synthetic.ts";

function probeRegistry() {
  return defineComponentRegistry<BuyEvidenceViewData>({
    components: {
      "buy.configuration-cost": definePreactComponent(
        { title: "Buy configuration cost" },
        ({ data }) =>
          createElement(
            "div",
            {
              class: "buy-evidence-probe",
              "data-coverage": data.coverage.status,
            },
            data.coverage.status,
            ...data.totals.map((total) =>
              createElement("span", {
                "data-total": total.kind,
              }, `${total.kind}:${total.amount}`)
            ),
          ),
      ),
    },
    defaultSurface: {
      layout: { type: "stack", gap: "sm" },
      components: [{
        id: "evidence",
        component: "buy.configuration-cost",
      }],
    },
  });
}

Deno.test({
  name: "official session apply renders a sealed complete result without fetch",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fetches: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        fetches.push(String(input));
        return originalFetch(input, init);
      };
      try {
        const fake = fakeApp(root);
        await startBuyEvidenceApp(root, probeRegistry(), fake.runtime);
        const initialText = root.textContent;
        await fake.session({
          schemaVersion: "unrelated-session/1.0",
          kind: "other",
        });
        assertEquals(root.textContent, initialText);
        const capture = await sealBuySourceCapture(await syntheticCapture());
        const result = await syntheticCompleteResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        );
        await fake.session(await syntheticAvailableSession(result));
        await until(
          () => root.querySelector(".buy-evidence-probe") !== null,
          "the sealed result mount",
        );
        const probe = root.querySelector(".buy-evidence-probe") as HTMLElement;
        assertEquals(probe.dataset.coverage, "complete");
        assert(probe.textContent?.includes("complete-total"));
        assertEquals(fetches, []);
        assertEquals(fake.reads, []);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }),
});

Deno.test({
  name: "official session apply keeps partial incomplete and skips ERP reads",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fetches: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input) => {
        fetches.push(String(input));
        return Promise.reject(new Error(`unexpected fetch ${input}`));
      };
      try {
        const fake = fakeApp(root);
        await startBuyEvidenceApp(root, probeRegistry(), fake.runtime);
        const capture = await sealBuySourceCapture(await syntheticCapture());
        const result = await syntheticPartialResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        );
        await fake.session(await syntheticAvailableSession(result));
        await until(
          () => root.querySelector("[data-coverage='partial']") !== null,
          "the partial mount",
        );
        assertEquals(
          root.querySelector("[data-total='complete-total']"),
          null,
        );
        assertEquals(fetches, []);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }),
});

Deno.test({
  name: "actual DocumentSurface renders source-backed catalogue identity",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fetches: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input) => {
        fetches.push(String(input));
        return Promise.reject(new Error(`unexpected fetch ${input}`));
      };
      try {
        const fake = fakeApp(root);
        await startBuyEvidenceApp(root, BUY_COMPONENT_REGISTRY, fake.runtime);
        const capture = await sealBuySourceCapture(await syntheticCapture());
        const result = await syntheticCompleteResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        );
        const line = result.lines[0];
        await fake.session(await syntheticAvailableSession(result));
        await until(
          () => (root.textContent ?? "").includes("ITEM-PRICE-SYNTHETIC-001"),
          "the catalogue source name",
        );
        const text = root.textContent ?? "";
        assert(text.includes(line.itemCode ?? ""));
        assert(
          line.source.kind === "erpnext-document" &&
            text.includes(line.source.name),
        );
        assert(text.includes(line.currency));
        assert(text.includes(line.unitPrice));
        assert(text.includes(line.priceDate));
        assert(text.includes("synthetic test input"));
        assert(text.includes("Source"));
        assertEquals(fetches, []);
        assertEquals(fake.reads, []);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }),
});

Deno.test({
  name: "raw tool result evidence is rejected; only a recorded session mounts",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startBuyEvidenceApp(root, probeRegistry(), fake.runtime);
      const capture = await sealBuySourceCapture(await syntheticCapture());
      const result = await syntheticCompleteResult(
        capture.fingerprint,
        capture.capture.sourceInstance.siteId,
      );
      await fake.toolResult({ structuredContent: result });
      await until(
        () =>
          root.querySelector(".buy-evidence-probe") === null &&
          (root.textContent ?? "").includes("not evidence"),
        "the raw tool result rejection",
      );
      assertEquals(root.querySelector(".buy-evidence-probe"), null);
      const rejected = toSurfaceState({
        kind: "error",
        message: "This App accepts a recorded session only.",
      });
      assertEquals(rejected.kind, "error");
      await fake.session(await syntheticAvailableSession(result));
      await until(
        () => root.querySelector(".buy-evidence-probe") !== null,
        "the sealed session mount after rejecting the tool result",
      );
      assertEquals(
        root.querySelector(".buy-evidence-probe")?.getAttribute(
          "data-coverage",
        ),
        "complete",
      );
      assertEquals(SESSION_REJECTED_CODE, "session-rejected");
      assertEquals(TOOL_RESULT_REJECTED_CODE, "tool-result-rejected");
    }),
});

Deno.test({
  name: "unavailable session stays unavailable without a result mount",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startBuyEvidenceApp(root, probeRegistry(), fake.runtime);
      const capture = await sealBuySourceCapture(await syntheticCapture());
      await fake.session(
        await syntheticUnavailableSession(capture.fingerprint),
      );
      await until(
        () => root.textContent?.includes("unavailable") === true,
        "the unavailable notice",
      );
      assertEquals(root.querySelector(".buy-evidence-probe"), null);
      const notice = toSurfaceState({
        kind: "unavailable",
        status: "unavailable",
        reason: "unavailable recorded bundle bytes",
      });
      assertEquals(notice.kind, "notice");
      if (notice.kind === "notice") assertEquals(notice.code, "unavailable");
    }),
});

Deno.test({
  name:
    "Buy result fields follow the French host locale and subsequent locale changes",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root, { hostContext: { locale: "fr-FR" } });
      const handle = await startBuyEvidenceApp(
        root,
        BUY_COMPONENT_REGISTRY,
        fake.runtime,
      );
      try {
        const capture = await sealBuySourceCapture(await syntheticCapture());
        const result = await syntheticCompleteResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        );
        await act(async () => {
          await fake.session(await syntheticAvailableSession(result));
        });
        await until(
          () => (root.textContent ?? "").includes("Couverture"),
          "French result fields",
        );
        await act(async () => {
          fake.hostContextChanged({ locale: "en-US" });
          await fake.idle();
        });
        await until(
          () => (root.textContent ?? "").includes("Coverage"),
          "English result fields after host change",
        );
      } finally {
        await handle.dispose();
        mergeHostContext({ locale: "en-US" });
      }
    }),
});
