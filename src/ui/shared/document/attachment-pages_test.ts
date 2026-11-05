import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { readAttachmentMetadata } from "./attachment-pages.ts";

function files(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `FILE-${index}`,
    file_name: `file-${index}.pdf`,
    file_size: index + 1,
    is_private: 1,
  }));
}

function result(data: unknown[]) {
  return { structuredContent: { data } };
}

Deno.test("attachment pages - returns every metadata row beyond fifty files", async () => {
  const data = files(121);
  const requests: Array<{ limit: number; offset: number }> = [];
  const loaded = await readAttachmentMetadata(async (page) => {
    requests.push(page);
    return result(data.slice(page.offset, page.offset + page.limit));
  }, () => true);
  assertEquals(loaded?.length, 121);
  assertEquals(loaded?.map((file) => file.id), data.map((file) => file.name));
  assertEquals(requests, [
    { limit: 50, offset: 0 },
    { limit: 50, offset: 50 },
    { limit: 50, offset: 100 },
    { limit: 50, offset: 121 },
  ]);
});

Deno.test("attachment pages - advances by the actual server-capped page size", async () => {
  const data = files(73);
  const offsets: number[] = [];
  const loaded = await readAttachmentMetadata(async ({ offset }) => {
    offsets.push(offset);
    return result(data.slice(offset, offset + 17));
  }, () => true);
  assertEquals(loaded?.length, 73);
  assertEquals(offsets, [0, 17, 34, 51, 68, 73]);
});

Deno.test("attachment pages - rejects repeated files within or across pages", async () => {
  const file = files(1)[0];
  await assertRejects(
    () => readAttachmentMetadata(async () => result([file, file]), () => true),
    Error,
    "repeated a row identity",
  );
  let calls = 0;
  await assertRejects(
    () =>
      readAttachmentMetadata(async () => {
        calls++;
        return result([file]);
      }, () => true),
    Error,
    "repeated a row identity",
  );
  assertEquals(calls, 2);
});

Deno.test("attachment pages - missing canonical identities and oversized pages fail", async () => {
  await assertRejects(
    () =>
      readAttachmentMetadata(
        async () => result([{ file_name: "unknown.pdf" }]),
        () => true,
      ),
    Error,
    "canonical identity",
  );
  await assertRejects(
    () => readAttachmentMetadata(async () => result(files(51)), () => true),
    Error,
    "oversized page",
  );
});

Deno.test("attachment pages - a late request failure never resolves to the earlier partial list", async () => {
  const failure = new Error("read denied");
  let calls = 0;
  const error = await assertRejects(
    () =>
      readAttachmentMetadata(async () => {
        if (calls++ === 0) return result(files(50));
        throw failure;
      }, () => true),
    Error,
    "read denied",
  );
  assertStrictEquals(error, failure);
});

Deno.test("attachment pages - a later tool error also discards the partial metadata", async () => {
  let calls = 0;
  await assertRejects(
    () =>
      readAttachmentMetadata(
        async () => calls++ === 0 ? result(files(50)) : { isError: true },
        () => true,
      ),
    Error,
    "attachment list failed",
  );
});

Deno.test("attachment pages - a stale generation starts no request", async () => {
  let calls = 0;
  const loaded = await readAttachmentMetadata(async () => {
    calls++;
    return result([]);
  }, () => false);
  assertEquals(loaded, null);
  assertEquals(calls, 0);
});

Deno.test("attachment pages - a stale response is ignored without starting another request", async () => {
  let current = true;
  let calls = 0;
  const loaded = await readAttachmentMetadata(async () => {
    calls++;
    current = false;
    return { isError: true };
  }, () => current);
  assertEquals(loaded, null);
  assertEquals(calls, 1);
});

Deno.test("attachment pages - rechecks generation before requesting the next page", async () => {
  let checks = 0;
  let calls = 0;
  const loaded = await readAttachmentMetadata(async () => {
    calls++;
    return result(files(50));
  }, () => ++checks <= 2);
  assertEquals(loaded, null);
  assertEquals(calls, 1);
});

Deno.test("attachment pages - a failure from an obsolete generation is ignored", async () => {
  let current = true;
  const loaded = await readAttachmentMetadata(async () => {
    current = false;
    throw new Error("obsolete request");
  }, () => current);
  assertEquals(loaded, null);
});

Deno.test("attachment pages - a shared deadline stops metadata pagination without a partial result", async () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  let calls = 0;
  try {
    await assertRejects(
      () =>
        readAttachmentMetadata(async () => {
          now += 100;
          return result(calls++ === 0 ? files(50) : []);
        }, () =>
          true, { deadlineMs: 1150 }),
      Error,
      "deadline",
    );
    assertEquals(calls, 2);
  } finally {
    Date.now = originalNow;
  }
});
