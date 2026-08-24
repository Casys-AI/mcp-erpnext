import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { DocumentChangeEvent } from "../../shared/document-events.ts";
import {
  clearStale,
  createStack,
  pushLevel,
  reportDocumentChange,
} from "../../shared/nav-stack.ts";
import {
  beginUiRefresh,
  completeUiRefresh,
  createUiRefreshSequence,
  invalidateUiRefresh,
} from "../../shared/refresh.ts";
import { canonicalReadbackSupersedesMutation } from "./canonical-readback.ts";

Deno.test("child mutation clears root stale only after its canonical readback succeeds", () => {
  let stack = createStack({ title: "Task", kind: "root" });
  stack = pushLevel(stack, { title: "Orders", kind: "list" });

  let rootFreshEvent = 4;
  const preMutationRead = beginUiRefresh(createUiRefreshSequence());
  assert(preMutationRead.generation !== null);

  const mutation: DocumentChangeEvent = {
    doctype: "Sales Order",
    name: "SO-00042",
    mutation: "submit",
    committedAt: "2026-08-24T12:00:00.000Z",
    source: "doclist.inline-detail",
  };
  stack = reportDocumentChange(stack, "20:00", mutation);
  const mutationBaseline = rootFreshEvent;
  let sequence = invalidateUiRefresh(preMutationRead.state);

  const rejectedOldRead = completeUiRefresh(
    sequence,
    preMutationRead.generation,
  );
  assertEquals(rejectedOldRead.accept, false);
  assertEquals(
    canonicalReadbackSupersedesMutation(mutationBaseline, rootFreshEvent),
    false,
  );
  assert(stack.levels[0].stale);

  const failedRead = beginUiRefresh(rejectedOldRead.state, { force: true });
  assert(failedRead.generation !== null);
  sequence = completeUiRefresh(failedRead.state, failedRead.generation).state;
  // A tool error or invalid payload is not a fresh canonical document.
  assertEquals(
    canonicalReadbackSupersedesMutation(mutationBaseline, rootFreshEvent),
    false,
  );
  assert(stack.levels[0].stale);

  const successfulRead = beginUiRefresh(sequence, { force: true });
  assert(successfulRead.generation !== null);
  const accepted = completeUiRefresh(
    successfulRead.state,
    successfulRead.generation,
  );
  assertEquals(accepted.accept, true);
  rootFreshEvent += 1;
  if (
    canonicalReadbackSupersedesMutation(mutationBaseline, rootFreshEvent)
  ) {
    stack = clearStale(stack, stack.levels[0].id);
  }

  assertEquals(stack.levels[0].stale, undefined);
  assertEquals(stack.levels[1].stale?.documentChange, mutation);
});

Deno.test("DocViewer wires child mutations into root invalidation and reread", async () => {
  const source = await Deno.readTextFile(
    new URL("./DocViewer.tsx", import.meta.url),
  );
  assertStringIncludes(
    source,
    "onDocumentChanged={nav.reportDocumentChange}",
  );
  assertStringIncludes(
    source,
    "onMutationInvalidate={beginCanonicalReadback}",
  );
  assertStringIncludes(
    source,
    "onMutationRefresh={scheduleCanonicalRefresh}",
  );
  assertStringIncludes(source, "onRefresh(true)");
  assertStringIncludes(
    source,
    "canonicalReadbackSupersedesMutation(mutationBaseline, rootFreshEvent)",
  );
});
