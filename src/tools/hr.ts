/**
 * ERPNext HR Tools
 *
 * MCP tools for human resources: employees, attendance, leave applications.
 *
 * @module lib/erpnext/tools/hr
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const hrTools: ErpNextTool[] = [
  // ── Employees ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_employee_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Employees. Filterable by department, status. " +
      "Fields: name, employee_name, designation, department, company, status, date_of_joining.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        department: { type: "string", description: "Filter by department" },
        status: {
          type: "string",
          description: "Filter by status (Active, Inactive, Suspended, Left)",
          enum: ["Active", "Inactive", "Suspended", "Left"],
        },
        company: { type: "string", description: "Filter by company" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.department) {
        filters.push(["department", "=", input.department as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.company) {
        filters.push(["company", "=", input.company as string]);
      }

      const docs = await ctx.client.list("Employee", {
        fields: [
          "name",
          "employee_name",
          "designation",
          "department",
          "company",
          "status",
          "date_of_joining",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Employee",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_employee_get",
    description:
      "Get a single Employee by name/ID (e.g. HR-EMP-00001). Returns all fields.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Employee ID (e.g. HR-EMP-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_employee_get] 'name' is required");
      }
      const doc = await ctx.client.get("Employee", input.name as string);
      return { data: doc };
    },
  },

  // ── Attendance ────────────────────────────────────────────────────────────

  {
    name: "erpnext_attendance_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Attendance records. Filterable by employee, date range. " +
      "Fields: name, employee, employee_name, attendance_date, status.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        employee: { type: "string", description: "Filter by employee ID" },
        status: {
          type: "string",
          description: "Filter by status (Present, Absent, Half Day, On Leave)",
          enum: ["Present", "Absent", "Half Day", "On Leave"],
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.employee) {
        filters.push(["employee", "=", input.employee as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["attendance_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["attendance_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Attendance", {
        fields: ["name", "employee", "employee_name", "attendance_date", "status"],
        filters,
        limit,
        order_by: "attendance_date desc",
      });

      return {
        doctype: "Attendance",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  // ── Leave Applications ────────────────────────────────────────────────────

  {
    name: "erpnext_leave_application_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Leave Applications. Filterable by employee, status, leave_type. " +
      "Fields: name, employee, employee_name, leave_type, from_date, to_date, status.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        employee: { type: "string", description: "Filter by employee ID" },
        status: {
          type: "string",
          description: "Filter by status (Open, Approved, Rejected, Cancelled)",
          enum: ["Open", "Approved", "Rejected", "Cancelled"],
        },
        leave_type: { type: "string", description: "Filter by leave type (e.g. Sick Leave)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.employee) {
        filters.push(["employee", "=", input.employee as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.leave_type) {
        filters.push(["leave_type", "=", input.leave_type as string]);
      }

      const docs = await ctx.client.list("Leave Application", {
        fields: [
          "name",
          "employee",
          "employee_name",
          "leave_type",
          "from_date",
          "to_date",
          "status",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Leave Application",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_leave_application_get",
    description:
      "Get a single Leave Application by name. Returns full document.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Leave Application name" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_leave_application_get] 'name' is required");
      }
      const doc = await ctx.client.get("Leave Application", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_leave_application_create",
    description:
      "Create a new Leave Application. Requires employee, leave_type, from_date, to_date. " +
      "Dates in YYYY-MM-DD format.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        employee: { type: "string", description: "Employee ID (e.g. HR-EMP-00001)" },
        leave_type: { type: "string", description: "Leave type (e.g. Sick Leave, Casual Leave)" },
        from_date: { type: "string", description: "Start date YYYY-MM-DD" },
        to_date: { type: "string", description: "End date YYYY-MM-DD" },
        reason: { type: "string", description: "Reason for leave (optional)" },
      },
      required: ["employee", "leave_type", "from_date", "to_date"],
    },
    handler: async (input, ctx) => {
      if (!input.employee) {
        throw new Error("[erpnext_leave_application_create] 'employee' is required");
      }
      if (!input.leave_type) {
        throw new Error("[erpnext_leave_application_create] 'leave_type' is required");
      }
      if (!input.from_date) {
        throw new Error("[erpnext_leave_application_create] 'from_date' is required");
      }
      if (!input.to_date) {
        throw new Error("[erpnext_leave_application_create] 'to_date' is required");
      }

      const data: Record<string, unknown> = {
        employee: input.employee as string,
        leave_type: input.leave_type as string,
        from_date: input.from_date as string,
        to_date: input.to_date as string,
      };
      if (input.reason) {
        data.reason = input.reason as string;
      }

      const doc = await ctx.client.create("Leave Application", data);
      return {
        data: doc,
        message: `Leave Application ${doc.name} created successfully`,
      };
    },
  },

  // ── Salary Slips ──────────────────────────────────────────────────────────

  {
    name: "erpnext_salary_slip_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Salary Slips. Filterable by employee, status, date range. " +
      "Fields: name, employee, employee_name, posting_date, start_date, end_date, gross_pay, net_pay, status.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        employee: { type: "string", description: "Filter by employee ID" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Cancelled)",
          enum: ["Draft", "Submitted", "Cancelled"],
        },
        date_from: { type: "string", description: "Start date filter YYYY-MM-DD (posting_date >=)" },
        date_to: { type: "string", description: "End date filter YYYY-MM-DD (posting_date <=)" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.employee) {
        filters.push(["employee", "=", input.employee as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.date_from) {
        filters.push(["posting_date", ">=", input.date_from as string]);
      }
      if (input.date_to) {
        filters.push(["posting_date", "<=", input.date_to as string]);
      }

      const docs = await ctx.client.list("Salary Slip", {
        fields: [
          "name",
          "employee",
          "employee_name",
          "posting_date",
          "start_date",
          "end_date",
          "gross_pay",
          "net_pay",
          "status",
        ],
        filters,
        limit,
        order_by: "posting_date desc",
      });

      return {
        doctype: "Salary Slip",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_salary_slip_get",
    description:
      "Get a single Salary Slip by name/ID. Returns all fields including earnings and deductions.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Salary Slip ID (e.g. Salary Slip/HR-EMP-00001/00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_salary_slip_get] 'name' is required");
      }
      const doc = await ctx.client.get("Salary Slip", input.name as string);
      return { data: doc };
    },
  },

  // ── Payroll Entries ───────────────────────────────────────────────────────

  {
    name: "erpnext_payroll_entry_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Payroll Entries. Filterable by company, status. " +
      "Fields: name, company, posting_date, payroll_frequency, status.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        company: { type: "string", description: "Filter by company" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Cancelled)",
          enum: ["Draft", "Submitted", "Cancelled"],
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.company) {
        filters.push(["company", "=", input.company as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }

      const docs = await ctx.client.list("Payroll Entry", {
        fields: ["name", "company", "posting_date", "payroll_frequency", "status"],
        filters,
        limit,
        order_by: "posting_date desc",
      });

      return {
        doctype: "Payroll Entry",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  // ── Expense Claims ────────────────────────────────────────────────────────

  {
    name: "erpnext_expense_claim_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Expense Claims. Filterable by employee, status, approval_status. " +
      "Fields: name, employee, employee_name, posting_date, total_claimed_amount, status, approval_status.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        employee: { type: "string", description: "Filter by employee ID" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Cancelled)",
          enum: ["Draft", "Submitted", "Cancelled"],
        },
        approval_status: {
          type: "string",
          description: "Filter by approval status (Pending, Approved, Rejected)",
          enum: ["Pending", "Approved", "Rejected"],
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.employee) {
        filters.push(["employee", "=", input.employee as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.approval_status) {
        filters.push(["approval_status", "=", input.approval_status as string]);
      }

      const docs = await ctx.client.list("Expense Claim", {
        fields: [
          "name",
          "employee",
          "employee_name",
          "posting_date",
          "total_claimed_amount",
          "status",
          "approval_status",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Expense Claim",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_expense_claim_create",
    description:
      "Create a new Expense Claim. Requires employee and expenses array. " +
      "Each expense item maps to the Expense Claim Detail child table.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        employee: { type: "string", description: "Employee ID (e.g. HR-EMP-00001)" },
        expenses: {
          type: "array",
          description: "List of expense line items",
          items: {
            type: "object",
            properties: {
              expense_type: { type: "string", description: "Expense type (e.g. Travel, Food)" },
              amount: { type: "number", description: "Claimed amount" },
              description: { type: "string", description: "Description of the expense (optional)" },
            },
            required: ["expense_type", "amount"],
          },
        },
        posting_date: { type: "string", description: "Posting date YYYY-MM-DD (optional, defaults to today)" },
      },
      required: ["employee", "expenses"],
    },
    handler: async (input, ctx) => {
      if (!input.employee) {
        throw new Error("[erpnext_expense_claim_create] 'employee' is required");
      }
      if (!input.expenses || !Array.isArray(input.expenses) || (input.expenses as unknown[]).length === 0) {
        throw new Error("[erpnext_expense_claim_create] 'expenses' is required and must be a non-empty array");
      }

      const expenses = input.expenses as Array<{ expense_type: string; amount: number; description?: string }>;

      const data: Record<string, unknown> = {
        employee: input.employee as string,
        expenses: expenses.map((e) => ({
          expense_type: e.expense_type,
          amount: e.amount,
          description: e.description ?? "",
        })),
      };
      if (input.posting_date) {
        data.posting_date = input.posting_date as string;
      }

      const doc = await ctx.client.create("Expense Claim", data);
      return {
        data: doc,
        message: `Expense Claim ${doc.name} created successfully`,
      };
    },
  },

  // ── Leave Balance ─────────────────────────────────────────────────────────

  {
    name: "erpnext_leave_balance",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "Get leave balance (allocations) for an employee. " +
      "Returns Leave Allocations with leave_type, total_leaves_allocated, new_leaves_allocated.",
    category: "hr",
    inputSchema: {
      type: "object",
      properties: {
        employee: { type: "string", description: "Employee ID (e.g. HR-EMP-00001)" },
      },
      required: ["employee"],
    },
    handler: async (input, ctx) => {
      if (!input.employee) {
        throw new Error("[erpnext_leave_balance] 'employee' is required");
      }

      const filters: FrappeFilter[] = [
        ["employee", "=", input.employee as string],
        ["docstatus", "=", 1],
      ];

      const docs = await ctx.client.list("Leave Allocation", {
        fields: ["name", "leave_type", "total_leaves_allocated", "new_leaves_allocated", "from_date", "to_date"],
        filters,
        limit: 50,
        order_by: "leave_type asc",
      });

      return {
        doctype: "Leave Allocation",
        employee: input.employee as string,
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },
];
