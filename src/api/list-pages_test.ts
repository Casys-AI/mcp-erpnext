import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { FrappeAPIError } from "./frappe-client.ts";
import type { FrappeClient } from "./frappe-client.ts";
import type { FrappeDoc, FrappeListOptions } from "./types.ts";
import { FrappePaginationError, listAll, listPages } from "./list-pages.ts";

function rows(count: number): FrappeDoc[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `ROW-${String(index).padStart(6, "0")}`,
    amount: index + 1,
  }));
}

function fixture(data: FrappeDoc[], serverPageLimit = 200) {
  const calls: Array<{
    doctype: string;
    options: FrappeListOptions;
    cache?: { skipCache?: boolean };
  }> = [];
  const client = {
    list: async (
      doctype: string,
      options: FrappeListOptions,
      cache?: { skipCache?: boolean },
    ) => {
      calls.push({ doctype, options, cache });
      const cursor = options.filters?.find((filter) =>
        filter[0] === "name" && filter[1] === ">"
      )?.[2];
      const start = cursor === undefined
        ? 0
        : data.findIndex((row) => row.name === cursor) + 1;
      return data.slice(
        start,
        start + Math.min(options.limit!, serverPageLimit),
      );
    },
  } as unknown as FrappeClient;
  return { client, calls };
}

async function consume(client: FrappeClient): Promise<number> {
  let count = 0;
  for await (const page of listPages(client, "Sales Order Item")) {
    count += page.length;
  }
  return count;
}

Deno.test("listPages - streams beyond old aggregate caps and retains parent, filters and fields", async () => {
  const { client, calls } = fixture(rows(2405));
  const options = {
    parent: "Sales Order",
    fields: ["amount", "name"],
    filters: [["docstatus", "!=", 2]],
  } satisfies FrappeListOptions;
  const original = structuredClone(options);
  let total = 0;
  let count = 0;
  for await (const page of listPages(client, "Sales Order Item", options)) {
    assert(page.length <= 200);
    total += page.reduce((sum, row) => sum + Number(row.amount), 0);
    count += page.length;
  }
  assertEquals(count, 2405);
  assertEquals(total, 2405 * 2406 / 2);
  assertEquals(calls.length, 14);
  assertEquals(options, original);
  for (const call of calls) {
    assertEquals(call.doctype, "Sales Order Item");
    assertEquals(call.options.parent, "Sales Order");
    assertEquals(call.options.fields, ["name", "amount"]);
    assertEquals(call.options.filters?.[0], ["docstatus", "!=", 2]);
    assertEquals(call.options.order_by, "name asc");
    assertEquals(call.options.limit, 200);
    assertEquals(call.options.limit_start, undefined);
    assertEquals(call.cache, { skipCache: true });
  }
  assertEquals(calls[1].options.filters?.[1], ["name", ">", "ROW-000199"]);
  assertEquals(calls.at(-1)?.options.filters?.[1], ["name", ">", "ROW-002404"]);
});

Deno.test("listPages - a short server-capped page does not truncate the read", async () => {
  const { client, calls } = fixture(rows(83), 20);
  assertEquals(await consume(client), 83);
  assertEquals(calls.length, 6);
  assertEquals(calls.at(-1)?.options.filters, [["name", ">", "ROW-000082"]]);
});

Deno.test("listPages - small resolver probes continue through clamped pages and can stop early", async () => {
  const { client, calls } = fixture(rows(8), 1);
  const candidates: FrappeDoc[] = [];
  for await (
    const page of listPages(client, "Customer", { fields: ["name"] }, {
      pageSize: 2,
    })
  ) {
    candidates.push(...page);
    if (candidates.length >= 2) break;
  }
  assertEquals(candidates.map((row) => row.name), ["ROW-000000", "ROW-000001"]);
  assertEquals(calls.length, 2);
  assertEquals(calls.map((call) => call.options.limit), [2, 2]);
  assertEquals(calls[1].options.filters, [["name", ">", "ROW-000000"]]);
});

Deno.test("listPages - page sizes outside the bounded integer range fail before a request", async () => {
  for (const pageSize of [0, -1, 1.5, 201, Infinity, NaN]) {
    const { client, calls } = fixture(rows(1));
    await assertRejects(
      async () => {
        for await (
          const _page of listPages(client, "Customer", {}, { pageSize })
        ) {
          throw new Error("No page should be yielded");
        }
      },
      FrappePaginationError,
      "Page size",
    );
    assertEquals(calls.length, 0);
  }
});

Deno.test("listPages - empty data ends after one fresh request", async () => {
  const { client, calls } = fixture([]);
  assertEquals(await consume(client), 0);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].options.fields, ["name"]);
  assertEquals(calls[0].options.parent, undefined);
});

Deno.test("listAll - collects every page and retains the cursor identity for aggregate consumers", async () => {
  const data = rows(1250);
  const { client, calls } = fixture(data, 50);
  const result = await listAll(client, "Sales Order Item", {
    parent: "Sales Order",
    fields: ["amount"],
    filters: [["docstatus", "=", 1]],
  });
  assertEquals(result, data);
  assertEquals(calls.length, 26);
  assertEquals(calls[0].options.fields, ["name", "amount"]);
  assertEquals(calls.at(-1)?.options.parent, "Sales Order");
  assertEquals(calls.at(-1)?.options.filters, [
    ["docstatus", "=", 1],
    ["name", ">", "ROW-001249"],
  ]);
});

Deno.test("listAll - a later page failure rejects instead of exposing a partial collection", async () => {
  const denied = new FrappeAPIError("Insufficient Permission", 403, null);
  let call = 0;
  const client = {
    list: async () => {
      if (call++ === 0) return rows(200);
      throw denied;
    },
  } as unknown as FrappeClient;
  const error = await assertRejects(
    () => listAll(client, "Bin"),
    FrappeAPIError,
  );
  assertStrictEquals(error, denied);
});

Deno.test("listAll - respects a shared deadline before starting the next population", async () => {
  const { client, calls } = fixture(rows(1));
  await assertRejects(
    () => listAll(client, "Bin", {}, { deadlineMs: 0 }),
    FrappePaginationError,
  );
  assertEquals(calls.length, 0);
});

Deno.test("listPages - a server that ignores the cursor cannot return a partial aggregate", async () => {
  let calls = 0;
  const client = {
    list: async () => {
      calls++;
      return rows(20);
    },
  } as unknown as FrappeClient;
  const error = await assertRejects(
    () => consume(client),
    FrappePaginationError,
  );
  assertEquals(error.code, "PAGINATION_INCOMPLETE");
  assertEquals(calls, 2);
});

Deno.test("listPages - missing and repeated names reject the whole page before yielding", async () => {
  for (
    const data of [
      [{ amount: 1 }],
      [{ name: "" }],
      [{ name: " \t" }],
      [{ name: "A" }, { name: "A" }],
    ]
  ) {
    let yielded = false;
    const client = { list: async () => data } as unknown as FrappeClient;
    await assertRejects(async () => {
      for await (const _page of listPages(client, "Bin")) yielded = true;
    }, FrappePaginationError);
    assertEquals(yielded, false);
  }
});

Deno.test("listPages - detects a cycle across non-adjacent pages", async () => {
  let call = 0;
  const pages = [[{ name: "A" }], [{ name: "B" }], [{ name: "A" }]];
  const client = { list: async () => pages[call++] } as unknown as FrappeClient;
  await assertRejects(() => consume(client), FrappePaginationError);
  assertEquals(call, 3);
});

Deno.test("listPages - exact names follow SQL order without JavaScript collation assumptions", async () => {
  const data = [{ name: "z" }, { name: "é" }, { name: " A " }];
  const { client, calls } = fixture(data, 1);
  assertEquals(await consume(client), 3);
  assertEquals(calls.at(-1)?.options.filters, [["name", ">", " A "]]);
});

Deno.test("listPages - rejects oversized or malformed pages", async () => {
  for (const data of [rows(201), { name: "A" }, null]) {
    const client = { list: async () => data } as unknown as FrappeClient;
    await assertRejects(() => consume(client), FrappePaginationError);
  }
});

Deno.test("listPages - preserves a later Frappe permission error instead of returning partial totals", async () => {
  const denied = new FrappeAPIError("Insufficient Permission", 403, null);
  let call = 0;
  const client = {
    list: async () => {
      if (call++ === 0) return rows(20);
      throw denied;
    },
  } as unknown as FrappeClient;
  const error = await assertRejects(() => consume(client), FrappeAPIError);
  assertStrictEquals(error, denied);
});

Deno.test("listPages - an expired shared deadline prevents another network request", async () => {
  const { client, calls } = fixture(rows(1));
  await assertRejects(
    async () => {
      for await (
        const _page of listPages(client, "Bin", {}, { deadlineMs: 0 })
      ) {
        throw new Error("No page should be yielded");
      }
    },
    FrappePaginationError,
    "deadline",
  );
  assertEquals(calls.length, 0);
});

Deno.test("listPages - a request completing after the deadline cannot contribute a page", async () => {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  let yielded = 0;
  const client = {
    list: async () => {
      now += 100;
      return [{ name: String(now) }];
    },
  } as unknown as FrappeClient;
  try {
    await assertRejects(
      async () => {
        for await (
          const _page of listPages(client, "Bin", {}, { deadlineMs: 1150 })
        ) {
          yielded++;
        }
      },
      FrappePaginationError,
      "deadline",
    );
    assertEquals(yielded, 1);
  } finally {
    Date.now = originalNow;
  }
});
