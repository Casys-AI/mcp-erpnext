import { assertEquals } from "@std/assert";
import {
  INVOICE_FOLLOW_PORTS,
  invoiceDocumentRef,
} from "../shared/document-follow.ts";
import { createInvoicePanelInteractions } from "./invoice-panels.ts";

const { source, target } = INVOICE_FOLLOW_PORTS;
const first = invoiceDocumentRef("Sales Invoice", "INV-001")!;
const second = invoiceDocumentRef("Sales Invoice", "INV-002")!;

function route() {
  const lifetime = new AbortController();
  const board = {
    children: [
      { slot: 0, componentId: "list" },
      { slot: 1, componentId: "detail" },
    ],
    sync: [{ from: 0, to: 1, event: source.event, action: target.action }],
  };
  const interactions = createInvoicePanelInteractions(
    board,
    lifetime.signal,
    (_id, _event, data, deliver) => deliver("detail", target.action, data),
  );
  return {
    lifetime,
    interactions,
    list: interactions.forPanel(0, "list")!.invoiceSelection!,
    detail: interactions.forPanel(1, "detail")!.setInvoiceFocus!,
  };
}

Deno.test("invoice follow waits for mounted receiver and delivers the latest selection once", () => {
  const { interactions, list, detail } = route();
  const actions: string[] = [];
  assertEquals(list.canFollow(), true);
  list.select(first, () => actions.push("fallback 1"));
  list.select(second, () => actions.push("fallback 2"));
  detail(({ name }) => {
    actions.push(name);
    return true;
  });
  assertEquals(actions, []);
  interactions.setMounted("detail", true);
  assertEquals(actions, [second.name]);
});

Deno.test("invoice follow restores native detail when the mount or viewer is unavailable", () => {
  for (const mountFailed of [true, false]) {
    const { interactions, list, detail } = route();
    const actions: string[] = [];
    list.subscribe(() => actions.push(String(list.canFollow())));
    list.select(first, () => actions.push("native detail"));
    interactions.setMounted("detail", !mountFailed);
    if (!mountFailed) detail(null);
    assertEquals(list.canFollow(), false);
    assertEquals(actions, ["false", "native detail"]);
  }
});

Deno.test("invoice follow handles a receiver that loses capability before activation", () => {
  const { interactions, list, detail } = route();
  interactions.setMounted("detail", true);
  detail(() => false);
  const actions: string[] = [];
  list.select(first, () => actions.push("native detail"));
  assertEquals(list.canFollow(), false);
  assertEquals(actions, ["native detail"]);
});

Deno.test("retired invoice board drops pending actions", () => {
  const { lifetime, interactions, list, detail } = route();
  const actions: string[] = [];
  list.select(first, () => actions.push("native detail"));
  lifetime.abort();
  interactions.setMounted("detail", true);
  detail(({ name }) => {
    actions.push(name);
    return true;
  });
  assertEquals(list.canFollow(), false);
  assertEquals(actions, []);
});

Deno.test("an available invoice panel can stop following and recover without a remount", () => {
  const { interactions, list, detail } = route();
  interactions.setMounted("detail", true);
  const actions: string[] = [];
  const receive = ({ name }: typeof first) => {
    actions.push(name);
    return true;
  };
  detail(receive);
  list.select(first, () => actions.push("unexpected fallback"));
  detail(null);
  assertEquals(list.canFollow(), false);
  detail(receive);
  assertEquals(list.canFollow(), true);
  list.select(second, () => actions.push("unexpected fallback"));
  assertEquals(actions, [first.name, second.name]);
});

Deno.test("changing the list scope retires a pending focus and its native fallback", () => {
  for (const mounted of [true, false]) {
    const { interactions, list, detail } = route();
    const actions: string[] = [];
    list.select(first, () => actions.push("stale detail"));
    list.cancelPending();
    detail(({ name }) => {
      actions.push(name);
      return true;
    });
    interactions.setMounted("detail", mounted);
    assertEquals(actions, []);
    list.select(second, () => actions.push("current detail"));
    assertEquals(actions, [mounted ? second.name : "current detail"]);
  }
});

Deno.test("invoice follow reports the document actually shown, independently of a click or failed read", () => {
  const { interactions, list, detail, lifetime } = route();
  const changes: boolean[] = [];
  list.subscribe(() => changes.push(list.isOpen(first)));
  const receive = () => true;
  detail(receive, first);
  assertEquals(list.isOpen(first), false); // mounting
  interactions.setMounted("detail", true);
  assertEquals(list.isOpen(first), true);
  list.select(second, () => {
    throw new Error("Unexpected fallback");
  });
  assertEquals(list.isOpen(first), true);
  assertEquals(list.isOpen(second), false); // read pending or rejected
  detail(receive, second);
  assertEquals(list.isOpen(second), true);
  detail(receive, second);
  assertEquals(changes, [true, false]);
  detail(null);
  assertEquals(list.isOpen(second), false);
  detail(receive, first);
  assertEquals(list.isOpen(first), true);
  lifetime.abort();
  assertEquals(list.isOpen(first), false);
});
