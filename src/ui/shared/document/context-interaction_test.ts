import { assertEquals } from "@std/assert";
import { createClickIntentArbiter as createArbiter } from "../click-intent.ts";
import { contextInteractionProps } from "./context-interaction.ts";

function createClickIntentArbiter() {
  return createArbiter(() => () => {});
}

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

Deno.test("document context interaction - double pointer gesture compensates context", async () => {
  const arbiter = createClickIntentArbiter();
  const activations: string[] = [];
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    selected: false,
    expanded: false,
    onActivate: () => {
      activations.push("context");
      return () => {
        activations.push("restore");
      };
    },
    onDoubleActivate: () => activations.push("detail"),
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onClick({ detail: 1 });
  assertEquals(activations, ["context"]);
  props.onClick({ detail: 2 });
  props.onDblClick?.();
  await nextTurn();

  assertEquals(activations, ["context", "restore", "detail"]);
  assertEquals(props["aria-keyshortcuts"], "Enter");
});

Deno.test("document context interaction - simple pointer activation has no delay", () => {
  const arbiter = createClickIntentArbiter();
  const activations: string[] = [];
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    onActivate: () => {
      activations.push("context");
    },
    onDoubleActivate: () => activations.push("detail"),
  }, { arbiter, key: "invoice:ITEM-1" });

  props.onClick({ detail: 1 });

  assertEquals(activations, ["context"]);
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
  const arbiter = createClickIntentArbiter();
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

Deno.test("document context interaction - a context-only fast second click toggles off", () => {
  let selected = true;
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    selected,
    onActivate: () => {
      selected = !selected;
    },
  });

  props.onClick({ detail: 1 });
  assertEquals(selected, false);
  props.onClick({ detail: 2 });
  assertEquals(selected, true);

  // The next independent click toggles the same datum again.
  props.onClick({ detail: 1 });
  assertEquals(selected, false);
});

Deno.test("document context interaction - holding Space does not toggle repeatedly", () => {
  let selected = false;
  let prevented = 0;
  const props = contextInteractionProps({
    label: "Select ITEM-1 as active context",
    selected,
    onActivate: () => {
      selected = !selected;
    },
  });

  props.onKeyDown({
    key: " ",
    preventDefault: () => prevented++,
  });
  props.onKeyDown({
    key: " ",
    repeat: true,
    preventDefault: () => prevented++,
  });

  assertEquals(selected, true);
  assertEquals(prevented, 1);
  props.onKeyDown({ key: " ", preventDefault: () => prevented++ });
  assertEquals(selected, false);
});
