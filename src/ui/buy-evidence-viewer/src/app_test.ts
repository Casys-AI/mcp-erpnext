import { act } from "preact/test-utils";
import { App } from "@modelcontextprotocol/ext-apps";
import { createPanelContexts } from "@mcpview/compose/code-mode/board";
import { mountSession } from "./session-view.ts";
import { mergeHostContext } from "../../shared/host-context.ts";
import { assert, assertEquals } from "@std/assert";
import { createElement } from "preact";
import { defineComponentRegistry } from "@mcpview/components";
import { definePreactComponent } from "@mcpview/components/preact";
import {
  fakeApp,
  PERMISSIONS,
  until,
  withDocument,
} from "@mcpview/components/testing";
import {
  SESSION_REJECTED_CODE,
  startBuyEvidenceApp,
  TOOL_RESULT_REJECTED_CODE,
  toSurfaceState,
} from "./app.ts";
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
        await startBuyEvidenceApp(root, undefined, fake.runtime);
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
        undefined,
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

Deno.test({
  name:
    "Buy pins share verified references, survive locale remounts and retire on replacement or rejection",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      const handle = await startBuyEvidenceApp(root, undefined, fake.runtime);
      const snapshots: Array<
        {
          items?: Array<
            {
              id: string;
              value: string;
              fields: Array<{ label: string; value: string }>;
            }
          >;
        }
      > = [];
      Object.assign(fake.handle().ctx.app, {
        getHostCapabilities: () => ({
          updateModelContext: { structuredContent: {} },
        }),
        updateModelContext: (
          request: { structuredContent: typeof snapshots[number] },
        ) => {
          snapshots.push(request.structuredContent);
          return Promise.resolve({});
        },
      });
      const capture = await sealBuySourceCapture(await syntheticCapture());
      const complete = await syntheticAvailableSession(
        await syntheticCompleteResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        ),
      );
      const partial = await syntheticAvailableSession(
        await syntheticPartialResult(
          capture.fingerprint,
          capture.capture.sourceInstance.siteId,
        ),
      );
      const pin = () =>
        root.querySelector<HTMLElement>("[data-visual-item][aria-pressed]");
      try {
        await act(() => fake.session(complete));
        assert(pin());
        assertEquals(snapshots.length, 0);
        await act(async () => {
          toggleEvidence(pin()!);
          await until(() => snapshots.length === 1, "first pin");
        });
        assertEquals(
          snapshots[0].items?.[0].id,
          `buy-evidence:${complete.basis.sessionFingerprint}`,
        );
        assertEquals(snapshots[0].items?.[0].value, "complete");
        await act(async () => {
          fake.hostContextChanged({ locale: "fr-FR" });
          await fake.idle();
        });
        await until(() => !!pin(), "localized pin");
        assertEquals(pin()?.getAttribute("aria-pressed"), "true");
        assertEquals(snapshots.length, 1);
        await act(() => fake.session(partial));
        await until(() => snapshots.length === 2, "old evidence removed");
        assertEquals(snapshots[1], {});
        assertEquals(pin()?.getAttribute("aria-pressed"), "false");
        await act(async () => {
          toggleEvidence(pin()!);
          await until(() => snapshots.length === 3, "new pin");
        });
        assertEquals(
          snapshots[2].items?.[0].id,
          `buy-evidence:${partial.basis.sessionFingerprint}`,
        );
        assertEquals(snapshots[2].items?.[0].value, "partial");
        assert(
          snapshots[2].items![0].fields.some((f) => f.value.includes("EUR")),
        );
        assert(!JSON.stringify(snapshots[2]).includes("sourceCaptures"));
        await act(() =>
          fake.session({
            ...partial,
            basis: { ...partial.basis, projectId: "different" },
          })
        );
        await until(() => snapshots.length === 4, "rejected evidence removed");
        assertEquals(snapshots[3], {});
        assertEquals(pin(), null);
        assertEquals(fake.reads, []);
      } finally {
        await handle.dispose();
        mergeHostContext({ locale: "en", theme: "light" });
      }
    }),
});

function toggleEvidence(element: HTMLElement) {
  for (const count of [1, 2]) {
    const event = element.ownerDocument.createEvent("CustomEvent");
    event.initCustomEvent("click", true, true, count);
    element.dispatchEvent(event);
  }
}

Deno.test({
  name:
    "declared Buy session uses its Compose panel context and honors the connected host capability",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const captured = await sealBuySourceCapture(await syntheticCapture());
      const session = await syntheticAvailableSession(
        await syntheticPartialResult(
          captured.fingerprint,
          captured.capture.sourceInstance.siteId,
        ),
      );
      const lifetime = new AbortController();
      const updates: Array<{ structuredContent?: Record<string, unknown> }> =
        [];
      const context = createPanelContexts((value) => {
        updates.push(value);
        return Promise.resolve({});
      });
      const sibling = { structuredContent: { invoice: "INV-FIXTURE" } };
      await context.forPanel("invoice", "Invoice", lifetime.signal)(sibling);
      const app = new App({ name: "Panel", version: "1" }, {});
      Object.assign(app, {
        getHostContext: () => ({}),
        getHostCapabilities: () => ({
          updateModelContext: { structuredContent: {} },
        }),
        updateModelContext: context.forPanel(
          "buy",
          "Evidence",
          lifetime.signal,
        ),
      });
      const mount = await mountSession(
        root,
        app,
        { ...session },
        lifetime.signal,
      );
      try {
        await until(
          () => !!root.querySelector("[data-visual-item][aria-pressed]"),
          "mounted panel pin",
        );
        const pin = root.querySelector<HTMLElement>(
          "[data-visual-item][aria-pressed]",
        )!;
        await act(async () => {
          toggleEvidence(pin);
          await until(() => updates.length === 2, "panel aggregation");
        });
        const both = updates[1].structuredContent?.panels as Array<
          { title: string; context: Record<string, unknown> }
        >;
        assertEquals(both[0], {
          title: "Invoice",
          context: sibling.structuredContent,
        });
        assertEquals(both[1].title, "Evidence");
        assert(
          JSON.stringify(both[1].context).includes(
            session.basis.sessionFingerprint,
          ),
        );
        await act(async () => {
          toggleEvidence(pin);
          await until(() => updates.length === 3, "remove only evidence");
        });
        assertEquals(updates[2], sibling);
      } finally {
        mount.dispose();
      }

      Object.assign(app, { getHostCapabilities: () => ({}) });
      const readonly = await mountSession(
        root,
        app,
        { ...session },
        lifetime.signal,
      );
      try {
        await until(
          () => !!root.querySelector(".buy-evidence-shell"),
          "read-only evidence",
        );
        assertEquals(
          root.querySelector("[data-visual-item][aria-pressed]"),
          null,
        );
        assertEquals(updates.length, 3);
      } finally {
        readonly.dispose();
      }
    }),
});
