import { assertEquals } from "@std/assert";
import {
  CLICK_INTENT_REVERT_WINDOW_MS,
  type ClickIntent,
  type ClickIntentRevert,
  type ClickIntentSchedule,
  createClickIntentArbiter as createArbiter,
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
      return async () => {
        events.push("restore:failed");
        return false;
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
      return async () => {
        events.push("restore:failed");
        return false;
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
