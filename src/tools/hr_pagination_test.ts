import { assert, assertEquals, assertRejects } from "@std/assert";
import { FrappeAPIError, type FrappeClient } from "../api/frappe-client.ts";
import type { FrappeDoc, FrappeListOptions } from "../api/types.ts";
import { hrTools } from "./hr.ts";

const leaveBalance = hrTools.find((tool) =>
  tool.name === "erpnext_leave_balance"
)!;

Deno.test("leave balance includes every submitted allocation beyond the first server page", async () => {
  const allocations: FrappeDoc[] = Array.from({ length: 123 }, (_, index) => ({
    name: `ALLOC-${String(index).padStart(4, "0")}`,
    employee: "EMP-001",
    docstatus: 1,
    leave_type: index % 2 === 0 ? "Sick Leave" : "Annual Leave",
    total_leaves_allocated: index + 1,
    new_leaves_allocated: 1,
    from_date: "2026-01-01",
    to_date: "2026-12-31",
  }));
  const unrelated: FrappeDoc[] = [
    { ...allocations[0], name: "ALLOC-0200", employee: "EMP-002" },
    { ...allocations[0], name: "ALLOC-0201", docstatus: 2 },
  ];
  const requests: FrappeListOptions[] = [];
  const client = {
    get: async (doctype: string, name: string) => {
      assertEquals(doctype, "Employee");
      assertEquals(name, "EMP-001");
      return { name };
    },
    list: async (
      doctype: string,
      options: FrappeListOptions,
      cacheOptions: { skipCache?: boolean },
    ) => {
      assertEquals(doctype, "Leave Allocation");
      assertEquals(cacheOptions, { skipCache: true });
      assertEquals(options.order_by, "name asc");
      assert((options.limit ?? 0) > 0);
      assertEquals(options.filters?.slice(0, 2), [
        ["employee", "=", "EMP-001"],
        ["docstatus", "=", 1],
      ]);
      assertEquals(options.fields, [
        "name",
        "leave_type",
        "total_leaves_allocated",
        "new_leaves_allocated",
        "from_date",
        "to_date",
      ]);
      requests.push(options);
      return [...allocations, ...unrelated].filter((row) =>
        options.filters?.every(([field, operator, value]) =>
          operator === ">"
            ? String(row[field]) > String(value)
            : row[field] === value
        )
      ).slice(0, Math.min(options.limit ?? 20, 37));
    },
  } as unknown as FrappeClient;

  const result = await leaveBalance.handler({ employee: "EMP-001" }, {
    client,
  }) as {
    count: number;
    employee: string;
    data: FrappeDoc[];
  };

  assertEquals(result.count, 123);
  assertEquals(result.employee, "EMP-001");
  assertEquals(
    result.data.map((row) => row.name),
    [
      ...allocations.filter((row) => row.leave_type === "Annual Leave"),
      ...allocations.filter((row) => row.leave_type === "Sick Leave"),
    ].map((row) => row.name),
  );
  assertEquals(requests.length, 5);
  assertEquals(requests.at(-1)?.filters?.at(-1), ["name", ">", "ALLOC-0122"]);
});

Deno.test("leave balance propagates a later-page failure instead of returning partial allocations", async () => {
  let pages = 0;
  const client = {
    get: async () => ({ name: "EMP-001" }),
    list: async () => {
      if (++pages === 1) {
        return [{ name: "ALLOC-0001", leave_type: "Annual Leave" }];
      }
      throw new FrappeAPIError("Allocation read denied", 403, null);
    },
  } as unknown as FrappeClient;

  await assertRejects(
    () => leaveBalance.handler({ employee: "EMP-001" }, { client }),
    FrappeAPIError,
    "Allocation read denied",
  );
  assertEquals(pages, 2);
});
