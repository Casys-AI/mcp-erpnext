import { assertEquals } from "@std/assert";
import { createSerialQueue, createSingleFlightGate } from "./single-flight.ts";

Deno.test("single-flight : bloque un second clic jusqu'au règlement", () => {
  const gate = createSingleFlightGate();
  const first = gate.begin();
  assertEquals(typeof first, "number");
  assertEquals(gate.begin(), null);
  assertEquals(gate.settle(first!), true);
  const second = gate.begin();
  assertEquals(typeof second, "number");
  assertEquals(gate.settle(first!), false);
  assertEquals(gate.begin(), null);
  assertEquals(gate.settle(second!), true);
});

Deno.test("single-flight : reset invalide la réponse de l'ancien panneau", () => {
  const gate = createSingleFlightGate();
  const old = gate.begin()!;
  gate.reset();
  assertEquals(gate.settle(old), false);
  assertEquals(typeof gate.begin(), "number");
});

Deno.test("serial queue : conserve l'ordre et continue après un rejet", async () => {
  const queue = createSerialQueue();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    throw new Error("expected");
  });
  const second = queue.run(async () => {
    events.push("second");
    return "ok";
  });

  await Promise.resolve();
  assertEquals(events, ["first:start"]);
  releaseFirst();
  await first.catch(() => undefined);
  assertEquals(await second, "ok");
  assertEquals(events, ["first:start", "first:end", "second"]);
});
