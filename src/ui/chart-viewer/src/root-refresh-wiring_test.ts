import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
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

const VIEWERS = [
  ["chart", new URL("./ChartViewer.tsx", import.meta.url)],
  ["kpi", new URL("../../kpi-viewer/src/KpiViewer.tsx", import.meta.url)],
  [
    "funnel",
    new URL("../../funnel-viewer/src/FunnelViewer.tsx", import.meta.url),
  ],
  ["stock", new URL("../../stock-viewer/src/StockViewer.tsx", import.meta.url)],
  [
    "kanban",
    new URL("../../kanban-viewer/src/KanbanViewer.tsx", import.meta.url),
  ],
] as const;

Deno.test("root refresh sequence rejects pre-mutation data and coalesces one forced reread", () => {
  let sequence = createUiRefreshSequence();
  const oldRefresh = beginUiRefresh(sequence);
  assert(oldRefresh.generation !== null);
  sequence = oldRefresh.state;

  const mutationEvent = 1;
  sequence = invalidateUiRefresh(sequence);
  const queued = beginUiRefresh(sequence, { force: true });
  assertEquals(queued.generation, null);
  assertEquals(queued.state.pendingForced, true);

  const oldCompletion = completeUiRefresh(
    queued.state,
    oldRefresh.generation,
  );
  assertEquals(oldCompletion.accept, false);
  assertEquals(oldCompletion.runPending, true);

  const canonicalRefresh = beginUiRefresh(oldCompletion.state, {
    force: true,
  });
  assert(canonicalRefresh.generation !== null);
  const canonicalCompletion = completeUiRefresh(
    canonicalRefresh.state,
    canonicalRefresh.generation,
  );
  assertEquals(canonicalCompletion.accept, true);
  assertEquals(canonicalCompletion.runPending, false);

  const freshEvent = mutationEvent + 1;
  assert(freshEvent > mutationEvent);
});

Deno.test("canonical root reread clears only the root stale marker", () => {
  const rootBody = { rows: ["root"] };
  const parentBody = { rows: ["parent"] };
  const childBody = { rows: ["child"] };
  let stack = createStack({ title: "Root", kind: "root", body: rootBody });
  stack = pushLevel(stack, {
    title: "Parent",
    kind: "record",
    body: parentBody,
  });
  stack = pushLevel(stack, {
    title: "Child",
    kind: "list",
    body: childBody,
  });
  const change: DocumentChangeEvent = {
    doctype: "Sales Invoice",
    name: "SINV-0001",
    mutation: "submit",
    committedAt: "2026-08-24T12:00:00.000Z",
    source: "document-viewer",
  };
  stack = reportDocumentChange(stack, "20:00", change);

  const cleared = clearStale(stack, stack.levels[0].id);
  assertEquals(cleared.levels.map((level) => level.stale?.at), [
    undefined,
    "20:00",
    "20:00",
  ]);
  assertEquals(cleared.levels.map((level) => level.body), [
    rootBody,
    parentBody,
    childBody,
  ]);
});

Deno.test("all custom-root viewers wire document mutations to an exact forced root reread", async () => {
  for (const [name, url] of VIEWERS) {
    const source = await Deno.readTextFile(url);
    assertStringIncludes(
      source,
      "onDocumentChanged={nav.reportDocumentChange}",
      `${name}: structured document change`,
    );
    assertStringIncludes(
      source,
      "onMutationInvalidate={onMutationInvalidate}",
      `${name}: immediate invalidation`,
    );
    assertStringIncludes(
      source,
      "onMutationRefresh={onMutationRefresh}",
      `${name}: canonical reread`,
    );
    assertStringIncludes(
      source,
      "rootFreshEvent > rootMutationEvent",
      `${name}: freshness ordering`,
    );
    assertStringIncludes(
      source,
      "nav.clearStale(root.id)",
      `${name}: root-only stale clearing`,
    );
    assertStringIncludes(
      source,
      "rootRefreshRequest ?? undefined",
      `${name}: stable root identity uses the resolved request`,
    );
    assertMatch(
      source,
      /(?:readAvailableTools\(data\)|data\._availableTools|state\.board\._availableTools)\?\.includes\(rootRefreshRequest\.toolName\)/,
      `${name}: refresh requires the exact advertised tool`,
    );
    assertMatch(
      source,
      /onMutationInvalidate=\{\(\) => \{\s*setRootMutationEvent\(\+\+rootEventRef\.current\);\s*refreshSequenceRef\.current = invalidateUiRefresh/s,
      `${name}: mutation is ordered before refresh invalidation`,
    );
    assertStringIncludes(
      source,
      "force: true",
      `${name}: mutation reread bypasses the passive throttle`,
    );
  }
});

Deno.test("kanban counts only canonical board payloads as fresh", async () => {
  const source = await Deno.readTextFile(
    new URL("../../kanban-viewer/src/KanbanViewer.tsx", import.meta.url),
  );
  assertMatch(
    source,
    /\?\.refreshRequest \?\?\s*resolveKanbanRefreshRequest/s,
  );
  assertEquals(
    [...source.matchAll(/acceptCanonicalBoard\(parseBoard\(text\)\)/g)].length,
    2,
  );
  assertEquals(source.includes("updateBoard(parseBoard(text))"), false);
});

Deno.test("chart cancels stale gestures before the next root can paint", async () => {
  const source = await Deno.readTextFile(
    new URL("./ChartViewer.tsx", import.meta.url),
  );
  assertStringIncludes(
    source,
    "useLayoutEffect(() => () => clickIntent.cancelAll(), [clickIntent, rootKey])",
  );
});
