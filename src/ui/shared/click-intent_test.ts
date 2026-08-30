import { assertEquals } from "@std/assert";
import {
  CLICK_INTENT_DELAY_MS,
  type ClickIntent,
  type ClickIntentRevert,
  type ClickIntentSchedule,
  createClickIntentArbiter,
} from "./click-intent.ts";

interface ScheduledTask {
  cancelled: boolean;
  delayMs: number;
  run: () => void;
}

function fakeScheduler() {
  const tasks: ScheduledTask[] = [];
  const schedule: ClickIntentSchedule = (run, delayMs) => {
    const task = { cancelled: false, delayMs, run };
    tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  };
  return {
    schedule,
    delays: () => tasks.map((task) => task.delayMs),
    flush: () => {
      const current = tasks.splice(0);
      for (const task of current) {
        if (!task.cancelled) task.run();
      }
    },
  };
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

Deno.test("click intent - confirms one simple click after 320 ms", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];

  arbiter.click(intent("A", events));
  assertEquals(events, []);
  assertEquals(scheduler.delays(), [CLICK_INTENT_DELAY_MS]);

  scheduler.flush();
  assertEquals(events, ["single:A"]);
});

Deno.test("click intent - double-click cancels both simple click events", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];
  const target = intent("A", events);

  // Sequence native : click, click, puis dblclick.
  arbiter.click(target, 1);
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  scheduler.flush();

  assertEquals(events, ["double:A"]);
});

Deno.test("click intent - different targets keep independent simple clicks", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];

  arbiter.click(intent("A", events));
  arbiter.click(intent("B", events));
  scheduler.flush();

  assertEquals(events, ["single:A", "single:B"]);
});

Deno.test("click intent - a double-click cancels only its own target", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];
  const first = intent("A", events);

  arbiter.click(first, 1);
  arbiter.click(intent("B", events));
  arbiter.click(first, 2);
  arbiter.doubleClick(first);
  scheduler.flush();

  assertEquals(events, ["double:A", "single:B"]);
});

Deno.test("click intent - a late native double reverts context before detail", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];
  const target = intent("A", events);

  arbiter.click(target, 1);
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  scheduler.flush();
  await nextTurn();

  assertEquals(events, ["single:A", "revert:A", "double:A"]);
});

Deno.test("click intent - a late double waits for async context restore", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);

  finishRestore();
  await nextTurn();
  assertEquals(events, ["single", "restore:start", "double"]);
});

Deno.test("click intent - a failed late restore keeps detail closed", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();

  assertEquals(events, ["single", "restore:failed"]);
});

Deno.test("click intent - repeated doubles cannot bypass a pending failed restore", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  arbiter.doubleClick(target);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);

  finishRestore(false);
  await nextTurn();
  assertEquals(events, ["single", "restore:start"]);
});

Deno.test("click intent - cleanup cancels a double waiting on restore", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  arbiter.cancelAll();
  finishRestore();
  await nextTurn();

  assertEquals(events, ["single", "restore:start"]);
});

Deno.test("click intent - Space runs context and Enter runs drilldown immediately", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  assertEquals(scheduler.delays(), []);
});

Deno.test("click intent - repeated keyboard events stay inert", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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

Deno.test("click intent - keyboard activation cancels a pending pointer click", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];
  const target = intent("A", events);

  arbiter.click(target);
  arbiter.keyDown(target, {
    key: "Enter",
    preventDefault: () => {},
  });
  scheduler.flush();

  assertEquals(events, ["double:A"]);
});

Deno.test("click intent - Enter preserves a confirmed pointer context", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];
  const target = intent("A", events);

  arbiter.click(target);
  scheduler.flush();
  await Promise.resolve();
  arbiter.keyDown(target, {
    key: "Enter",
    preventDefault: () => {},
  });

  assertEquals(events, ["single:A", "double:A"]);
});

Deno.test("click intent - releases history without reverting confirmed context", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  await Promise.resolve();
  arbiter.keyDown(target, {
    key: "Enter",
    preventDefault: () => {},
  });
  await Promise.resolve();

  assertEquals(events, ["single", "double", "release"]);
});

Deno.test("click intent - releases history after a compensated double", async () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
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
  scheduler.flush();
  arbiter.click(target, 2);
  arbiter.doubleClick(target);
  await nextTurn();

  assertEquals(events, ["single", "revert", "release", "double"]);
});

Deno.test("click intent - cancel and cleanup prevent delayed actions", () => {
  const scheduler = fakeScheduler();
  const arbiter = createClickIntentArbiter(scheduler.schedule);
  const events: string[] = [];

  arbiter.click(intent("A", events));
  arbiter.click(intent("B", events));
  arbiter.cancel("A");
  arbiter.cancelAll();
  scheduler.flush();

  assertEquals(events, []);
});
