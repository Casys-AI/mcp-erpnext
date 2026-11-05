import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import type { ToolResultPayload } from "../refresh.ts";
import { loadAssignableUsers } from "./assignable-users.ts";

function result(data: unknown[]): ToolResultPayload {
  return { structuredContent: { doctype: "User", count: data.length, data } };
}

for (const serverCap of [100, 37]) {
  Deno.test(`assignable users includes all users beyond 100 with server cap ${serverCap}`, async () => {
    const allUsers = Array.from({ length: 213 }, (_, index) => ({
      name: `user-${index}@example.com`,
      full_name: `User ${index}`,
    }));
    const offsets: number[] = [];
    const users = await loadAssignableUsers({
      callServerTool: (params, options) => {
        assertEquals(params.name, "erpnext_user_list");
        assertEquals(params.arguments.limit, 100);
        assertEquals(options, { timeout: 10_000 });
        const offset = Number(params.arguments.offset);
        offsets.push(offset);
        return Promise.resolve(
          result(allUsers.slice(offset, offset + serverCap)),
        );
      },
    }, () => true);
    assertEquals(users, allUsers);
    assertEquals(
      offsets,
      serverCap === 100 ? [0, 100, 200, 213] : [0, 37, 74, 111, 148, 185, 213],
    );
  });
}

Deno.test("assignable users rejects late transport and tool errors without a partial result", async () => {
  for (const transportFailure of [false, true]) {
    const failure = new Error("Later user page denied");
    let calls = 0;
    const error = await assertRejects(
      () =>
        loadAssignableUsers({
          callServerTool: () => {
            if (++calls === 1) {
              return Promise.resolve(result([{ name: "user@example.com" }]));
            }
            if (transportFailure) return Promise.reject(failure);
            return Promise.resolve({
              isError: true,
              structuredContent: { errorMessage: failure.message },
            });
          },
        }, () => true),
      Error,
      failure.message,
    );
    assertEquals(calls, 2);
    if (transportFailure) assertStrictEquals(error, failure);
  }
});

Deno.test("assignable users discards stale results and errors without requesting another page", async () => {
  for (const fail of [false, true]) {
    let current = true;
    let calls = 0;
    const users = await loadAssignableUsers({
      callServerTool: () => {
        calls++;
        current = false;
        return fail
          ? Promise.reject(new Error("Old request denied"))
          : Promise.resolve(result([{ name: "old@example.com" }]));
      },
    }, () => current);
    assertEquals(users, null);
    assertEquals(calls, 1);
  }
  let calls = 0;
  assertEquals(
    await loadAssignableUsers({
      callServerTool: () => {
        calls++;
        return Promise.resolve(result([]));
      },
    }, () => false),
    null,
  );
  assertEquals(calls, 0);
});

Deno.test("assignable users rejects malformed data and repeated pages", async () => {
  for (const payload of [{}, result([{}]), result([{ name: "" }])]) {
    await assertRejects(() =>
      loadAssignableUsers({
        callServerTool: () => Promise.resolve(payload),
      }, () => true)
    );
  }
  let calls = 0;
  await assertRejects(
    () =>
      loadAssignableUsers({
        callServerTool: () => {
          calls++;
          return Promise.resolve(result([{ name: "same@example.com" }]));
        },
      }, () => true),
    Error,
    "repeated",
  );
  assertEquals(calls, 2);
});
