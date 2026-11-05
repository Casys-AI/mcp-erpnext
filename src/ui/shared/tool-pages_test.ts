import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { collectToolPages, ToolPaginationError } from "./tool-pages.ts";

Deno.test("tool pages - follows actual short pages to empty with caller-selected page size", async () => {
  const source = Array.from({ length: 705 }, (_, id) => ({ key: `ID-${id}` }));
  const calls: Array<[number, number]> = [];
  const result = await collectToolPages(
    async (offset, limit) => {
      calls.push([offset, limit]);
      return source.slice(offset, offset + 91);
    },
    (row) => row.key,
    () => true,
    { pageSize: 100 },
  );
  assertEquals(result, source);
  assertEquals(calls, [
    [0, 100],
    [91, 100],
    [182, 100],
    [273, 100],
    [364, 100],
    [455, 100],
    [546, 100],
    [637, 100],
    [705, 100],
  ]);
});

Deno.test("tool pages - custom identities are required and duplicate pages cannot loop", async () => {
  for (const page of [[{ key: "" }], [{ key: "a" }, { key: "a" }]]) {
    await assertRejects(
      () => collectToolPages(async () => page, (row) => row.key, () => true),
      ToolPaginationError,
    );
  }
  let calls = 0;
  await assertRejects(
    () =>
      collectToolPages(async () => {
        calls++;
        return [{ key: "unchanged" }];
      }, (row) =>
        row.key, () =>
        true),
    ToolPaginationError,
    "repeated",
  );
  assertEquals(calls, 2);
});

Deno.test("tool pages - a later error never resolves to the earlier rows", async () => {
  const failure = new Error("tool denied the later page");
  let calls = 0;
  const error = await assertRejects(
    () =>
      collectToolPages(async () => {
        if (calls++ === 0) return [{ id: "A" }];
        throw failure;
      }, (row) =>
        row.id, () =>
        true),
    Error,
  );
  assertStrictEquals(error, failure);
});

Deno.test("tool pages - stale generations suppress old success and failure responses", async () => {
  for (const fail of [false, true]) {
    let current = true;
    let calls = 0;
    const result = await collectToolPages(
      async () => {
        calls++;
        current = false;
        if (fail) throw new Error("obsolete error");
        return [{ id: "A" }];
      },
      (row) => row.id,
      () => current,
    );
    assertEquals(result, null);
    assertEquals(calls, 1);
  }
});

Deno.test("tool pages - invalid budgets and page sizes fail before any request", async () => {
  for (
    const options of [
      { pageSize: 0 },
      { pageSize: 1.5 },
      { pageSize: -1 },
      { deadlineMs: 0 },
      { deadlineMs: Infinity },
    ]
  ) {
    let calls = 0;
    await assertRejects(
      () =>
        collectToolPages(async () => {
          calls++;
          return [{ id: "A" }];
        }, (row) =>
          row.id, () =>
          true, options),
      ToolPaginationError,
    );
    assertEquals(calls, 0);
  }
});
