/**
 * ERPNext Generic Operations Tools
 *
 * MCP tools for generic DocType operations: update, delete, submit, cancel.
 * These tools work on any ERPNext DocType, complementing the typed tools
 * in sales.ts, accounting.ts, inventory.ts, hr.ts, project.ts.
 *
 * @module lib/erpnext/tools/operations
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const operationsTools: ErpNextTool[] = [
  // ── Generic Create ──────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_create",
    description:
      "Create any ERPNext document. Works on any DocType including master data " +
      "(Company, Item Group, UOM, Territory, Customer Group, Supplier Group, Warehouse Type, etc.). " +
      "For DocTypes with 'Prompt' naming, include a 'name' field in data. Returns the created document.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "ERPNext DocType name (e.g. 'Company', 'Item Group', 'Warehouse Type')",
        },
        data: {
          type: "object",
          description:
            "Document fields as key-value pairs. Include 'name' for DocTypes with Prompt naming.",
          additionalProperties: true,
        },
      },
      required: ["doctype", "data"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_create] 'doctype' is required");
      }
      if (!input.data || typeof input.data !== "object") {
        throw new Error("[erpnext_doc_create] 'data' must be an object with document fields");
      }

      const doc = await ctx.client.create(
        input.doctype as string,
        input.data as Record<string, unknown>,
      );

      return {
        data: doc,
        message: `${input.doctype} ${doc.name} created successfully`,
      };
    },
  },

  // ── Generic Update ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_update",
    description:
      "Update any ERPNext document (partial update). Works on any DocType. " +
      "Pass doctype (e.g. 'Customer', 'Sales Order'), the document name, and the fields to change. " +
      "Returns the updated document.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "ERPNext DocType name (e.g. 'Customer', 'Sales Order', 'Item')",
        },
        name: {
          type: "string",
          description: "Document name/ID (e.g. 'CUST-00001', 'SO-00001')",
        },
        data: {
          type: "object",
          description:
            "Fields to update as key-value pairs. Only provided fields will be changed.",
          additionalProperties: true,
        },
      },
      required: ["doctype", "name", "data"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_update] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_update] 'name' is required");
      }
      if (!input.data || typeof input.data !== "object") {
        throw new Error("[erpnext_doc_update] 'data' must be an object with fields to update");
      }

      const doc = await ctx.client.update(
        input.doctype as string,
        input.name as string,
        input.data as Record<string, unknown>,
      );

      return {
        data: doc,
        message: `${input.doctype} ${input.name} updated successfully`,
      };
    },
  },

  // ── Generic Delete ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_delete",
    description:
      "Delete any ERPNext document. Only Draft documents can usually be deleted. " +
      "For submitted documents, use cancel first. Works on any DocType.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "ERPNext DocType name (e.g. 'Customer', 'Sales Order')",
        },
        name: {
          type: "string",
          description: "Document name/ID to delete",
        },
      },
      required: ["doctype", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_delete] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_delete] 'name' is required");
      }

      await ctx.client.delete(input.doctype as string, input.name as string);

      return {
        message: `${input.doctype} ${input.name} deleted successfully`,
        deleted: true,
        doctype: input.doctype,
        name: input.name,
      };
    },
  },

  // ── Generic Submit ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_submit",
    description:
      "Submit any ERPNext document (changes status from Draft to Submitted). " +
      "Applies to submittable DocTypes like Sales Order, Purchase Order, Sales Invoice, etc. " +
      "Calls frappe.client.submit via the Frappe method API.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description:
            "ERPNext DocType name (e.g. 'Sales Order', 'Purchase Invoice', 'Timesheet')",
        },
        name: {
          type: "string",
          description: "Document name/ID to submit (e.g. 'SO-00001')",
        },
      },
      required: ["doctype", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_submit] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_submit] 'name' is required");
      }

      // Fetch fresh doc first — frappe.client.submit requires `modified` for optimistic locking
      const doc = await ctx.client.get(input.doctype as string, input.name as string);
      const result = await ctx.client.callMethod("frappe.client.submit", {
        doc: { ...doc, doctype: input.doctype as string },
      });

      return {
        data: result,
        message: `${input.doctype} ${input.name} submitted successfully`,
        doctype: input.doctype,
        name: input.name,
      };
    },
  },

  // ── Generic Cancel ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_cancel",
    description:
      "Cancel any ERPNext submitted document (changes status to Cancelled). " +
      "Applies to submittable DocTypes like Sales Order, Purchase Order, Sales Invoice, etc. " +
      "Calls frappe.client.cancel via the Frappe method API.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description:
            "ERPNext DocType name (e.g. 'Sales Order', 'Purchase Invoice', 'Timesheet')",
        },
        name: {
          type: "string",
          description: "Document name/ID to cancel (e.g. 'SO-00001')",
        },
      },
      required: ["doctype", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_cancel] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_cancel] 'name' is required");
      }

      const result = await ctx.client.callMethod("frappe.client.cancel", {
        doctype: input.doctype as string,
        name: input.name as string,
      });

      return {
        data: result,
        message: `${input.doctype} ${input.name} cancelled successfully`,
        doctype: input.doctype,
        name: input.name,
      };
    },
  },

  // ── Generic Get ───────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_get",
    description:
      "Get any ERPNext document by DocType and name. Useful for DocTypes not covered " +
      "by dedicated tools. Returns the full document with all fields.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "ERPNext DocType name (e.g. 'Lead', 'Asset', 'BOM')",
        },
        name: {
          type: "string",
          description: "Document name/ID",
        },
      },
      required: ["doctype", "name"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_get] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_get] 'name' is required");
      }

      const doc = await ctx.client.get(input.doctype as string, input.name as string);
      return { data: doc };
    },
  },

  // ── Generic List ──────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List any ERPNext documents by DocType. Useful for DocTypes not covered " +
      "by dedicated tools. Supports field selection, filters (as JSON array), and limit.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description: "ERPNext DocType name (e.g. 'Lead', 'Asset', 'BOM', 'Cost Center')",
        },
        fields: {
          type: "array",
          description:
            "Fields to fetch (default: ['name', 'modified']). Use ['*'] for all fields.",
          items: { type: "string" },
        },
        filters: {
          type: "array",
          description:
            "Frappe filters as array of [fieldname, operator, value] tuples. " +
            "Example: [[\"status\",\"=\",\"Open\"],[\"company\",\"=\",\"Acme\"]]",
          items: { type: "array" },
        },
        limit: { type: "number", description: "Max results (default 20)" },
        order_by: {
          type: "string",
          description: "Order by clause (e.g. 'modified desc', 'name asc')",
        },
      },
      required: ["doctype"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_list] 'doctype' is required");
      }

      const limit = (input.limit as number) ?? 20;
      const fields = (input.fields as string[]) ?? ["name", "modified"];
      const filters = (input.filters as FrappeFilter[]) ?? [];
      const order_by = (input.order_by as string) ?? "modified desc";

      const docs = await ctx.client.list(input.doctype as string, {
        fields,
        filters,
        limit,
        order_by,
      });

      return {
        doctype: input.doctype as string,
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },
];
