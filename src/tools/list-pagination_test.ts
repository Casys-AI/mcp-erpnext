import { assert, assertEquals, assertRejects } from "@std/assert";
import type { FrappeClient } from "../api/frappe-client.ts";
import type { FrappeDoc, FrappeListOptions } from "../api/types.ts";
import { allTools } from "./mod.ts";

// Public list pages must remain bounded and resumable across every category.
const CASES: [name: string, defaultLimit: number, orderBy: string][] = [
  ["erpnext_account_list", 50, "name asc"],
  ["erpnext_asset_category_list", 20, "modified desc, name asc"],
  ["erpnext_asset_list", 20, "modified desc, name asc"],
  ["erpnext_asset_maintenance_list", 20, "modified desc, name asc"],
  ["erpnext_asset_movement_list", 20, "modified desc, name asc"],
  ["erpnext_attendance_list", 20, "attendance_date desc, name asc"],
  ["erpnext_bom_list", 20, "modified desc, name asc"],
  ["erpnext_campaign_list", 20, "modified desc, name asc"],
  ["erpnext_company_list", 20, "modified desc, name asc"],
  ["erpnext_contact_list", 20, "modified desc, name asc"],
  ["erpnext_customer_list", 20, "modified desc, name asc"],
  ["erpnext_delivery_note_list", 20, "modified desc, name asc"],
  ["erpnext_employee_list", 20, "modified desc, name asc"],
  ["erpnext_expense_claim_list", 20, "modified desc, name asc"],
  ["erpnext_file_list", 50, "creation desc, name asc"],
  ["erpnext_item_list", 20, "modified desc, name asc"],
  ["erpnext_job_card_list", 20, "modified desc, name asc"],
  ["erpnext_journal_entry_list", 20, "modified desc, name asc"],
  ["erpnext_lead_list", 20, "modified desc, name asc"],
  ["erpnext_leave_application_list", 20, "modified desc, name asc"],
  ["erpnext_opportunity_list", 20, "modified desc, name asc"],
  ["erpnext_payment_entry_list", 20, "modified desc, name asc"],
  ["erpnext_payroll_entry_list", 20, "posting_date desc, name asc"],
  ["erpnext_project_list", 20, "modified desc, name asc"],
  ["erpnext_purchase_invoice_list", 20, "modified desc, name asc"],
  ["erpnext_purchase_order_list", 20, "modified desc, name asc"],
  ["erpnext_purchase_receipt_list", 20, "modified desc, name asc"],
  ["erpnext_quotation_list", 20, "modified desc, name asc"],
  ["erpnext_salary_slip_list", 20, "posting_date desc, name asc"],
  ["erpnext_sales_invoice_list", 20, "modified desc, name asc"],
  ["erpnext_sales_order_list", 20, "modified desc, name asc"],
  ["erpnext_shipment_list", 20, "modified desc, name asc"],
  ["erpnext_stock_balance", 50, "modified desc, name asc"],
  ["erpnext_stock_entry_list", 20, "modified desc, name asc"],
  ["erpnext_supplier_list", 20, "modified desc, name asc"],
  ["erpnext_supplier_quotation_list", 20, "modified desc, name asc"],
  ["erpnext_task_list", 20, "modified desc, name asc"],
  ["erpnext_timesheet_list", 20, "modified desc, name asc"],
  ["erpnext_user_list", 50, "full_name asc, name asc"],
  ["erpnext_warehouse_list", 20, "modified desc, name asc"],
  ["erpnext_work_order_list", 20, "modified desc, name asc"],
];

Deno.test("dedicated list pagination contract covers every registered list with a limit", () => {
  const dedicatedLists = allTools.filter((tool) =>
    tool.inputSchema.properties?.limit &&
    !["analytics", "buy", "kanban"].includes(tool.category) &&
    tool.name !== "erpnext_doc_list"
  );
  assertEquals(
    CASES.map(([name]) => name).sort(),
    dedicatedLists.map((tool) => tool.name).sort(),
  );
});

function baseInput(name: string): Record<string, unknown> {
  return name === "erpnext_file_list"
    ? { attached_to_doctype: "Sales Order", attached_to_name: "SO-1" }
    : {};
}

const rows: FrappeDoc[] = Array.from({ length: 5 }, (_, i) => ({
  name: `ROW-${i + 1}`,
  modified: "2026-01-01 00:00:00",
  net_purchase_amount: 100,
  file_name: `file-${i + 1}.pdf`,
  file_url: `/files/file-${i + 1}.pdf`,
  is_private: 0,
}));

for (const [name, defaultLimit, orderBy] of CASES) {
  const tool = allTools.find((candidate) => candidate.name === name)!;

  Deno.test(`${name} - public pages preserve defaults and resume without fetching all rows`, async () => {
    assert(tool);
    const properties = tool.inputSchema.properties!;
    assertEquals(properties.limit.type, "integer");
    assertEquals(properties.offset.type, "integer");
    assertEquals(properties.offset.minimum, 0);
    assert(!tool.inputSchema.required?.includes("offset"));

    const calls: FrappeListOptions[] = [];
    const client = {
      list: (_doctype: string, options: FrappeListOptions) => {
        calls.push(options);
        const offset = options.limit_start ?? 0;
        return Promise.resolve(rows.slice(offset, offset + options.limit!));
      },
    } as unknown as FrappeClient;
    await tool.handler(baseInput(name), { client });
    assertEquals(calls.length, 1);
    assertEquals(calls[0].limit, defaultLimit);
    assertEquals("limit_start" in calls[0], false);
    assertEquals(calls[0].order_by, orderBy);

    const pages = [];
    for (const offset of [0, 2]) {
      const result = await tool.handler({
        ...baseInput(name),
        limit: 2,
        offset,
      }, { client }) as {
        count: number;
        data: FrappeDoc[];
      };
      assertEquals(result.count, 2);
      assertEquals(result.data.length, 2);
      pages.push(...result.data.map((row) => row.name));
    }
    assertEquals(pages, ["ROW-1", "ROW-2", "ROW-3", "ROW-4"]);
    assertEquals(calls.length, 3);
    assertEquals(
      calls.slice(1).map((options) => ({
        limit: options.limit,
        offset: options.limit_start,
        order: options.order_by,
      })),
      [
        { limit: 2, offset: 0, order: orderBy },
        { limit: 2, offset: 2, order: orderBy },
      ],
    );
  });

  Deno.test(`${name} - invalid pagination fails before any API request`, async () => {
    let calls = 0;
    const unexpectedCall = () => {
      calls++;
      return Promise.resolve([]);
    };
    const client = {
      list: unexpectedCall,
      get: unexpectedCall,
      callMethod: unexpectedCall,
    } as unknown as FrappeClient;
    const invalidInputs: Record<string, unknown>[] = [
      ...[-1, 0.5, "5", null, Number.MAX_SAFE_INTEGER + 1, NaN].map((
        offset,
      ) => ({ offset })),
      ...[-1, 0.5, "5", Number.MAX_SAFE_INTEGER + 1, NaN].map((limit) => ({
        limit,
      })),
      { limit: 0, offset: 1 },
    ];
    if (name !== "erpnext_stock_entry_list") {
      invalidInputs.push({ limit: null });
    }
    for (const input of invalidInputs) {
      await assertRejects(() =>
        tool.handler({ ...baseInput(name), ...input }, { client })
      );
    }
    assertEquals(calls, 0);
  });

  Deno.test(`${name} - retains its existing all-rows or bounded-limit contract`, async () => {
    const calls: FrappeListOptions[] = [];
    const client = {
      list: (_doctype: string, options: FrappeListOptions) => {
        calls.push(options);
        return Promise.resolve([]);
      },
    } as unknown as FrappeClient;
    if (name === "erpnext_file_list") {
      for (const limit of [0, 501]) {
        await assertRejects(() =>
          tool.handler({ ...baseInput(name), limit }, { client })
        );
      }
      assertEquals(calls.length, 0);
    } else {
      await tool.handler({ limit: 0, offset: 0 }, { client });
      assertEquals(calls[0].limit, 0);
      assertEquals(calls[0].limit_start, 0);
    }
  });
}
