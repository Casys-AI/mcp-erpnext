import { assertEquals } from "@std/assert";
import { createClickIntentArbiter } from "../click-intent.ts";
import { contextInteractionProps } from "../document/context-interaction.ts";
import { doclistRowEvents, extendDoclistRange } from "./selection.ts";

function setup(platform = "Win32", enabled = true) {
  const effects: string[] = [];
  const arbiter = createClickIntentArbiter(() => () => {});
  const base = contextInteractionProps({
    label: "Invoice A",
    onActivate: () => {
      effects.push("single");
    },
    onDoubleActivate: () => {
      effects.push("detail");
    },
    doublePolicy: "local",
  }, { arbiter, key: "A" });
  const props = doclistRowEvents(base, {
    onToggle: enabled
      ? (shiftKey) => effects.push(shiftKey ? "range" : "toggle")
      : undefined,
    arbiter,
    platform,
  });
  return { effects, props, base, arbiter };
}

function event(overrides: Record<string, unknown> = {}) {
  const actions: string[] = [];
  return {
    button: 0,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    detail: 1,
    preventDefault: () => actions.push("prevent"),
    stopPropagation: () => actions.push("stop"),
    actions,
    ...overrides,
  };
}

Deno.test("doclist row - Shift et Ctrl/Meta utilisent la même action que la case", () => {
  for (const modifier of ["shiftKey", "ctrlKey", "metaKey"]) {
    const { props, effects } = setup();
    const click = event({ [modifier]: true });
    props.onClick(click);
    props.onClick(event({ [modifier]: true, detail: 2 }));
    props.onDblClick(event({ [modifier]: true, detail: 2 }));
    assertEquals(
      effects,
      modifier === "shiftKey" ? ["range", "range"] : ["toggle", "toggle"],
    );
    assertEquals(click.actions, ["prevent", "stop"]);
  }
});

Deno.test("doclist row - Shift prime sur Ctrl/Meta pour étendre la plage", () => {
  const { props, effects } = setup();
  props.onClick(event({ shiftKey: true, metaKey: true, ctrlKey: true }));
  assertEquals(effects, ["range"]);
});

Deno.test("doclist row - empêche le texte uniquement sur Shift mousedown principal", () => {
  const { props, effects } = setup();
  const shift = event({ shiftKey: true });
  props.onMouseDown(shift);
  assertEquals(shift.actions, ["prevent"]);
  for (
    const overrides of [{}, { ctrlKey: true }, { shiftKey: true, button: 2 }]
  ) {
    const down = event(overrides);
    props.onMouseDown(down);
    assertEquals(down.actions, []);
  }
  assertEquals(effects, []);
});

Deno.test("doclist row - conserve les contrôles imbriqués y compris leur sélection de texte", () => {
  const { props, effects } = setup("MacIntel");
  const control = {};
  for (
    const handler of [
      props.onMouseDown,
      props.onClick,
      props.onDblClick,
      props.onContextMenu,
    ]
  ) {
    const nested = event({
      shiftKey: true,
      ctrlKey: true,
      target: { closest: () => control },
      currentTarget: {},
    });
    handler(nested);
    assertEquals(nested.actions, []);
  }
  assertEquals(effects, []);
});

Deno.test("doclist row - le rôle button de la ligne ne la confond pas avec un contrôle enfant", () => {
  const { props, effects } = setup();
  const row = {};
  props.onClick(
    event({
      shiftKey: true,
      target: { closest: () => row },
      currentTarget: row,
    }),
  );
  assertEquals(effects, ["range"]);
});

Deno.test("doclist row - Ctrl contextmenu Mac bascule, le menu normal reste natif", () => {
  for (const platform of ["MacIntel", "Win32", "Linux x86_64"]) {
    const { props, effects } = setup(platform);
    const menu = event({ ctrlKey: true });
    props.onContextMenu(menu);
    assertEquals(effects, platform === "MacIntel" ? ["toggle"] : []);
    assertEquals(
      menu.actions,
      platform === "MacIntel" ? ["prevent", "stop"] : [],
    );
    for (const overrides of [{ button: 2 }, { ctrlKey: true, button: 2 }, {}]) {
      const native = event(overrides);
      props.onContextMenu(native);
      assertEquals(native.actions, []);
    }
  }
});

Deno.test("doclist row - Ctrl clic Mac bascule une seule fois dans Chrome et WebKit", () => {
  for (const browser of ["Chrome", "WebKit"]) {
    for (const button of [0, 2, undefined]) {
      const { props, effects } = setup("MacIntel");
      props.onContextMenu(event({ ctrlKey: true }));
      if (browser === "WebKit") {
        props.onClick(event({ ctrlKey: true, button }));
      }
      assertEquals(effects, ["toggle"], `${browser}, button=${button}`);
    }
  }
});

Deno.test("doclist row - ignore le click Ctrl Mac même sans sélection de groupe", () => {
  const { props, effects } = setup("MacIntel", false);
  props.onClick(event({ ctrlKey: true }));
  assertEquals(effects, []);
});

Deno.test("doclist row - hors Mac contextmenu puis Ctrl click conserve une bascule", () => {
  for (const platform of ["Win32", "Linux x86_64"]) {
    const { props, effects } = setup(platform);
    props.onContextMenu(event({ ctrlKey: true }));
    props.onClick(event({ ctrlKey: true }));
    assertEquals(effects, ["toggle"]);
  }
});

Deno.test("doclist row - geste explicite libère l'arbitrage précédent sans annuler la sélection", async () => {
  const effects: string[] = [];
  const arbiter = createClickIntentArbiter(() => () => {});
  arbiter.click({
    key: "earlier",
    onSingle: () =>
      Object.assign(() => {
        effects.push("undo");
      }, { release: () => effects.push("release") }),
    onDouble: () => {
      effects.push("detail");
    },
  });
  const props = doclistRowEvents({}, {
    arbiter,
    platform: "Win32",
    onToggle: () => effects.push("toggle"),
  });
  props.onClick(event({ metaKey: true }));
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(effects, ["toggle", "release"]);
});

Deno.test("doclist row - conserve clic, double-clic, Entrée et Espace", () => {
  const { props, base, effects } = setup();
  const click = event();
  props.onClick(click);
  props.onDblClick(event({ detail: 2 }));
  base.onKeyDown({ key: "Enter", preventDefault() {} });
  base.onKeyDown({ key: " ", preventDefault() {} });
  assertEquals(effects, ["single", "detail", "detail", "single"]);
  assertEquals(click.actions, []);
});

Deno.test("doclist row - sans sélection de groupe les gestes restent inchangés", () => {
  const { props, effects } = setup("MacIntel", false);
  const down = event({ shiftKey: true });
  props.onMouseDown(down);
  props.onClick(event({ shiftKey: true }));
  const menu = event({ ctrlKey: true });
  props.onContextMenu(menu);
  assertEquals(effects, ["single"]);
  assertEquals(down.actions, []);
  assertEquals(menu.actions, []);
});

Deno.test("doclist row - Ctrl choisit une nouvelle ancre puis Shift suit le tri courant", () => {
  const members = ["D", "B", "A", "C"].map((name) => ({
    name,
    label: name,
    fieldsSource: "row" as const,
  }));
  const selected: string[][] = [];
  let anchor = "D";
  let clicked = "A";
  const props = doclistRowEvents({}, {
    arbiter: createClickIntentArbiter(() => () => {}),
    platform: "Win32",
    onToggle: (shiftKey) => {
      if (shiftKey) {
        selected.push(
          extendDoclistRange([], members, anchor, clicked).map((member) =>
            member.name
          ),
        );
      } else {
        anchor = clicked;
        selected.push([clicked]);
      }
    },
  });
  props.onClick(event({ ctrlKey: true }));
  clicked = "C";
  props.onClick(event({ shiftKey: true }));
  assertEquals(anchor, "A");
  assertEquals(selected, [["A"], ["A", "C"]]);
});
