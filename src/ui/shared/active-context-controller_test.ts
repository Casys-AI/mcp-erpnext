import { assertEquals, assertExists } from "@std/assert";
import { createActiveContextController } from "./active-context-controller.ts";
import type { ActiveContextFlowHost } from "./active-context-flow.ts";
import type { ContextSelectionItem } from "./active-context.ts";
import { type ClickIntent, createClickIntentArbiter } from "./click-intent.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
function item(id: string, value = id): ContextSelectionItem {
  return { id, label: id, view: "chart", value };
}
function harness() {
  const requests: {
    ids: string[];
    response: ReturnType<typeof deferred<unknown>>;
  }[] = [];
  const host: ActiveContextFlowHost = {
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {} },
      message: { text: {} },
    }),
    updateModelContext(params) {
      const response = deferred<unknown>();
      const items =
        (params.structuredContent?.items ?? []) as ContextSelectionItem[];
      requests.push({ ids: items.map((entry) => entry.id), response });
      return response.promise;
    },
    sendMessage: () => Promise.resolve({}),
  };
  const controller = createActiveContextController(host, "root");
  const actions = controller.actionsForScope("root");
  const arbiter = createClickIntentArbiter(() => () => {});
  let opened = 0;
  const intent = (
    id = "A",
    policy: ClickIntent["doublePolicy"] = "local",
  ): ClickIntent => ({
    key: id,
    onSingle: () => actions.toggleReversible(item(id)),
    onDouble: () => {
      opened++;
    },
    runConversation: actions.runConversation,
    doublePolicy: policy,
  });
  async function ack(index: number, accepted = true) {
    assertExists(requests[index], `request ${index}`);
    if (accepted) requests[index].response.resolve({});
    else requests[index].response.reject(new Error("host rejected context"));
    await flush();
  }
  async function seed(...ids: string[]) {
    for (const id of ids) {
      const index = requests.length;
      const added = actions.activate(item(id));
      await flush();
      await ack(index);
      await added;
    }
  }
  return {
    controller,
    actions,
    arbiter,
    requests,
    intent,
    ack,
    seed,
    opened: () => opened,
    ids: () =>
      controller.getSnapshot().selections.map((selection) => selection.item.id),
  };
}

Deno.test("context controller - queued clicks show pending immediately, confirmed chips wait for ACK", async () => {
  const h = harness();
  const first = h.actions.activate(item("A"));
  const second = h.actions.activate(item("B"));
  assertEquals(h.controller.getSnapshot().pending, true);
  assertEquals(h.ids(), []);
  await flush();
  assertEquals(h.requests.map((request) => request.ids), [["A"]]);
  await h.ack(0);
  assertEquals(h.ids(), ["A"]);
  assertEquals(h.controller.getSnapshot().pending, true);
  assertEquals(h.requests[1].ids, ["A", "B"]);
  await h.ack(1);
  await Promise.all([first, second]);
  assertEquals(h.ids(), ["A", "B"]);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - local double opens before first ACK and undo survives surface cleanup", async () => {
  const h = harness();
  const snapshots: boolean[] = [];
  h.controller.subscribe((state) => snapshots.push(state.pending));
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  assertEquals(h.opened(), 1);
  assertEquals(h.ids(), []);
  h.arbiter.cancelAll(); // local detail replaced the clicked surface
  await flush();
  await h.ack(0);
  assertEquals(h.ids(), ["A"]);
  assertEquals(h.controller.getSnapshot().pending, true);
  assertEquals(snapshots.includes(false), false);
  assertEquals(h.requests[1].ids, []);
  await h.ack(1);
  assertEquals(h.ids(), []);
  assertEquals(h.controller.getSnapshot().pending, false);
  assertEquals(h.opened(), 1);
});

Deno.test("context controller - rejected undo leaves local detail open and confirmed chip with error", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  await flush();
  await h.ack(0);
  await h.ack(1, false);
  assertEquals(h.opened(), 1);
  assertEquals(h.ids(), ["A"]);
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
  h.arbiter.doubleClick(target);
  assertEquals(h.opened(), 1);
});

Deno.test("context controller - late undo A preserves B selected inside the detail", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  h.arbiter.cancelAll();
  const addB = h.actions.activate(item("B"));
  await flush();
  await h.ack(0);
  assertEquals(h.requests[1].ids, ["A", "B"]);
  await h.ack(1);
  await addB;
  assertEquals(h.requests[2].ids, ["B"]);
  await h.ack(2);
  assertEquals(h.ids(), ["B"]);
});

Deno.test("context controller - explicit clear queued before undo cannot resurrect prior items", async () => {
  const h = harness();
  const add = h.actions.activate(item("Z"));
  await flush();
  await h.ack(0);
  await add;
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  const clear = h.actions.clear();
  await flush();
  await h.ack(1);
  await h.ack(2);
  await clear;
  assertEquals(h.requests.map((request) => request.ids), [
    ["Z"],
    ["Z", "A"],
    [],
  ]);
  assertEquals(h.ids(), []);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - explicit removal is replayed even when initially a no-op", async () => {
  const h = harness();
  const add = h.actions.activate(item("Z"));
  await flush();
  await h.ack(0);
  await add;
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  const remove = h.actions.remove({ scopeKey: "root", item: item("A") });
  await flush();
  await h.ack(1);
  await h.ack(2);
  await remove;
  assertEquals(h.ids(), ["Z"]);
  assertEquals(h.requests.length, 3);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - refresh survives undo of a reselected point", async () => {
  const h = harness();
  const add = h.actions.activate(item("A", "old"));
  await flush();
  await h.ack(0);
  await add;
  const committed = h.actions.activateReversible(item("A", "clicked"));
  await flush();
  await h.ack(1);
  const revert = await committed;
  assertExists(revert);
  const refresh = h.actions.reconcile([item("A", "fresh")]);
  await flush();
  await h.ack(2);
  await refresh;
  assertEquals(await revert(), true);
  revert.release?.();
  assertEquals(h.requests.length, 3);
  assertEquals(h.controller.getSnapshot().selections[0].item.value, "fresh");
});

Deno.test("context controller - root clear rejection does not abandon the old requested undo", async () => {
  const h = harness();
  const addZ = h.actions.activate(item("Z"));
  await flush();
  await h.ack(0);
  await addZ;
  const target = h.intent();
  h.arbiter.click(target, 1);
  await flush(); // A is in flight when a new root arrives
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  h.arbiter.cancelAll();
  await h.ack(1);
  assertEquals(h.ids(), ["Z", "A"]);
  await h.ack(2, false);
  await clear;
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, true);
  assertEquals(h.requests[3].ids, ["Z"]);
  await h.ack(3);
  assertEquals(h.ids(), ["Z"]);
  assertEquals(h.controller.getSnapshot().failed, true); // old generation cannot hide newer error
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - new root selection survives old undo and rejected root clear", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  await flush();
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  const second = h.controller.actionsForScope("root-2").activate(item("B"));
  await h.ack(0);
  await h.ack(1, false);
  await clear;
  assertEquals(h.controller.getSnapshot().pending, true);
  await h.ack(2);
  await second;
  assertEquals(h.ids(), ["B"]);
  assertEquals(h.requests.length, 3);
  assertEquals(h.controller.getSnapshot().pending, false);
  assertEquals(h.controller.getSnapshot().failed, false);
});

Deno.test("context controller - acknowledged undo remains truth if a following root clear fails", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  await flush();
  await h.ack(0);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  await flush();
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  await h.ack(1);
  await h.ack(2, false);
  await clear;
  assertEquals(h.ids(), []);
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - unchanged reconciliation emits no pending or render loop", async () => {
  const h = harness();
  let renders = 0;
  h.controller.subscribe(() => renders++);
  assertEquals(await h.actions.reconcile([item("A")]), "unchanged");
  assertEquals(await h.actions.reconcile([item("A")]), "unchanged");
  assertEquals(renders, 0);
  assertEquals(h.requests.length, 0);
});

Deno.test("context controller - conversation waits for undo ACK and never bypasses rejected context", async () => {
  for (const reject of ["none", "add", "undo"] as const) {
    const h = harness();
    const target = h.intent("A", "after-context");
    h.arbiter.click(target, 1);
    h.arbiter.click(target, 2);
    h.arbiter.doubleClick(target);
    assertEquals(h.opened(), 0);
    await flush();
    await h.ack(0, reject !== "add");
    assertEquals(h.opened(), 0);
    if (reject !== "add") await h.ack(1, reject !== "undo");
    assertEquals(h.opened(), reject === "none" ? 1 : 0);
    assertEquals(h.controller.getSnapshot().pending, false);
  }
});

Deno.test("context controller - newer rejected B remains visible after older undo A succeeds", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  const second = h.actions.activate(item("B"));
  await flush();
  await h.ack(0);
  await h.ack(1, false);
  await second;
  assertEquals(h.controller.getSnapshot().failed, true);
  await h.ack(2);
  assertEquals(h.ids(), []);
  assertEquals(h.controller.getSnapshot().pending, false);
  assertEquals(h.controller.getSnapshot().failed, true);
});

Deno.test("context controller - rejected undo remains visible after newer B succeeded", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  const second = h.actions.activate(item("B"));
  await flush();
  await h.ack(0);
  await h.ack(1);
  await second;
  await h.ack(2, false);
  assertEquals(h.ids(), ["A", "B"]);
  assertEquals(h.controller.getSnapshot().pending, false);
  assertEquals(h.controller.getSnapshot().failed, true);
});

Deno.test("context controller - conversation A waits for newer B from another surface", async () => {
  const h = harness();
  const target = h.intent("A", "after-context");
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  await flush();
  await h.ack(0); // rollback in flight
  const addB = h.actions.activate(item("B")); // another arbiter/surface
  await h.ack(1);
  assertEquals(h.opened(), 0);
  assertEquals(h.controller.getSnapshot().pending, true);
  await h.ack(2);
  await addB;
  assertEquals(h.opened(), 1);
  assertEquals(h.ids(), ["B"]);
});

Deno.test("context controller - conversation A is suppressed when newer B is rejected", async () => {
  const h = harness();
  const target = h.intent("A", "after-context");
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  const addB = h.actions.activate(item("B"));
  await flush();
  await h.ack(0);
  await h.ack(1, false);
  await addB;
  await h.ack(2);
  assertEquals(h.opened(), 0);
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - conversation Enter waits for deliberate context without undo", async () => {
  for (const accepted of [true, false]) {
    const h = harness();
    const target = h.intent("A", "after-context");
    h.arbiter.click(target, 1);
    h.arbiter.keyDown(target, { key: "Enter", preventDefault() {} });
    await flush();
    assertEquals(h.opened(), 0);
    await h.ack(0, accepted);
    assertEquals(h.opened(), accepted ? 1 : 0);
    assertEquals(h.requests.length, 1);
    assertEquals(h.ids(), accepted ? ["A"] : []);
  }
});

Deno.test("context controller - obsolete root cancels waiting conversation", async () => {
  const h = harness();
  const target = h.intent("A", "after-context");
  h.arbiter.click(target, 1);
  await flush();
  h.arbiter.keyDown(target, { key: "Enter", preventDefault() {} });
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  await h.ack(0);
  await h.ack(1);
  await clear;
  assertEquals(h.opened(), 0);
  assertEquals(h.ids(), []);
});

Deno.test("context controller - queued toggles choose add or remove from acknowledged state", async () => {
  const h = harness();
  await h.seed("A", "B");
  const remove = h.actions.toggle(item("A"));
  const add = h.actions.toggle(item("A", "new"));
  await flush();
  assertEquals(h.requests[2].ids, ["B"]);
  assertEquals(h.ids(), ["A", "B"]);
  await h.ack(2);
  assertEquals(h.ids(), ["B"]);
  assertEquals(h.requests[3].ids, ["B", "A"]);
  await h.ack(3);
  assertEquals(await remove, "context");
  assertEquals(await add, "context");
  assertEquals(h.ids(), ["B", "A"]);
  assertEquals(h.controller.getSnapshot().selections[1].item.value, "new");
});

Deno.test("context controller - selected double opens immediately and restores removal after slow ACK", async () => {
  const h = harness();
  await h.seed("A", "Z");
  const pending: boolean[] = [];
  h.controller.subscribe((state) => pending.push(state.pending));
  const target = h.intent();
  h.arbiter.click(target, 1);
  h.arbiter.click(target, 2);
  h.arbiter.doubleClick(target);
  h.arbiter.cancelAll();
  assertEquals(h.opened(), 1);
  assertEquals(h.ids(), ["A", "Z"]);
  await flush();
  assertEquals(h.requests[2].ids, ["Z"]);
  await h.ack(2);
  assertEquals(h.ids(), ["Z"]);
  assertEquals(h.requests[3].ids, ["A", "Z"]);
  assertEquals(pending.includes(false), false);
  await h.ack(3);
  assertEquals(h.ids(), ["A", "Z"]);
  assertEquals(h.controller.getSnapshot().pending, false);
  assertEquals(h.controller.getSnapshot().failed, false);
});

Deno.test("context controller - rejected removal or restoration never sends a conversation", async () => {
  for (const rejected of ["removal", "restoration"] as const) {
    const h = harness();
    await h.seed("A");
    const target = h.intent("A", "after-context");
    h.arbiter.click(target, 1);
    h.arbiter.click(target, 2);
    h.arbiter.doubleClick(target);
    await flush();
    assertEquals(h.requests[1].ids, []);
    await h.ack(1, rejected !== "removal");
    if (rejected === "restoration") await h.ack(2, false);
    assertEquals(h.ids(), rejected === "removal" ? ["A"] : []);
    assertEquals(h.opened(), 0);
    assertEquals(h.controller.getSnapshot().failed, true);
    assertEquals(h.controller.getSnapshot().pending, false);
    assertEquals(h.requests.length, rejected === "removal" ? 2 : 3);
  }
});

Deno.test("context controller - rejected direct toggle keeps the confirmed selection", async () => {
  const h = harness();
  await h.seed("A", "B");
  const removal = h.actions.toggle(item("A"));
  await flush();
  await h.ack(2, false);
  assertEquals(await removal, "none");
  assertEquals(h.ids(), ["A", "B"]);
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - refresh while a selection is removed survives its compensation", async () => {
  for (const stillExists of [true, false]) {
    const h = harness();
    await h.seed("A");
    const committed = h.actions.toggleReversible(item("A"));
    await flush();
    await h.ack(1);
    const revert = await committed;
    assertExists(revert);
    assertEquals(h.ids(), []);
    assertEquals(
      await h.actions.reconcile(stillExists ? [item("A", "fresh")] : []),
      "unchanged",
    );
    const restored = revert();
    await flush();
    if (stillExists) await h.ack(2);
    assertEquals(await restored, true);
    revert.release?.();
    assertEquals(h.ids(), stillExists ? ["A"] : []);
    if (stillExists) {
      assertEquals(
        h.controller.getSnapshot().selections[0].item.value,
        "fresh",
      );
    }
    assertEquals(h.requests.length, stillExists ? 3 : 2);
  }
});

Deno.test("context controller - undo of removal preserves later selection and upsert intent", async () => {
  for (const laterId of ["A", "B"]) {
    const h = harness();
    await h.seed("A", "Z");
    const committed = h.actions.toggleReversible(item("A"));
    await flush();
    await h.ack(2);
    const revert = await committed;
    assertExists(revert);
    const later = h.actions.activate(item(laterId, "later"));
    await flush();
    await h.ack(3);
    await later;
    const restored = revert();
    await flush();
    if (laterId === "B") await h.ack(4);
    assertEquals(await restored, true);
    revert.release?.();
    assertEquals(h.ids(), laterId === "A" ? ["Z", "A"] : ["A", "Z", "B"]);
    assertEquals(
      h.controller.getSnapshot().selections.find((s) => s.item.id === laterId)
        ?.item.value,
      "later",
    );
  }
});

Deno.test("context controller - explicit or root clear prevents removed selection resurrection", async () => {
  for (const rootChange of [false, true]) {
    const h = harness();
    await h.seed("A", "Z");
    const committed = h.actions.toggleReversible(item("A"));
    await flush();
    await h.ack(2);
    const revert = await committed;
    assertExists(revert);
    if (rootChange) h.controller.setScope("root-2");
    const clear = rootChange
      ? h.controller.clearPreviousScope()
      : h.actions.clear();
    await flush();
    await h.ack(3);
    await clear;
    assertEquals(await revert(), true);
    revert.release?.();
    assertEquals(h.ids(), []);
    assertEquals(h.requests.length, 4);
  }
});

Deno.test("context controller - rejected root clear still allows old removal compensation", async () => {
  const h = harness();
  await h.seed("A", "Z");
  const committed = h.actions.toggleReversible(item("A"));
  await flush();
  await h.ack(2);
  const revert = await committed;
  assertExists(revert);
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  await flush();
  await h.ack(3, false);
  await clear;
  const restored = revert();
  await flush();
  await h.ack(4);
  assertEquals(await restored, true);
  revert.release?.();
  assertEquals(h.ids(), ["A", "Z"]);
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - Space toggles without undo and Enter leaves context unchanged", async () => {
  const h = harness();
  const target = h.intent();
  h.arbiter.keyDown(target, { key: " ", preventDefault() {} });
  await flush();
  await h.ack(0);
  h.arbiter.keyDown(target, { key: "Enter", preventDefault() {} });
  assertEquals(h.opened(), 1);
  assertEquals(h.ids(), ["A"]);
  assertEquals(h.requests.length, 1);
  h.arbiter.keyDown(target, { key: " ", preventDefault() {} });
  await flush();
  await h.ack(1);
  assertEquals(h.ids(), []);
  h.arbiter.doubleClick(target);
  await flush();
  assertEquals(h.requests.length, 2);
});
