import { assertEquals } from "@std/assert";
import {
  CLICK_INTENT_REVERT_WINDOW_MS,
  type ClickIntent,
  type ClickIntentKeyEvent,
  type ClickIntentRevert,
  type ClickIntentSchedule,
  createClickIntentArbiter as createArbiter,
  type DetailClickIntent,
  detailOnClickIntent,
  isDetailClickIntent,
} from "./click-intent.ts";

function createClickIntentArbiter() {
  return createArbiter(() => () => {});
}

function intent(key: string, events: string[]): ClickIntent {
  return {
    key,
    onSingle: () => {
      events.push(`single:${key}`);
      return () => {
        events.push(`revert:${key}`);
      };
    },
    onDouble: () => events.push(`double:${key}`),
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

Deno.test("click intent - runs one simple click immediately", () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];

  arbiter.click(intent("A", events));

  assertEquals(events, ["single:A"]);
});

Deno.test("click intent - retention window releases history but never delays the simple", async () => {
  let releaseWindow = () => {};
  let scheduledDelay = 0;
  const schedule: ClickIntentSchedule = (run, delayMs) => {
    releaseWindow = run;
    scheduledDelay = delayMs;
    return () => {};
  };
  const arbiter = createArbiter(schedule);
  const events: string[] = [];
  const revert: ClickIntentRevert = () => {
    events.push("revert");
  };
  revert.release = () => {
    events.push("release");
  };

  arbiter.click({
    key: "A",
    onSingle: () => {
      events.push("single");
      return revert;
    },
    onDouble: () => events.push("double"),
  });
  assertEquals(events, ["single"]);
  assertEquals(scheduledDelay, CLICK_INTENT_REVERT_WINDOW_MS);

  await Promise.resolve();
  releaseWindow();
  await Promise.resolve();
  assertEquals(events, ["single", "release"]);
});

Deno.test("click intent - native double reverts the immediate simple before detail", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target = intent("A", events);

  // Sequence native : click, click(detail=2), puis dblclick.
  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  assertEquals(events, ["single:A"]);

  await nextTurn();
  assertEquals(events, ["single:A", "revert:A", "double:A"]);
});

Deno.test("click intent - different targets keep both immediate simple clicks", () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];

  arbiter.click(intent("A", events));
  arbiter.click(intent("B", events));

  assertEquals(events, ["single:A", "single:B"]);
});

Deno.test("click intent - a double-click compensates only its own target", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const first = intent("A", events);

  arbiter.click(intent("B", events));
  arbiter.click(first, 1);
  arbiter.click(first, 2);
  arbiter.doubleClick(first);
  await nextTurn();

  assertEquals(events, ["single:B", "single:A", "revert:A", "double:A"]);
});

Deno.test("click intent - a double waits for async context restore", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  let finishRestore = () => {};
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return () => {
        events.push("restore:start");
        return new Promise<void>((resolve) => {
          finishRestore = resolve;
        });
      };
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);

  finishRestore();
  await nextTurn();
  assertEquals(events, ["single", "restore:start", "double"]);
});

Deno.test("click intent - a failed immediate restore keeps detail closed", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return () => {
        events.push("restore:failed");
        return Promise.resolve(false);
      };
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();

  assertEquals(events, ["single", "restore:failed"]);
});

Deno.test("click intent - repeated doubles cannot bypass a pending failed restore", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  let finishRestore = (_restored: boolean) => {};
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return () => {
        events.push("restore:start");
        return new Promise<boolean>((resolve) => {
          finishRestore = resolve;
        });
      };
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  arbiter.doubleClick(target);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);

  finishRestore(false);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);
});

Deno.test("click intent - a later double in the same click burst cannot bypass a failed restore", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return () => {
        events.push("restore:failed");
        return Promise.resolve(false);
      };
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();

  // Suite native possible d'une rafale de quatre clics.
  arbiter.click(target, 3);
  arbiter.click(target, 4);
  arbiter.doubleClick(target);
  await nextTurn();
  assertEquals(events, ["single", "restore:failed"]);

  // Une nouvelle séquence native repart bien d'un premier clic explicite.
  arbiter.click(target, 1);
  assertEquals(events, ["single", "restore:failed", "single"]);
});

Deno.test("click intent - cleanup cancels a double waiting on restore", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  let finishRestore = () => {};
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return () => {
        events.push("restore:start");
        return new Promise<void>((resolve) => {
          finishRestore = resolve;
        });
      };
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();
  arbiter.cancelAll();
  finishRestore();
  await nextTurn();

  assertEquals(events, ["single", "restore:start"]);
});

Deno.test("click intent - Space runs context and Enter runs detail immediately", () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const prevented: string[] = [];
  const target = intent("A", events);

  arbiter.keyDown(target, {
    key: " ",
    preventDefault: () => prevented.push("Space"),
  });
  arbiter.keyDown(target, {
    key: "Enter",
    preventDefault: () => prevented.push("Enter"),
  });
  arbiter.keyDown(target, {
    key: "Escape",
    preventDefault: () => prevented.push("Escape"),
  });

  assertEquals(events, ["single:A", "double:A"]);
  assertEquals(prevented, ["Space", "Enter"]);
});

Deno.test("click intent - repeated keyboard events stay inert", () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  let prevented = 0;

  arbiter.keyDown(intent("A", events), {
    key: "Enter",
    repeat: true,
    preventDefault: () => prevented += 1,
  });

  assertEquals(events, []);
  assertEquals(prevented, 0);
});

Deno.test("click intent - Enter preserves an immediate pointer context", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target = intent("A", events);

  arbiter.click(target);
  await Promise.resolve();
  arbiter.keyDown(target, {
    key: "Enter",
    preventDefault: () => {},
  });

  assertEquals(events, ["single:A", "double:A"]);
});

Deno.test("click intent - a new first click releases history without reverting", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const revert: ClickIntentRevert = () => {
    events.push("revert");
  };
  revert.release = () => {
    events.push("release");
  };
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single:A");
      return revert;
    },
    onDouble: () => events.push("double:A"),
  };

  arbiter.click(target);
  await Promise.resolve();
  arbiter.click(intent("B", events));
  await Promise.resolve();

  assertEquals(events, ["single:A", "single:B", "release"]);
});

Deno.test("click intent - releases history after a compensated double", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const revert: ClickIntentRevert = () => {
    events.push("revert");
  };
  revert.release = () => {
    events.push("release");
  };
  const target: ClickIntent = {
    key: "A",
    onSingle: () => {
      events.push("single");
      return revert;
    },
    onDouble: () => events.push("double"),
  };

  arbiter.click(target);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();

  assertEquals(events, ["single", "revert", "release", "double"]);
});

Deno.test("click intent - cancel and cleanup release without undoing", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const makeTarget = (key: string): ClickIntent => {
    const revert: ClickIntentRevert = () => {
      events.push(`revert:${key}`);
    };
    revert.release = () => {
      events.push(`release:${key}`);
    };
    return {
      key,
      onSingle: () => {
        events.push(`single:${key}`);
        return revert;
      },
      onDouble: () => events.push(`double:${key}`),
    };
  };

  arbiter.click(makeTarget("A"));
  await Promise.resolve();
  arbiter.cancel("A");
  arbiter.click(makeTarget("B"));
  await Promise.resolve();
  arbiter.cancelAll();
  await Promise.resolve();

  assertEquals(events, ["single:A", "single:B", "release:A", "release:B"]);
});

// ── Matrice : mode de la cible × geste → effet ───────────────────────────────
//
// Ce tableau est la grammaire d'interaction. Une cible dont le contexte est
// disponible réserve le clic simple au contexte (détail = double-clic/Entrée) ;
// une cible sans contexte n'a rien à réserver, donc clic, Espace et Entrée
// ouvrent le détail local, une seule fois.

type Gesture =
  | "click"
  | "click-detail-0"
  | "click-detail-2"
  | "dblclick"
  | "space"
  | "enter"
  | "space-repeat";

function key(name: string, repeat = false) {
  const calls = { prevented: 0 };
  const event: ClickIntentKeyEvent = {
    key: name,
    repeat,
    preventDefault: () => {
      calls.prevented++;
    },
  };
  return { event, calls };
}

function perform(
  arbiter: ReturnType<typeof createClickIntentArbiter>,
  target: ClickIntent,
  gesture: Gesture,
) {
  switch (gesture) {
    case "click":
      return arbiter.click(target, 1);
    case "click-detail-0":
      return arbiter.click(target, 0);
    case "click-detail-2":
      return arbiter.click(target, 2);
    case "dblclick":
      return arbiter.doubleClick(target);
    case "space":
      return arbiter.keyDown(target, key(" ").event);
    case "enter":
      return arbiter.keyDown(target, key("Enter").event);
    case "space-repeat":
      return arbiter.keyDown(target, key(" ", true).event);
  }
}

function detailIntent(name: string, events: string[]): ClickIntent {
  return detailOnClickIntent(name, () => events.push(`open:${name}`));
}

const MATRIX: Array<
  {
    mode: "context" | "detail";
    gesture: Gesture;
    effects: string[];
  }
> = [
  { mode: "context", gesture: "click", effects: ["single:A"] },
  { mode: "context", gesture: "click-detail-0", effects: ["single:A"] },
  { mode: "context", gesture: "space", effects: ["single:A"] },
  { mode: "context", gesture: "enter", effects: ["double:A"] },
  { mode: "context", gesture: "space-repeat", effects: [] },
  { mode: "detail", gesture: "click", effects: ["open:A"] },
  { mode: "detail", gesture: "click-detail-0", effects: ["open:A"] },
  { mode: "detail", gesture: "click-detail-2", effects: [] },
  { mode: "detail", gesture: "dblclick", effects: [] },
  { mode: "detail", gesture: "space", effects: ["open:A"] },
  { mode: "detail", gesture: "enter", effects: ["open:A"] },
  { mode: "detail", gesture: "space-repeat", effects: [] },
];

for (const { mode, gesture, effects } of MATRIX) {
  Deno.test(
    `click intent matrix - ${mode} target, ${gesture} -> ${
      effects.join(",") || "nothing"
    }`,
    () => {
      const arbiter = createClickIntentArbiter();
      const events: string[] = [];
      const target = mode === "detail"
        ? detailIntent("A", events)
        : intent("A", events);

      perform(arbiter, target, gesture);

      assertEquals(events, effects);
    },
  );
}

Deno.test("click intent - a detail click opens exactly once through a full native double-click burst", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target = detailIntent("A", events);

  // Clics natifs detail=1..4, puis les dblclick émis par le navigateur.
  for (const count of [1, 2, 3, 4]) arbiter.click(target, count);
  arbiter.doubleClick(target);
  arbiter.doubleClick(target);
  await nextTurn();

  assertEquals(events, ["open:A"]);
});

Deno.test("click intent - Space and Enter on a detail target prevent default and open once each", () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];
  const target = detailIntent("A", events);
  const space = key(" ");
  const enter = key("Enter");
  const other = key("a");

  arbiter.keyDown(target, space.event);
  arbiter.keyDown(target, enter.event);
  arbiter.keyDown(target, other.event);

  assertEquals(events, ["open:A", "open:A"]);
  assertEquals(space.calls.prevented, 1);
  assertEquals(enter.calls.prevented, 1);
  assertEquals(other.calls.prevented, 0);
});

Deno.test("click intent - a detail intent has no single action and no conversation channel", () => {
  const target = detailOnClickIntent("A", () => {});

  assertEquals(isDetailClickIntent(target), true);
  assertEquals(target.doublePolicy, "local");
  assertEquals("onSingle" in target, false);
  assertEquals("runConversation" in target, false);
  assertEquals(isDetailClickIntent(intent("A", [])), false);
});

Deno.test("click intent - a detail click never touches a context sibling nor reverts anything", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];

  arbiter.click(intent("A", events), 1);
  arbiter.click(detailIntent("B", events), 1);
  await nextTurn();

  assertEquals(events, ["single:A", "open:B"]);
});

Deno.test("click intent - the same key switching from context to detail inside the revert window leaves no residual revert", async () => {
  const arbiter = createClickIntentArbiter();
  const events: string[] = [];

  arbiter.click(intent("A", events), 1);
  // La capacité de contexte disparaît : la même cible passe en mode détail.
  arbiter.click(detailIntent("A", events), 1);
  arbiter.click(detailIntent("A", events), 2);
  arbiter.doubleClick(detailIntent("A", events));
  await nextTurn();

  assertEquals(events, ["single:A", "open:A"]);
});

Deno.test("click intent - illegal detail intents do not type-check", () => {
  const conversational: DetailClickIntent = {
    key: "A",
    clickAction: "detail",
    doublePolicy: "local",
    onDouble: () => {},
    // @ts-expect-error un clic de détail ne fabrique jamais de message
    runConversation: () => Promise.resolve(true),
  };
  const withSingle: DetailClickIntent = {
    key: "A",
    clickAction: "detail",
    doublePolicy: "local",
    onDouble: () => {},
    // @ts-expect-error le détail au clic n'a pas d'action simple séparée
    onSingle: () => {},
  };
  const conversationPolicy: DetailClickIntent = {
    key: "A",
    clickAction: "detail",
    // @ts-expect-error seul le détail local est permis
    doublePolicy: "after-context",
    onDouble: () => {},
  };
  assertEquals(
    [conversational, withSingle, conversationPolicy].length,
    3,
  );
});
