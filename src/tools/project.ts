/**
 * ERPNext Project Tools
 *
 * MCP tools for project management: projects, tasks, timesheets.
 *
 * @module lib/erpnext/tools/project
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";
import { DOCLIST_META } from "./viewer-meta.ts";
import {
  applyAssignment,
  ASSIGNMENT_INPUT_PROPERTIES,
  fetchDocAfterAssignment,
  prepareAssignment,
  validateAssignees,
} from "./assignment.ts";

export const projectTools: ErpNextTool[] = [
  // ── Projects ──────────────────────────────────────────────────────────────

  {
    name: "erpnext_project_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description: "List Projects. Filterable by status. " +
      "Fields: name, project_name, status, percent_complete, expected_start_date, " +
      "expected_end_date, estimated_costing.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        status: {
          type: "string",
          description: "Filter by status (Open, Completed, Cancelled)",
          enum: ["Open", "Completed", "Cancelled"],
        },
        company: { type: "string", description: "Filter by company" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.company) {
        filters.push(["company", "=", input.company as string]);
      }

      const docs = await ctx.client.list("Project", {
        fields: [
          "name",
          "project_name",
          "status",
          "percent_complete",
          "expected_start_date",
          "expected_end_date",
          "estimated_costing",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Project",
        count: docs.length,
        data: docs,
        _meta: DOCLIST_META,
      };
    },
  },

  {
    name: "erpnext_project_get",
    annotations: { readOnlyHint: true },
    description:
      "Get a single Project by name. Returns full document including tasks summary.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_project_get] 'name' is required");
      }
      const doc = await ctx.client.get("Project", input.name as string);
      return { data: doc };
    },
  },

  // ── Tasks ─────────────────────────────────────────────────────────────────

  {
    name: "erpnext_task_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description: "List Tasks. Filterable by project, status, priority. " +
      "Fields: name, subject, project, status, priority, exp_start_date, exp_end_date, progress.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        project: { type: "string", description: "Filter by project name" },
        status: {
          type: "string",
          description:
            "Filter by status (Open, Working, Pending Review, Overdue, Completed, Cancelled)",
        },
        priority: {
          type: "string",
          description: "Filter by priority (Low, Medium, High, Urgent)",
          enum: ["Low", "Medium", "High", "Urgent"],
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.project) {
        filters.push(["project", "=", input.project as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.priority) {
        filters.push(["priority", "=", input.priority as string]);
      }

      const docs = await ctx.client.list("Task", {
        fields: [
          "name",
          "subject",
          "project",
          "status",
          "priority",
          "exp_start_date",
          "exp_end_date",
          "progress",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Task",
        count: docs.length,
        data: docs,
        _meta: DOCLIST_META,
      };
    },
  },

  {
    name: "erpnext_task_create",
    description:
      "Create a new Task in a project. Requires project and subject. " +
      "Dates in YYYY-MM-DD format. Use assign_to for Frappe's native assignment workflow; native notifications are sent to assigned users.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name" },
        subject: { type: "string", description: "Task subject/title" },
        status: {
          type: "string",
          description: "Task status (default: Open)",
          enum: [
            "Open",
            "Working",
            "Pending Review",
            "Overdue",
            "Completed",
            "Cancelled",
          ],
        },
        priority: {
          type: "string",
          description: "Task priority (default: Medium)",
          enum: ["Low", "Medium", "High", "Urgent"],
        },
        exp_start_date: {
          type: "string",
          description: "Expected start date YYYY-MM-DD",
        },
        exp_end_date: {
          type: "string",
          description: "Expected end date YYYY-MM-DD",
        },
        ...ASSIGNMENT_INPUT_PROPERTIES,
      },
      required: ["project", "subject"],
    },
    handler: async (input, ctx) => {
      if (!input.project) {
        throw new Error("[erpnext_task_create] 'project' is required");
      }
      if (!input.subject) {
        throw new Error("[erpnext_task_create] 'subject' is required");
      }

      const assignment = prepareAssignment(input, "erpnext_task_create");
      if (assignment) {
        await validateAssignees(
          assignment.assignees,
          "erpnext_task_create",
          ctx,
        );
      }

      const data: Record<string, unknown> = {
        project: input.project as string,
        subject: input.subject as string,
      };
      if (input.status) data.status = input.status as string;
      if (input.priority) data.priority = input.priority as string;
      if (input.exp_start_date) {
        data.exp_start_date = input.exp_start_date as string;
      }
      if (input.exp_end_date) data.exp_end_date = input.exp_end_date as string;

      const doc = await ctx.client.create("Task", data);
      if (!assignment) {
        return {
          data: doc,
          message: `Task ${doc.name} created successfully`,
        };
      }

      const assignmentInfo = await applyAssignment(
        "Task",
        doc.name as string,
        assignment,
        ctx,
        `[erpnext_task_create] Task ${doc.name} was created, but assignment failed`,
      );
      const freshDoc = await fetchDocAfterAssignment(
        "Task",
        doc.name as string,
        ctx,
        "erpnext_task_create",
      );
      return {
        data: freshDoc,
        message: `Task ${doc.name} created successfully`,
        assignment: assignmentInfo,
      };
    },
  },

  {
    name: "erpnext_task_get",
    annotations: { readOnlyHint: true },
    description:
      "Get a single Task by name. Returns full document including description and dependencies.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name (e.g. TASK-00001)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_task_get] 'name' is required");
      }
      const doc = await ctx.client.get("Task", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_task_update",
    description:
      "Update an existing Task. Pass only the fields you want to change. " +
      "Commonly used to change status, progress, or dates. Use assign_to for Frappe's native assignment workflow; native notifications are sent to assigned users.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name (e.g. TASK-00001)" },
        status: {
          type: "string",
          description: "New status",
          enum: [
            "Open",
            "Working",
            "Pending Review",
            "Overdue",
            "Completed",
            "Cancelled",
          ],
        },
        priority: {
          type: "string",
          description: "New priority",
          enum: ["Low", "Medium", "High", "Urgent"],
        },
        progress: {
          type: "number",
          description: "Completion percentage (0-100)",
        },
        exp_end_date: {
          type: "string",
          description: "New expected end date YYYY-MM-DD",
        },
        description: { type: "string", description: "New task description" },
        ...ASSIGNMENT_INPUT_PROPERTIES,
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_task_update] 'name' is required");
      }

      const assignment = prepareAssignment(input, "erpnext_task_update");
      if (assignment) {
        await validateAssignees(
          assignment.assignees,
          "erpnext_task_update",
          ctx,
        );
      }

      const data: Record<string, unknown> = {};
      for (
        const key of [
          "status",
          "priority",
          "progress",
          "exp_end_date",
          "description",
        ]
      ) {
        if (input[key] !== undefined) data[key] = input[key];
      }

      if (Object.keys(data).length === 0 && !assignment) {
        throw new Error(
          "[erpnext_task_update] At least one field to update is required",
        );
      }

      const name = input.name as string;
      if (!assignment) {
        const doc = await ctx.client.update("Task", name, data);
        return {
          data: doc,
          message: `Task ${name} updated successfully`,
        };
      }

      const fieldsUpdated = Object.keys(data).length > 0;
      if (fieldsUpdated) {
        await ctx.client.update("Task", name, data);
      }
      const failureContext = fieldsUpdated
        ? `[erpnext_task_update] Task ${name} was updated, but assignment failed`
        : `[erpnext_task_update] Task ${name} assignment failed`;
      const assignmentInfo = await applyAssignment(
        "Task",
        name,
        assignment,
        ctx,
        failureContext,
      );
      const freshDoc = await fetchDocAfterAssignment(
        "Task",
        name,
        ctx,
        "erpnext_task_update",
      );
      return {
        data: freshDoc,
        message: `Task ${name} updated successfully`,
        assignment: assignmentInfo,
      };
    },
  },

  // ── Timesheets ────────────────────────────────────────────────────────────

  {
    name: "erpnext_timesheet_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description: "List Timesheets. Filterable by employee, project. " +
      "Fields: name, employee, start_date, end_date, status, total_hours.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        employee: { type: "string", description: "Filter by employee ID" },
        project: { type: "string", description: "Filter by project name" },
        status: {
          type: "string",
          description: "Filter by status (Draft, Submitted, Cancelled)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.employee) {
        filters.push(["employee", "=", input.employee as string]);
      }
      if (input.project) {
        filters.push(["project", "=", input.project as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }

      const docs = await ctx.client.list("Timesheet", {
        fields: [
          "name",
          "employee",
          "start_date",
          "end_date",
          "status",
          "total_hours",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Timesheet",
        count: docs.length,
        data: docs,
        _meta: DOCLIST_META,
      };
    },
  },

  {
    name: "erpnext_timesheet_get",
    annotations: { readOnlyHint: true },
    description:
      "Get a single Timesheet by name. Returns full document with time log details.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Timesheet name" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_timesheet_get] 'name' is required");
      }
      const doc = await ctx.client.get("Timesheet", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_project_create",
    description:
      "Create a new Project. Requires project_name. Optionally set expected_start_date and expected_end_date.",
    category: "project",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Project name" },
        status: {
          type: "string",
          description: "Initial status (default: Open)",
          enum: ["Open", "Completed", "Cancelled"],
        },
        expected_start_date: {
          type: "string",
          description: "Expected start date YYYY-MM-DD",
        },
        expected_end_date: {
          type: "string",
          description: "Expected end date YYYY-MM-DD",
        },
        estimated_costing: {
          type: "number",
          description: "Budget estimate",
        },
        company: { type: "string", description: "Company name" },
      },
      required: ["project_name"],
    },
    handler: async (input, ctx) => {
      if (!input.project_name) {
        throw new Error("[erpnext_project_create] 'project_name' is required");
      }

      const data: Record<string, unknown> = {
        project_name: input.project_name as string,
      };
      if (input.status) data.status = input.status as string;
      if (input.expected_start_date) {
        data.expected_start_date = input.expected_start_date as string;
      }
      if (input.expected_end_date) {
        data.expected_end_date = input.expected_end_date as string;
      }
      if (input.estimated_costing !== undefined) {
        data.estimated_costing = input.estimated_costing;
      }
      if (input.company) data.company = input.company as string;

      const doc = await ctx.client.create("Project", data);
      return {
        data: doc,
        message: `Project ${doc.name} created successfully`,
      };
    },
  },
];
