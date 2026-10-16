import { assertEquals } from "@std/assert";
import {
  beginUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  invalidateUiRefresh,
} from "./refresh-sequence.ts";

Deno.test("refresh sequence accepts the current response and blocks overlapping passive requests", () => {
  const started = beginUiRefresh(createUiRefreshSequence());
  const overlapping = beginUiRefresh(started.state);
  assertEquals(overlapping.generation, null);
  assertEquals(overlapping.state, started.state);

  const completed = completeUiRefresh(started.state, started.generation!);
  assertEquals(completed.accept, true);
  assertEquals(completed.runPending, false);
  assertEquals(completed.state.inFlight, null);
});

Deno.test("refresh sequence rejects an older response after a host payload", () => {
  const started = beginUiRefresh(createUiRefreshSequence());
  const generation = started.generation!;
  const afterHostResult = invalidateUiRefresh(started.state);
  const completed = completeUiRefresh(afterHostResult, generation);

  assertEquals(completed.accept, false);
  assertEquals(completed.runPending, false);
  assertEquals(completed.state.inFlight, null);
});

Deno.test("refresh sequence keeps a forced refresh pending behind the active request", () => {
  const first = beginUiRefresh(createUiRefreshSequence());
  const queuedOnce = beginUiRefresh(first.state, { force: true });
  const queued = beginUiRefresh(queuedOnce.state, { force: true });

  assertEquals(queued.generation, null);
  assertEquals(queued.state.pendingForced, true);
  assertEquals(queued.state.generation > first.state.generation, true);

  const completed = completeUiRefresh(queued.state, first.generation!);
  assertEquals(completed.accept, false);
  assertEquals(completed.runPending, true);
  assertEquals(completed.state.pendingForced, true);

  const second = beginUiRefresh(completed.state, { force: true });
  assertEquals(second.generation !== null, true);
  assertEquals(second.state.pendingForced, false);
  const secondCompleted = completeUiRefresh(
    second.state,
    second.generation!,
  );
  assertEquals(secondCompleted.runPending, false);
});

Deno.test("refresh sequence ignores completion of an unrelated request", () => {
  const started = beginUiRefresh(createUiRefreshSequence());
  const completed = completeUiRefresh(started.state, started.generation! + 1);

  assertEquals(completed.accept, false);
  assertEquals(completed.state, started.state);
  assertEquals(completed.state.inFlight, started.generation);
});
