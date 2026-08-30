import { assertEquals } from "@std/assert";
import { createClickIntentArbiter } from "../click-intent.ts";
import { contextInteractionProps } from "./context-interaction.ts";

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

Deno.test("document context interaction - direct click and keyboard reuse one activation", () => {
  let activations = 0;
  let prevented = 0;
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    selected: true,
    onActivate: () => {
      activations += 1;
    },
  });

  assertEquals(props.role, "button");
  assertEquals(props.tabIndex, 0);
  assertEquals(props["aria-pressed"], true);
  props.onClick();
  props.onKeyDown({
    key: "Enter",
    preventDefault: () => prevented += 1,
  });
  props.onKeyDown({
    key: " ",
    preventDefault: () => prevented += 1,
  });
  props.onKeyDown({
    key: "Escape",
    preventDefault: () => prevented += 1,
  });

  assertEquals(activations, 3);
  assertEquals(prevented, 2);
});

Deno.test("document context interaction - unsupported data stays inert", () => {
  assertEquals(contextInteractionProps(undefined), {});
});

Deno.test("document context interaction - separates context selection from action disclosure", () => {
  const props = contextInteractionProps({
    label: "Close actions for ITEM-1",
    selected: true,
    expanded: false,
    controls: "invoice-items-row-1-actions",
    onActivate: () => {},
  });
  assertEquals(props["aria-pressed"], true);
  assertEquals(props["aria-expanded"], false);
  assertEquals(props["aria-controls"], "invoice-items-row-1-actions");
});

Deno.test("document context interaction - single and double pointer gestures stay exclusive", () => {
  let flushPending = () => {};
  const arbiter = createClickIntentArbiter((run) => {
    let cancelled = false;
    flushPending = () => {
      if (!cancelled) run();
    };
    return () => {
      cancelled = true;
    };
  });
  const activations: string[] = [];
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    selected: false,
    expanded: false,
    onActivate: () => {
      activations.push("context");
    },
    onDoubleActivate: () => activations.push("detail"),
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onClick({ detail: 1 });
  props.onClick({ detail: 2 });
  props.onDblClick?.();
  flushPending();

  assertEquals(activations, ["detail"]);
  assertEquals(props["aria-keyshortcuts"], "Enter");
});

Deno.test("document context interaction - a late native double restores context", async () => {
  let flushPending = () => {};
  const arbiter = createClickIntentArbiter((run) => {
    flushPending = run;
    return () => {};
  });
  const activations: string[] = [];
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    onActivate: () => {
      activations.push("context");
      return () => {
        activations.push("restore");
      };
    },
    onDoubleActivate: () => activations.push("detail"),
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onClick({ detail: 1 });
  flushPending();
  props.onClick({ detail: 2 });
  props.onDblClick?.();
  await nextTurn();

  assertEquals(activations, ["context", "restore", "detail"]);
});

Deno.test("document context interaction - Space is context and Enter is detail", () => {
  const activations: string[] = [];
  const prevented: string[] = [];
  const arbiter = createClickIntentArbiter();
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    onActivate: () => {
      activations.push("context");
    },
    onDoubleActivate: () => activations.push("detail"),
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onKeyDown({
    key: " ",
    preventDefault: () => prevented.push("Space"),
  });
  props.onKeyDown({
    key: "Enter",
    preventDefault: () => prevented.push("Enter"),
  });

  assertEquals(activations, ["context", "detail"]);
  assertEquals(prevented, ["Space", "Enter"]);
});

Deno.test("document context interaction - a context-only target stays immediate", () => {
  let activations = 0;
  const arbiter = createClickIntentArbiter(() => {
    throw new Error("context-only interaction must not schedule a timer");
  });
  const props = contextInteractionProps({
    label: "Add ITEM-1 to active context",
    onActivate: () => {
      activations += 1;
    },
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onClick({ detail: 1 });
  props.onKeyDown({ key: "Enter", preventDefault: () => {} });

  assertEquals(activations, 2);
  assertEquals(props.onDblClick, undefined);
  assertEquals(props["aria-keyshortcuts"], undefined);
});
