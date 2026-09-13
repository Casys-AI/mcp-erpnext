import { act } from "preact/test-utils";
import { mergeHostContext } from "../../shared/host-context.ts";
import { assert, assertEquals } from "@std/assert";
import { createElement } from "preact";
import { defineComponentRegistry } from "@casys/mcp-view-components";
import { definePreactComponent } from "@casys/mcp-view-components/preact";
import {
  type FakeApp,
  fakeApp,
  PERMISSIONS,
  until,
  withDocument,
} from "@casys/mcp-view-components/testing";
import {
  SESSION_REJECTED_CODE,
  startRecordedDocumentApp,
  TOOL_RESULT_REJECTED_CODE,
  toSurfaceState,
} from "./app.ts";
import { RECORDED_COMPONENT_REGISTRY } from "./components.tsx";
import type { RecordedDocumentViewData } from "./model.ts";
import { displayStateFromViewerSession } from "./model.ts";
import {
  RECORDED_FIXTURE_KINDS,
  type RecordedFixtureKind,
  SYNTHETIC_RECORDED_HISTORICAL_REASON,
  syntheticAvailableRecordedSession,
  syntheticSealedRecord,
  syntheticUnavailableRecordedSession,
} from "../../../recorded-document/synthetic.ts";

const DOSSIER_TITLES: Record<RecordedFixtureKind, string> = {
  project: "Project delivery",
  task: "Task dossier",
  timesheet: "Time & billing",
  bom: "Bill of materials",
  "work-order": "Production dossier",
  "job-card": "Operation dossier",
};

interface HostCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

function installHostSpies(fake: FakeApp): HostCall[] {
  const calls: HostCall[] = [];
  const app = (fake.handle().ctx as unknown as {
    app: Record<string, unknown>;
  }).app;
  for (
    const method of [
      "callServerTool",
      "sendMessage",
      "openLink",
      "updateModelContext",
      "requestDisplayMode",
    ]
  ) {
    app[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.reject(new Error(`unexpected host ${method}`));
    };
  }
  return calls;
}

async function withRejectedFetch<T>(
  fn: (fetches: string[]) => Promise<T>,
): Promise<T> {
  const fetches: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown) => {
    fetches.push(String(input));
    return Promise.reject(new Error(`unexpected fetch ${String(input)}`));
  }) as typeof fetch;
  try {
    return await fn(fetches);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** Test hygiene for the global host-context locale shared across mounts. */
function resetHostLocale(): void {
  mergeHostContext({ locale: "en-US" });
}

/**
 * Dispatch a click carrying `detail`, like a real browser does
 * (`element.click()` sends `detail: 0`). Linkedom freezes `detail` to
 * `undefined` on its own events, which the shared detail-toggle guard
 * (`acceptsDetailToggleClick`, unit-tested in shared/) legitimately refuses.
 * The Proxy only restores the browser behavior; the toggle path stays the
 * production one.
 */
function clickWithDetail(element: HTMLElement, detail: number): void {
  const doc = element.ownerDocument ?? globalThis.document;
  const base = (
    doc as unknown as { createEvent(type: string): Event }
  ).createEvent("Event");
  base.initEvent("click", true, true);
  // Plain-object target: the only configurable slot for `detail`, which
  // linkedom freezes to `undefined` on its own events. Dispatch-written
  // fields (target, eventPhase, _path) land here too and shadow the base
  // event exactly like a native dispatch would.
  const shadow: Record<string | symbol, unknown> = {};
  const event = new Proxy(shadow, {
    get(target, prop, _receiver) {
      if (prop === "detail") return detail;
      if (prop in target) return target[prop];
      const value = Reflect.get(base, prop, base);
      return typeof value === "function" ? value.bind(base) : value;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  element.dispatchEvent(event as unknown as Event);
}

function probeRegistry() {
  return defineComponentRegistry<RecordedDocumentViewData>({
    components: {
      "recorded.document": definePreactComponent(
        { title: "Recorded document" },
        ({ data }) =>
          createElement(
            "div",
            {
              class: "recorded-document-probe",
              "data-doctype": data.record.doctype,
              "data-name": data.record.name,
            },
            `${data.record.doctype}:${data.record.name}`,
          ),
      ),
    },
    defaultSurface: {
      layout: { type: "stack", gap: "sm" },
      components: [{ id: "document", component: "recorded.document" }],
    },
  });
}

Deno.test({
  name:
    "official session apply renders the six recorded profiles without host calls",
  permissions: PERMISSIONS,
  fn: async () => {
    resetHostLocale();
    for (const kind of RECORDED_FIXTURE_KINDS) {
      await withDocument(async (root) => {
        await withRejectedFetch(async (fetches) => {
          const fake = fakeApp(root);
          await startRecordedDocumentApp(
            root,
            RECORDED_COMPONENT_REGISTRY,
            fake.runtime,
          );
          const calls = installHostSpies(fake);
          const record = await syntheticSealedRecord(kind);
          await fake.session(await syntheticAvailableRecordedSession(record));
          await until(
            () => root.querySelector(".recorded-document-banner") !== null,
            `the ${kind} banner`,
          );
          const text = root.textContent ?? "";
          assert(text.includes("Recorded document"), kind);
          assert(text.includes(record.doctype), kind);
          assert(text.includes(record.name), kind);
          assert(text.includes(record.modified), kind);
          assert(text.includes(record.observedAt), kind);
          assert(
            text.includes(record.sourceInstance.siteId.slice(0, 18)),
            kind,
          );
          assert(text.includes(DOSSIER_TITLES[kind]), kind);
          assert(root.querySelector("a") === null);
          assert(root.querySelector("img") === null);
          assert(
            root.querySelector('input[type="file"]') === null,
            "no upload control",
          );
          assertEquals(fetches, []);
          assertEquals(fake.reads, []);
          assertEquals(calls, []);
        });
      });
    }
  },
});

Deno.test({
  name: "raw tool result is rejected; only a recorded session mounts",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startRecordedDocumentApp(root, probeRegistry(), fake.runtime);
      const record = await syntheticSealedRecord("project");
      await fake.toolResult({
        structuredContent: record as unknown as Record<string, unknown>,
      });
      await until(
        () =>
          root.querySelector(".recorded-document-probe") === null &&
          (root.textContent ?? "").includes("not evidence"),
        "the raw tool result rejection",
      );
      const rejected = toSurfaceState({
        kind: "error",
        message: "This App accepts a recorded session only.",
      });
      assertEquals(rejected.kind, "error");
      await fake.session(await syntheticAvailableRecordedSession(record));
      await until(
        () => root.querySelector(".recorded-document-probe") !== null,
        "the recorded session mount after rejecting the tool result",
      );
      assertEquals(SESSION_REJECTED_CODE, "session-rejected");
      assertEquals(TOOL_RESULT_REJECTED_CODE, "tool-result-rejected");
    }),
});

Deno.test({
  name:
    "unavailable session replaces a mounted document with its explicit reason",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startRecordedDocumentApp(root, probeRegistry(), fake.runtime);
      const record = await syntheticSealedRecord("project");
      await fake.session(await syntheticAvailableRecordedSession(record));
      await until(
        () => root.querySelector(".recorded-document-probe") !== null,
        "the project mount",
      );
      await fake.session(await syntheticUnavailableRecordedSession(record));
      await until(
        () =>
          root.querySelector(".recorded-document-probe") === null &&
          (root.textContent ?? "").includes(
            "unavailable recorded document bytes",
          ),
        "the unavailable replacement",
      );
      const notice = toSurfaceState({
        kind: "unavailable",
        status: "unavailable",
        reason: "unavailable recorded document bytes",
      });
      assertEquals(notice.kind, "notice");
      if (notice.kind === "notice") assertEquals(notice.code, "unavailable");
    }),
});

Deno.test({
  name: "invalid session replaces a mounted document with an explicit error",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startRecordedDocumentApp(root, probeRegistry(), fake.runtime);
      const record = await syntheticSealedRecord("task");
      await fake.session(await syntheticAvailableRecordedSession(record));
      await until(
        () => root.querySelector(".recorded-document-probe") !== null,
        "the task mount",
      );
      const tampered = await syntheticAvailableRecordedSession(record);
      await fake.session({
        ...tampered,
        basis: { ...tampered.basis, projectId: "other-project" },
      });
      await until(
        () =>
          root.querySelector(".recorded-document-probe") === null &&
          (root.textContent ?? "").includes(
            "Rejected io.casys.mcp-erpnext.recorded-document-session/1.0 session",
          ),
        "the invalid-session replacement",
      );
    }),
});

Deno.test({
  name:
    "mount, replacement, expansion, tabs, theme, locale, focus, and visibility stay host-silent",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      await withRejectedFetch(async (fetches) => {
        const listenerTypes: string[] = [];
        const ownerDocument = root.ownerDocument ?? globalThis.document;
        const originalDocumentListener = ownerDocument.addEventListener.bind(
          ownerDocument,
        );
        const originalGlobalListener = globalThis.addEventListener.bind(
          globalThis,
        );
        ownerDocument.addEventListener =
          ((type: string, ...rest: unknown[]) => {
            listenerTypes.push(`document:${type}`);
            return (originalDocumentListener as (...args: unknown[]) => void)(
              type,
              ...rest,
            );
          }) as typeof ownerDocument.addEventListener;
        globalThis.addEventListener = ((type: string, ...rest: unknown[]) => {
          listenerTypes.push(`global:${type}`);
          return (originalGlobalListener as (...args: unknown[]) => void)(
            type,
            ...rest,
          );
        }) as typeof globalThis.addEventListener;
        try {
          const fake = fakeApp(root, {
            hostContext: {
              containerDimensions: { width: 360 },
              deviceCapabilities: { touch: true },
            },
          });
          await startRecordedDocumentApp(
            root,
            RECORDED_COMPONENT_REGISTRY,
            fake.runtime,
          );
          const calls = installHostSpies(fake);
          assertEquals(fetches, []);
          assertEquals(fake.reads, []);
          assertEquals(calls, []);

          await fake.session(
            await syntheticAvailableRecordedSession(
              await syntheticSealedRecord("work-order"),
            ),
          );
          await until(
            () => root.querySelector('[role="tablist"]') !== null,
            "mobile section tabs",
          );
          const tabs = () =>
            Array.from(root.querySelectorAll('[role="tab"]')) as HTMLElement[];
          assert(tabs().length >= 2, "expected overview plus table tabs");
          await act(async () => {
            tabs()[1].click();
          });
          await until(
            () => tabs()[1].getAttribute("aria-selected") === "true",
            "the section tab switch",
          );

          const toggle = root.querySelector(
            "button.detail-toggle",
          ) as HTMLElement | null;
          assert(toggle, "expected a row disclosure toggle");
          const panelId = toggle.getAttribute("aria-controls");
          assert(panelId, "expected a disclosure panel id");
          await act(async () => {
            clickWithDetail(toggle, 1);
          });
          await until(
            () => toggle.getAttribute("aria-expanded") === "true",
            "the local row expansion",
          );
          const panel = ownerDocument.getElementById(panelId);
          assertEquals(panel?.hasAttribute("hidden"), false);

          await fake.session(
            await syntheticAvailableRecordedSession(
              await syntheticSealedRecord("task"),
            ),
          );
          await until(
            () =>
              (root.textContent ?? "").includes("SYNTH-TASK-0142") &&
              !(root.textContent ?? "").includes("SYNTH-MFG-WO-0026"),
            "the session replacement",
          );

          await act(async () => {
            fake.hostContextChanged({ theme: "dark", locale: "fr-FR" });
            await fake.idle();
          });
          await until(
            () => (root.textContent ?? "").includes("Document enregistré"),
            "French fields after host change",
          );

          const before = root.textContent;
          globalThis.dispatchEvent(new Event("focus"));
          await fake.idle();
          assertEquals(root.textContent, before);
          assertEquals(
            listenerTypes.filter((type) =>
              type.endsWith(":focus") || type.endsWith(":visibilitychange")
            ),
            [],
            `no focus/visibility listeners allowed, saw: ${
              listenerTypes.join(", ")
            }`,
          );
          assertEquals(fetches, []);
          assertEquals(fake.reads, []);
          assertEquals(calls, []);
        } finally {
          ownerDocument.addEventListener = originalDocumentListener;
          globalThis.addEventListener = originalGlobalListener;
          resetHostLocale();
        }
      });
    }),
});

Deno.test({
  name: "a slow first validation cannot overwrite a newer session",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      const first = await syntheticSealedRecord("project");
      const second = await syntheticSealedRecord("bom");
      const sessionA = await syntheticAvailableRecordedSession(first);
      const sessionB = await syntheticAvailableRecordedSession(second);
      const delays = new Map([
        [sessionA.basis.sessionFingerprint, 30],
        [sessionB.basis.sessionFingerprint, 0],
      ]);
      await startRecordedDocumentApp(
        root,
        probeRegistry(),
        fake.runtime,
        async (value) => {
          const fingerprint =
            (value as { basis?: { sessionFingerprint?: unknown } }).basis
              ?.sessionFingerprint;
          await new Promise((resolve) =>
            setTimeout(resolve, delays.get(fingerprint as string) ?? 0)
          );
          return await displayStateFromViewerSession(value);
        },
      );
      const subscription = fake.config().viewerSession;
      assert(subscription, "expected a viewerSession subscription");
      const pending = [
        subscription.onSession(
          sessionA,
          { data: sessionA } as never,
          fake.handle(),
        ),
        subscription.onSession(
          sessionB,
          { data: sessionB } as never,
          fake.handle(),
        ),
      ];
      await Promise.all(pending);
      await fake.idle();
      await until(
        () => root.querySelector('[data-name="SYNTH-BOM-BASE-001"]') !== null,
        "the latest session winning",
      );
      assert(
        root.querySelector('[data-name="SYNTH-PROJ-0042"]') === null,
        "the stale slow session must not overwrite the newer one",
      );
    }),
});

Deno.test({
  name: "recorded URL, HTML, and image strings render as inert text",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      await withRejectedFetch(async (fetches) => {
        const fake = fakeApp(root);
        await startRecordedDocumentApp(
          root,
          RECORDED_COMPONENT_REGISTRY,
          fake.runtime,
        );
        const calls = installHostSpies(fake);
        const record = await syntheticSealedRecord("task", {
          description:
            'See https://example.invalid/synth-plan and <b>bold</b> <img src="https://example.invalid/x.png">.',
        });
        await fake.session(await syntheticAvailableRecordedSession(record));
        await until(
          () =>
            (root.textContent ?? "").includes(
              "https://example.invalid/synth-plan",
            ),
          "the inert URL text",
        );
        const text = root.textContent ?? "";
        assert(text.includes("<b>bold</b>"));
        assert(text.includes('<img src="https://example.invalid/x.png">'));
        assert(root.querySelector("a") === null);
        assert(root.querySelector("img") === null);
        assert(root.querySelector("b") === null);
        assertEquals(fetches, []);
        assertEquals(fake.reads, []);
        assertEquals(calls, []);
      });
    }),
});

Deno.test({
  name: "historical status shows only when the session supplies it",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root);
      await startRecordedDocumentApp(
        root,
        RECORDED_COMPONENT_REGISTRY,
        fake.runtime,
      );
      const record = await syntheticSealedRecord("timesheet");
      await fake.session(await syntheticAvailableRecordedSession(record));
      await until(
        () => root.querySelector(".recorded-document-banner") !== null,
        "the plain mount",
      );
      assertEquals(
        (root.textContent ?? "").includes("Historical status"),
        false,
      );
      await fake.session(
        await syntheticAvailableRecordedSession(record, {
          historicalReason: SYNTHETIC_RECORDED_HISTORICAL_REASON,
        }),
      );
      await until(
        () =>
          (root.textContent ?? "").includes(
            SYNTHETIC_RECORDED_HISTORICAL_REASON,
          ),
        "the historical replacement",
      );
      assert((root.textContent ?? "").includes("Historical record"));
    }),
});

Deno.test({
  name: "recorded fields follow FR/ZH host locales and back to EN",
  permissions: PERMISSIONS,
  fn: () =>
    withDocument(async (root) => {
      const fake = fakeApp(root, { hostContext: { locale: "fr-FR" } });
      const handle = await startRecordedDocumentApp(
        root,
        RECORDED_COMPONENT_REGISTRY,
        fake.runtime,
      );
      try {
        const record = await syntheticSealedRecord("job-card");
        await act(async () => {
          await fake.session(await syntheticAvailableRecordedSession(record));
        });
        await until(
          () => (root.textContent ?? "").includes("Document enregistré"),
          "French recorded fields",
        );
        await act(async () => {
          fake.hostContextChanged({ locale: "zh-CN" });
          await fake.idle();
        });
        await until(
          () => (root.textContent ?? "").includes("已记录文档"),
          "Chinese recorded fields after host change",
        );
        await act(async () => {
          fake.hostContextChanged({ locale: "en-US" });
          await fake.idle();
        });
        await until(
          () => (root.textContent ?? "").includes("Recorded document"),
          "English recorded fields after host change",
        );
      } finally {
        await handle.dispose();
        mergeHostContext({ locale: "en-US" });
      }
    }),
});

Deno.test({
  name:
    "narrow mount uses section tabs while wide mount shows the dossier strip",
  permissions: PERMISSIONS,
  fn: async () => {
    await withDocument(async (root) => {
      const fake = fakeApp(root, {
        hostContext: {
          containerDimensions: { width: 360 },
          deviceCapabilities: { touch: true },
        },
      });
      await startRecordedDocumentApp(
        root,
        RECORDED_COMPONENT_REGISTRY,
        fake.runtime,
      );
      await fake.session(
        await syntheticAvailableRecordedSession(
          await syntheticSealedRecord("project"),
        ),
      );
      await until(
        () => root.querySelector('[role="tablist"]') !== null,
        "narrow section tabs",
      );
      assert(
        (root.querySelectorAll('[role="tab"]') ?? []).length >= 2,
        "expected overview plus table tabs",
      );
    });
    await withDocument(async (root) => {
      resetHostLocale();
      const fake = fakeApp(root);
      await startRecordedDocumentApp(
        root,
        RECORDED_COMPONENT_REGISTRY,
        fake.runtime,
      );
      await fake.session(
        await syntheticAvailableRecordedSession(
          await syntheticSealedRecord("project"),
        ),
      );
      await until(
        () => (root.textContent ?? "").includes("Project delivery"),
        "the wide dossier strip",
      );
      assert(root.querySelector('[role="tablist"]') === null);
    });
  },
});
