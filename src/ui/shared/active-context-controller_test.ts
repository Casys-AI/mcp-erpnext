import { assertEquals, assertExists } from "@std/assert";
import { activeContextAttachmentNotice } from "./active-context-attachment.ts";
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
type HostCapabilities = Record<string, unknown> | undefined;
const CAPABLE_HOST: HostCapabilities = {
  updateModelContext: { structuredContent: {} },
  message: { text: {} },
};
/** Passing `undefined` explicitly models a host announcing no capabilities. */
function harness(...args: [capabilities?: HostCapabilities]) {
  const capabilities = args.length === 0 ? CAPABLE_HOST : args[0];
  const requests: {
    ids: string[];
    items: ContextSelectionItem[];
    response: ReturnType<typeof deferred<unknown>>;
  }[] = [];
  const host: ActiveContextFlowHost = {
    getHostCapabilities: () =>
      capabilities as ReturnType<ActiveContextFlowHost["getHostCapabilities"]>,
    updateModelContext(params) {
      const response = deferred<unknown>();
      const items =
        (params.structuredContent?.items ?? []) as ContextSelectionItem[];
      requests.push({ ids: items.map((entry) => entry.id), items, response });
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

Deno.test("context controller - host without updateModelContext: scope change never flags failed nor pending", async () => {
  for (
    const capabilities of [
      undefined,
      {},
      { updateModelContext: {} },
    ] as HostCapabilities[]
  ) {
    const h = harness(capabilities);
    const states: { pending: boolean; failed: boolean }[] = [];
    h.controller.subscribe(({ pending, failed }) =>
      states.push({ pending, failed })
    );
    h.controller.setScope("root-2");
    const clear = h.controller.clearPreviousScope();
    await flush();
    assertEquals(await clear, "unsupported");
    assertEquals(h.requests.length, 0);
    assertEquals(h.controller.getSnapshot().failed, false);
    assertEquals(h.controller.getSnapshot().pending, false);
    assertEquals(states, []);
  }
});

Deno.test("context controller - explicit clear on an unsupported host is neutral", async () => {
  const h = harness({});
  assertEquals(await h.actions.clear(), "unsupported");
  assertEquals(h.requests.length, 0);
  assertEquals(h.controller.getSnapshot().failed, false);
  assertEquals(h.controller.getSnapshot().pending, false);
});

Deno.test("context controller - capable host rejecting the root clear still reports failed", async () => {
  const h = harness();
  h.controller.setScope("root-2");
  const clear = h.controller.clearPreviousScope();
  assertEquals(h.controller.getSnapshot().pending, true);
  await flush();
  assertEquals(h.requests.length, 1);
  assertEquals(h.requests[0].ids, []);
  await h.ack(0, false);
  assertEquals(await clear, "error");
  assertEquals(h.controller.getSnapshot().failed, true);
  assertEquals(h.controller.getSnapshot().pending, false);
});

const listGroup = {
  reconcileKey: "invoice-list",
  doctype: "Sales Invoice",
  view: "Invoices",
  fields: ["name", "status"],
  queryAvailable: true,
};
function rowMembers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `INV-${index + 1}`,
    label: `Invoice ${index + 1}`,
    fields: [{ label: "Status", value: "Draft" }],
    fieldsSource: "row" as const,
    modified: "2026-10-18 10:00:00",
  }));
}
async function acknowledge<T>(
  h: ReturnType<typeof harness>,
  action: Promise<T>,
) {
  const index = h.requests.length;
  await flush();
  await h.ack(index);
  return await action;
}

Deno.test("context groups - atomic select-all, 8 to 9 and undo restores eight rows", async () => {
  const h = harness();
  const rows = rowMembers(8);
  const names = rows.map((row) => row.name);
  const ids = names.map((name) => `record:Sales Invoice:${name}`);
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rows));
  assertEquals(h.requests.length, 1);
  assertEquals(h.ids(), ids);
  assertEquals(h.requests[0].ids, ids);
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rowMembers(9)[8]),
  );
  assertEquals(h.ids().length, 1);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    9,
  );
  assertExists(undo);
  await acknowledge(h, Promise.resolve(undo()));
  assertEquals(h.ids(), ids);
  assertEquals(h.requests[2].ids, ids);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    names,
  );
  undo.release?.();
});

Deno.test("context groups - unchecking a row already selected by click removes its identity", async () => {
  const h = harness();
  const row = rowMembers(1)[0];
  const id = `record:Sales Invoice:${row.name}`;
  await acknowledge(
    h,
    h.actions.activate({
      id,
      label: row.label,
      view: listGroup.view,
      reconcileKey: listGroup.reconcileKey,
      fields: row.fields,
      fieldsSource: row.fieldsSource,
      modified: row.modified,
    }),
  );
  assertEquals(
    h.actions.isSelected({ id, label: row.label, view: listGroup.view }),
    true,
  );
  await acknowledge(h, h.actions.toggleGroupMember(listGroup, row));
  assertEquals(h.ids(), []);
  assertEquals(h.requests[1].ids, []);
  assertEquals(h.controller.getSnapshot().selection.singles, []);
  assertEquals(h.controller.getSnapshot().selection.groups, []);
  assertEquals(
    h.actions.isGroupMemberSelected(listGroup.reconcileKey, row.name),
    false,
  );
});

Deno.test("context groups - three quick checkbox toggles while ACK is pending keep three members", async () => {
  const h = harness();
  const rows = rowMembers(3);
  const operations = rows.map((row) =>
    h.actions.toggleGroupMember(listGroup, row)
  );
  await flush();
  assertEquals(h.requests.length, 1);
  assertEquals(h.controller.getSnapshot().selection.groups, []);
  for (let index = 0; index < rows.length; index++) await h.ack(index);
  await Promise.all(operations);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    rows.map((row) => row.name),
  );
  assertEquals(h.requests.map((request) => request.ids.length), [1, 2, 3]);
});

Deno.test("context groups - relative select-all and range additions queued during ACK retain current members", async () => {
  const h = harness();
  const rows = rowMembers(3);
  const first = h.actions.toggleGroupMember(listGroup, rows[0]);
  await flush();
  const range = h.actions.addGroupMembers(listGroup, rows.slice(1));
  await h.ack(0);
  assertEquals(
    h.requests[1].ids,
    rows.map((row) => `record:Sales Invoice:${row.name}`),
  );
  await h.ack(1);
  await Promise.all([first, range]);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    rows.map((row) => row.name),
  );
  assertEquals(h.requests.length, 2);
});

Deno.test("context groups - select-all then toggle before ACK removes the toggled member", async () => {
  const h = harness();
  const rows = rowMembers(3);
  const selectAll = h.actions.addGroupMembers(listGroup, rows);
  const toggle = h.actions.toggleGroupMember(listGroup, rows[1]);
  await flush();
  assertEquals(h.requests.length, 1);
  await h.ack(0);
  assertEquals(h.requests[1].ids, [
    "record:Sales Invoice:INV-1",
    "record:Sales Invoice:INV-3",
  ]);
  await h.ack(1);
  await Promise.all([selectAll, toggle]);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    ["INV-1", "INV-3"],
  );
});

Deno.test("context groups - relative removal queued during ACK removes matching singles and preserves other rows", async () => {
  const h = harness();
  const rows = rowMembers(3);
  await acknowledge(
    h,
    h.actions.activate({
      id: "record:Sales Invoice:INV-3",
      label: rows[2].label,
      view: listGroup.view,
    }),
  );
  const addition = h.actions.addGroupMembers(listGroup, rows.slice(0, 2));
  const removal = h.actions.removeGroupMembers(listGroup, ["INV-1", "INV-3"]);
  await flush();
  await h.ack(1);
  assertEquals(h.requests[2].ids, ["record:Sales Invoice:INV-2"]);
  await h.ack(2);
  await Promise.all([addition, removal]);
  assertEquals(h.controller.getSnapshot().selection.singles, []);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    ["INV-2"],
  );
});

Deno.test("context groups - relative removal from 9 plus 7 never evicts", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(9)));
  await h.seed("A", "B", "C", "D", "E", "F", "G");
  await acknowledge(h, h.actions.removeGroupMembers(listGroup, ["INV-9"]));
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    8,
  );
  assertEquals(
    h.controller.getSnapshot().selection.singles.map((single) =>
      single.item.id
    ),
    ["A", "B", "C", "D", "E", "F", "G"],
  );
  assertEquals(h.controller.getSnapshot().evictedLabel, null);
});

Deno.test("context groups - relative bulk mutations replay atomically across an earlier undo", async () => {
  const h = harness();
  const rows = rowMembers(5);
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rows.slice(0, 3)));
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rows[0]),
  );
  await acknowledge(h, h.actions.addGroupMembers(listGroup, rows.slice(3)));
  await acknowledge(
    h,
    h.actions.removeGroupMembers(listGroup, ["INV-2", "INV-5"]),
  );
  assertEquals(h.requests.length, 4);
  assertExists(undo);
  await acknowledge(h, Promise.resolve(undo()));
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.name
    ),
    ["INV-1", "INV-3", "INV-4"],
  );
  assertEquals(h.requests.length, 5);
  undo.release?.();
});

Deno.test("context groups - relative addition may evict the oldest context entry", async () => {
  const h = harness();
  await h.seed("A", "B", "C", "D", "E", "F", "G", "H");
  await acknowledge(h, h.actions.addGroupMembers(listGroup, rowMembers(1)));
  assertEquals(h.ids(), [
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "record:Sales Invoice:INV-1",
  ]);
  assertEquals(h.controller.getSnapshot().evictedLabel, "A");
});

Deno.test("context groups - current chip can remove its old scope after root clear fails while old handlers remain fenced", async () => {
  const h = harness();
  await acknowledge(h, h.actions.addGroupMembers(listGroup, rowMembers(2)));
  h.controller.setScope("root-2");
  const clearing = h.controller.clearPreviousScope();
  await flush();
  await h.ack(1, false);
  await clearing;
  assertEquals(h.controller.getSnapshot().selection.groups[0].scopeKey, "root");
  assertEquals(
    await h.actions.removeGroup(listGroup.reconcileKey, "root"),
    "unchanged",
  );
  assertEquals(h.requests.length, 2);

  const currentActions = h.controller.actionsForScope("root-2");
  await acknowledge(
    h,
    currentActions.removeGroup(listGroup.reconcileKey, "root"),
  );
  assertEquals(h.requests[2].ids, []);
  assertEquals(h.controller.getSnapshot().selection.groups, []);
});

Deno.test("context groups - removing query survives a late undo of the ninth row", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(8)));
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rowMembers(9)[8]),
  );
  await acknowledge(
    h,
    h.actions.remove(h.controller.getSnapshot().selections[0]),
  );
  assertExists(undo);
  assertEquals(await undo(), true);
  assertEquals(h.ids(), []);
  assertEquals(h.controller.getSnapshot().selection.groups, []);
  assertEquals(h.requests.length, 3);
});

Deno.test("context groups - refresh during removed member undo retains freshest fields", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(2)));
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rowMembers(2)[0]),
  );
  const refreshed = rowMembers(2).map((row) => ({
    ...row,
    modified: "2026-10-18 11:00:00",
    fields: [{ label: "Status", value: "Paid" }],
  }));
  await acknowledge(
    h,
    h.actions.reconcileGroup(listGroup.reconcileKey, refreshed, {
      complete: true,
    }),
  );
  assertExists(undo);
  await acknowledge(h, Promise.resolve(undo()));
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.map((row) =>
      row.fields
    ),
    refreshed.map((row) => row.fields),
  );
});

Deno.test("context groups - refresh queued while undo awaits ACK retains fresh fields and order", async () => {
  const h = harness();
  const rows = rowMembers(2);
  const ids = rows.map((row) => `record:Sales Invoice:${row.name}`);
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rows));
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rows[0]),
  );
  assertExists(undo);
  const undone = undo();
  await flush();
  assertEquals(h.requests[2].ids, ids);
  assertEquals(h.ids(), [ids[1]]);
  assertEquals(h.controller.getSnapshot().pending, true);

  const refreshed = rows.map((row) => ({
    ...row,
    modified: "2026-10-18 11:00:00",
    fields: [{ label: "Status", value: "Paid" }],
  }));
  const refresh = h.actions.reconcileGroup(listGroup.reconcileKey, refreshed, {
    complete: true,
  });
  await flush();
  assertEquals(h.requests.length, 3);
  assertEquals(h.ids(), [ids[1]]);
  assertEquals(h.controller.getSnapshot().failed, false);

  await h.ack(2);
  assertEquals(await undone, true);
  assertEquals(h.requests[3].ids, ids);
  assertEquals(
    h.requests[3].items.map((entry) => entry.fields),
    refreshed.map((row) => row.fields),
  );
  assertEquals(h.controller.getSnapshot().pending, true);
  await h.ack(3);
  assertEquals(await refresh, "shared");
  undo.release?.();

  const state = h.controller.getSnapshot();
  assertEquals(h.ids(), ids);
  assertEquals(
    state.selection.groups[0].members.map((row) => row.name),
    rows.map((row) => row.name),
  );
  assertEquals(
    state.selection.groups[0].members.map((row) => row.modified),
    refreshed.map((row) => row.modified),
  );
  assertEquals(
    state.selection.groups[0].members.map((row) => row.fields),
    refreshed.map((row) => row.fields),
  );
  assertEquals(
    state.selections.map((selection) => selection.item.fields),
    refreshed.map((row) => row.fields),
  );
  assertEquals(h.requests.length, 4);
  assertEquals(h.requests.at(-1)?.ids, ids);
  assertEquals(state.pending, false);
  assertEquals(state.failed, false);
});

Deno.test("context groups - refused ACK retains members and refused undo retains collapse", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(8)));
  const refused = h.actions.toggleGroupMember(listGroup, rowMembers(9)[8]);
  await flush();
  h.requests[1].response.resolve({ isError: true });
  await refused;
  assertEquals(h.ids().length, 8);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    8,
  );
  const undo = await acknowledge(
    h,
    h.actions.toggleGroupMemberReversible(listGroup, rowMembers(9)[8]),
  );
  assertExists(undo);
  const undone = undo();
  await flush();
  await h.ack(3, false);
  assertEquals(await undone, false);
  assertEquals(h.ids().length, 1);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    9,
  );
});

Deno.test("context groups - removal from 9 plus 7 never evicts and query removal clears members", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(9)));
  await h.seed("A", "B", "C", "D", "E", "F", "G");
  await acknowledge(
    h,
    h.actions.toggleGroupMember(listGroup, rowMembers(9)[8]),
  );
  assertEquals(h.ids().length, 8);
  assertEquals(h.ids().slice(1), ["A", "B", "C", "D", "E", "F", "G"]);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    8,
  );
  await acknowledge(h, h.actions.removeGroup(listGroup.reconcileKey));
  assertEquals(h.ids(), ["A", "B", "C", "D", "E", "F", "G"]);
});

Deno.test("context groups - incomplete refresh preserves absent members and root fences old actions", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(3)));
  assertEquals(
    await h.actions.reconcileGroup(listGroup.reconcileKey, rowMembers(1)),
    "unchanged",
  );
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    3,
  );
  await acknowledge(
    h,
    h.actions.reconcileGroup(listGroup.reconcileKey, rowMembers(1), {
      complete: true,
    }),
  );
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    1,
  );
  h.controller.setScope("other");
  await acknowledge(h, h.controller.clearPreviousScope()!);
  assertEquals(h.controller.getSnapshot().selection.groups, []);
  assertEquals(
    await h.actions.toggleGroupMember(listGroup, rowMembers(1)[0]),
    "superseded",
  );
});

Deno.test("context groups - no query tool keeps members outside the projection", async () => {
  const h = harness();
  await acknowledge(
    h,
    h.actions.setGroupMembers(
      { ...listGroup, queryAvailable: false },
      rowMembers(12),
    ),
  );
  assertEquals(h.ids().length, 8);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members.length,
    12,
  );
  assertEquals(
    h.actions.isGroupMemberSelected(listGroup.reconcileKey, "INV-1"),
    true,
  );
});

Deno.test("context groups - document refresh enriches fields without downgrade by equal row refresh", async () => {
  const h = harness();
  await acknowledge(h, h.actions.setGroupMembers(listGroup, rowMembers(1)));
  const record = {
    id: "record:Sales Invoice:INV-1",
    view: "Invoices",
    label: "INV-1",
    fields: [{ label: "Customer", value: "Alice" }],
    fieldsSource: "record" as const,
    modified: "2026-10-18 10:00:00",
  };
  await acknowledge(h, h.actions.reconcileDocument(record.id, [record]));
  const rowRefresh = h.actions.reconcileGroup(
    listGroup.reconcileKey,
    rowMembers(1),
  );
  await acknowledge(h, rowRefresh);
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members[0].fields,
    record.fields,
  );
  const newer = { ...rowMembers(1)[0], modified: "2026-10-18 12:00:00" };
  await acknowledge(
    h,
    h.actions.reconcileGroup(listGroup.reconcileKey, [newer]),
  );
  assertEquals(
    h.controller.getSnapshot().selection.groups[0].members[0].fields,
    newer.fields,
  );
});

Deno.test("context resources - chart and record announce no attachment until chart is the sole entry", async () => {
  const sent: unknown[][] = [];
  const controller = createActiveContextController({
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {}, resource: {} },
    }),
    updateModelContext: (params) => {
      sent.push(params.content ?? []);
      return Promise.resolve({});
    },
    sendMessage: () => Promise.resolve({}),
  }, "root");
  const actions = controller.actionsForScope("root");
  const chart = {
    ...item("chart"),
    resource: {
      uri: "ui://chart/data",
      mimeType: "application/json",
      bytes: new Uint8Array([123, 125]),
      kind: "derived" as const,
    },
  };
  const record = {
    id: "record:Sales Invoice:INV-1",
    view: "Invoice",
    label: "INV-1",
  };
  const expectedResource = [{
    type: "resource",
    resource: {
      uri: chart.resource.uri,
      mimeType: chart.resource.mimeType,
      blob: "e30=",
    },
  }];
  await actions.activate(chart);
  assertEquals(sent.at(-1), expectedResource);
  await actions.activate(record);
  assertEquals(sent.at(-1), []);
  const selections = controller.getSnapshot().selections;
  assertEquals(
    selections.map((selection) => "resource" in selection.item),
    [false, false],
  );
  assertEquals(
    selections.map((selection) =>
      activeContextAttachmentNotice(selection.item)
    ),
    [null, null],
  );
  assertEquals(
    controller.getSnapshot().selection.singles[0].item.resource,
    chart.resource,
  );

  await actions.remove({ scopeKey: "root", item: record });
  assertEquals(sent.at(-1), expectedResource);
  assertEquals(
    controller.getSnapshot().selections[0].item.resource,
    chart.resource,
  );
  assertExists(
    activeContextAttachmentNotice(controller.getSnapshot().selections[0].item),
  );
});

Deno.test("context resources - refresh preserves hidden derived resource until it becomes the sole entry", async () => {
  const sent: unknown[][] = [];
  const controller = createActiveContextController({
    getHostCapabilities: () => ({
      updateModelContext: { structuredContent: {}, resource: {} },
    }),
    updateModelContext: (params) => {
      sent.push(params.content ?? []);
      return Promise.resolve({});
    },
    sendMessage: () => Promise.resolve({}),
  }, "root");
  const actions = controller.actionsForScope("root");
  const attachment = {
    ...item("file"),
    reconcileKey: "attachment",
    resource: {
      uri: "file:///invoice.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1]),
    },
  };
  const chart = {
    ...item("chart"),
    reconcileKey: "chart",
    resource: {
      uri: "ui://chart/data",
      mimeType: "application/json",
      bytes: new Uint8Array([123, 125]),
      kind: "derived" as const,
    },
  };
  await actions.activate(attachment);
  await actions.activate(chart);
  await actions.reconcileView("chart", [chart]);
  assertExists(
    controller.getSnapshot().selection.singles.find((single) =>
      single.item.id === "chart"
    )?.item.resource,
  );
  await actions.remove({ scopeKey: "root", item: attachment });
  assertEquals(sent.at(-1), [{
    type: "resource",
    resource: {
      uri: chart.resource.uri,
      mimeType: chart.resource.mimeType,
      blob: "e30=",
    },
  }]);
});
