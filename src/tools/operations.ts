/**
 * ERPNext Generic Operations Tools
 *
 * MCP tools for generic DocType operations: update, delete, submit, cancel.
 * These tools work on any ERPNext DocType, complementing the typed tools
 * in sales.ts, accounting.ts, inventory.ts, hr.ts, project.ts.
 *
 * @module lib/erpnext/tools/operations
 */

import type { FrappeFile, FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";
import { DOC_META, DOCLIST_META } from "./viewer-meta.ts";
import {
  roundedTotalFallbackWarning,
  withRoundedTotalFallback,
} from "./submit-helpers.ts";
import {
  applyAssignment,
  ASSIGNMENT_INPUT_PROPERTIES,
  fetchDocAfterAssignment,
  prepareAssignment,
  removeAssignment,
  validateAssignees,
} from "./assignment.ts";
import {
  isMethodAllowed,
  isValidMethodPath,
  loadMethodAllowlist,
} from "./method-allowlist.ts";

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 32 * 1024;
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)),
    );
  }
  return btoa(binary);
}

export const operationsTools: ErpNextTool[] = [
  // ── File Attachments ───────────────────────────────────────────────────────

  {
    name: "erpnext_file_list",
    annotations: { readOnlyHint: true },
    description: "List the files attached to an ERPNext document. " +
      "Returns name, size, privacy and URL for each attachment. " +
      "Pairs with erpnext_file_upload: that one attaches, this one reads back.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        attached_to_doctype: {
          type: "string",
          description: "DocType of the document whose attachments to list.",
          minLength: 1,
        },
        attached_to_name: {
          type: "string",
          description: "Name/ID of the document whose attachments to list.",
          minLength: 1,
        },
        limit: {
          type: "number",
          description: "Maximum number of files to return. Defaults to 50.",
          minimum: 1,
          maximum: 500,
        },
      },
      required: ["attached_to_doctype", "attached_to_name"],
    },
    handler: async (input, ctx) => {
      for (
        const field of ["attached_to_doctype", "attached_to_name"] as const
      ) {
        if (typeof input[field] !== "string" || !input[field].trim()) {
          throw new Error(
            `[erpnext_file_list] '${field}' must be a non-empty string`,
          );
        }
      }
      if (
        input.limit !== undefined &&
        (typeof input.limit !== "number" || !Number.isInteger(input.limit) ||
          input.limit < 1 || input.limit > 500)
      ) {
        throw new Error(
          "[erpnext_file_list] 'limit' must be an integer between 1 and 500",
        );
      }

      // Files always hang off a document in Frappe: the File doctype carries
      // attached_to_doctype / attached_to_name. A list filtered on both is the
      // whole query — no join, no method call.
      const files = await ctx.client.list<FrappeFile>("File", {
        fields: [
          "name",
          "file_name",
          "file_url",
          "file_size",
          "is_private",
          "attached_to_field",
          "creation",
          "modified",
          "owner",
        ],
        filters: [
          ["attached_to_doctype", "=", input.attached_to_doctype as string],
          ["attached_to_name", "=", input.attached_to_name as string],
        ],
        order_by: "creation desc",
        limit: (input.limit as number | undefined) ?? 50,
      });

      return {
        count: files.length,
        data: files.map((file) => ({
          name: file.name,
          file_name: file.file_name,
          file_url: file.file_url,
          file_size: file.file_size ?? null,
          is_private: file.is_private === 1,
          attached_to_field: file.attached_to_field ?? null,
          creation: file.creation,
          modified: file.modified,
          owner: file.owner,
        })),
      };
    },
  },

  {
    name: "erpnext_file_download",
    annotations: { readOnlyHint: true },
    _meta: {
      ui: {
        resourceUri: DOC_META.ui!.resourceUri,
        visibility: ["app"],
      },
    },
    description:
      "Download one ERPNext attachment for the document viewer. The tool accepts a File ID, verifies its document attachment, and returns one embedded binary resource.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        file_id: {
          type: "string",
          description: "Native ERPNext File.name identifier, never a URL.",
          minLength: 1,
        },
        attached_to_doctype: {
          type: "string",
          description: "Expected parent document DocType.",
          minLength: 1,
        },
        attached_to_name: {
          type: "string",
          description: "Expected parent document name/ID.",
          minLength: 1,
        },
      },
      required: ["file_id", "attached_to_doctype", "attached_to_name"],
      additionalProperties: false,
    },
    handler: async (input, ctx) => {
      for (
        const field of [
          "file_id",
          "attached_to_doctype",
          "attached_to_name",
        ] as const
      ) {
        if (typeof input[field] !== "string" || !input[field].trim()) {
          throw new Error(
            `[erpnext_file_download] '${field}' must be a non-empty string`,
          );
        }
      }

      const file = await ctx.client.downloadFile({
        fileId: (input.file_id as string).trim(),
        attachedToDoctype: (input.attached_to_doctype as string).trim(),
        attachedToName: (input.attached_to_name as string).trim(),
      });
      return {
        content: [
          {
            type: "text",
            text:
              `Prepared ${file.fileName} for download (${file.bytes.byteLength} bytes).`,
          },
          {
            type: "resource",
            resource: {
              uri: `file:///${encodeURIComponent(file.fileName)}`,
              mimeType: file.mimeType,
              blob: bytesToBase64(file.bytes),
            },
          },
        ],
      };
    },
  },

  {
    name: "erpnext_file_upload",
    annotations: { destructiveHint: true },
    description:
      "Upload base64-encoded file content and attach it to any ERPNext document. " +
      "Files are private by default.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        file_name: {
          type: "string",
          description: "Filename only, without a path.",
          minLength: 1,
        },
        content_base64: {
          type: "string",
          description: "File content as standard base64 (not a data URL).",
          minLength: 1,
        },
        attached_to_doctype: {
          type: "string",
          description: "DocType of the document to attach the file to.",
          minLength: 1,
        },
        attached_to_name: {
          type: "string",
          description: "Name/ID of the document to attach the file to.",
          minLength: 1,
        },
        attached_to_field: {
          type: "string",
          description:
            "Optional Attach or Attach Image field to populate with the uploaded file.",
        },
        is_private: {
          type: "boolean",
          description: "Whether the attachment is private. Defaults to true.",
          default: true,
        },
      },
      required: [
        "file_name",
        "content_base64",
        "attached_to_doctype",
        "attached_to_name",
      ],
    },
    handler: async (input, ctx) => {
      const requiredStrings = [
        "file_name",
        "content_base64",
        "attached_to_doctype",
        "attached_to_name",
      ] as const;
      for (const field of requiredStrings) {
        if (typeof input[field] !== "string" || !input[field].trim()) {
          throw new Error(
            `[erpnext_file_upload] '${field}' must be a non-empty string`,
          );
        }
      }

      const fileName = input.file_name as string;
      if (/[\\/\0]/.test(fileName)) {
        throw new Error(
          "[erpnext_file_upload] 'file_name' must be a filename without a path",
        );
      }
      if (
        input.is_private !== undefined && typeof input.is_private !== "boolean"
      ) {
        throw new Error("[erpnext_file_upload] 'is_private' must be a boolean");
      }
      if (
        input.attached_to_field !== undefined &&
        (typeof input.attached_to_field !== "string" ||
          !input.attached_to_field.trim())
      ) {
        throw new Error(
          "[erpnext_file_upload] 'attached_to_field' must be a non-empty string",
        );
      }

      const file = await ctx.client.uploadFile({
        fileName,
        contentBase64: input.content_base64 as string,
        attachedToDoctype: input.attached_to_doctype as string,
        attachedToName: input.attached_to_name as string,
        ...(input.attached_to_field !== undefined
          ? { attachedToField: input.attached_to_field.trim() }
          : {}),
        isPrivate: input.is_private === undefined
          ? true
          : input.is_private as boolean,
      });

      return {
        data: file,
        message:
          `${fileName} attached to ${input.attached_to_doctype} ${input.attached_to_name}`,
      };
    },
  },

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
          description:
            "ERPNext DocType name (e.g. 'Company', 'Item Group', 'Warehouse Type')",
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
        throw new Error(
          "[erpnext_doc_create] 'data' must be an object with document fields",
        );
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
          description:
            "ERPNext DocType name (e.g. 'Customer', 'Sales Order', 'Item')",
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
        throw new Error(
          "[erpnext_doc_update] 'data' must be an object with fields to update",
        );
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
    annotations: { destructiveHint: true },
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
    annotations: { destructiveHint: true },
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

      // Fetch fresh doc first — frappe.client.submit requires `modified` for optimistic
      // locking, so this read must bypass the cache even if a recent copy is cached.
      const doc = await ctx.client.get(
        input.doctype as string,
        input.name as string,
        { skipCache: true },
      );
      const docWithDoctype = { ...doc, doctype: input.doctype as string };
      const patchedDoc = withRoundedTotalFallback(docWithDoctype);
      const result = await ctx.client.callMethod("frappe.client.submit", {
        doc: patchedDoc,
      });
      ctx.client.invalidate(input.doctype as string, input.name as string);

      const warnings = roundedTotalFallbackWarning(docWithDoctype, patchedDoc);

      return {
        data: result,
        message: `${input.doctype} ${input.name} submitted successfully`,
        doctype: input.doctype,
        name: input.name,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
  },

  // ── Generic Cancel ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_cancel",
    annotations: { destructiveHint: true },
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
      ctx.client.invalidate(input.doctype as string, input.name as string);

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
    annotations: { readOnlyHint: true },
    _meta: DOC_META,
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
      if (typeof input.doctype !== "string" || !input.doctype.trim()) {
        throw new Error("[erpnext_doc_get] 'doctype' is required");
      }
      if (typeof input.name !== "string" || !input.name.trim()) {
        throw new Error("[erpnext_doc_get] 'name' is required");
      }

      const doctype = input.doctype.trim();
      const doc = await ctx.client.get(
        doctype,
        input.name.trim(),
      );
      return { data: { ...doc, doctype } };
    },
  },

  // ── Generic List ──────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_list",
    annotations: { readOnlyHint: true },
    _meta: DOCLIST_META,
    description:
      "List any ERPNext documents by DocType. Useful for DocTypes not covered " +
      "by dedicated tools. Supports field selection, filters (as JSON array), and limit.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description:
            "ERPNext DocType name (e.g. 'Lead', 'Asset', 'BOM', 'Cost Center')",
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
            "Frappe filters as array of [fieldname, operator, value] tuples, or " +
            "[child doctype, fieldname, operator, value] to filter on a child table. " +
            "Values may be strings, numbers, booleans, null, or string/number arrays for in/not in. " +
            'Example: [["status","=","Open"],["company","=","Acme"]]',
          items: {
            type: "array",
            anyOf: [
              {
                prefixItems: [
                  { type: "string", minLength: 1 },
                  { type: "string", minLength: 1 },
                  {
                    oneOf: [
                      { type: ["string", "number", "boolean", "null"] },
                      {
                        type: "array",
                        items: { type: ["string", "number"] },
                      },
                    ],
                  },
                ],
                minItems: 3,
                maxItems: 3,
              },
              {
                prefixItems: [
                  { type: "string", minLength: 1 },
                  { type: "string", minLength: 1 },
                  { type: "string", minLength: 1 },
                  {
                    oneOf: [
                      { type: ["string", "number", "boolean", "null"] },
                      {
                        type: "array",
                        items: { type: ["string", "number"] },
                      },
                    ],
                  },
                ],
                minItems: 4,
                maxItems: 4,
              },
              {
                // 3.0.x advertised arbitrary string arrays. Keep accepting
                // that legacy surface while describing real 3/4-part Frappe
                // tuples precisely for modern clients.
                items: { type: "string" },
              },
            ],
          },
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
        _meta: DOCLIST_META,
      };
    },
  },

  // ── Generic Assign ────────────────────────────────────────────────────────

  {
    name: "erpnext_doc_assign",
    description:
      "Assign any ERPNext document to one or more users through Frappe's native " +
      "assignment workflow (per-assignee ToDo, _assign sync, permission sharing, " +
      "native notifications). Works on any DocType (e.g. 'Task', 'Issue', 'Opportunity'). " +
      "Idempotent: re-assigning an already-assigned user returns the existing ToDo without re-notifying.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description:
            "ERPNext DocType name (e.g. 'Task', 'Issue', 'Opportunity')",
        },
        name: {
          type: "string",
          description: "Document name/ID (e.g. 'TASK-2026-00001')",
        },
        ...ASSIGNMENT_INPUT_PROPERTIES,
      },
      required: ["doctype", "name", "assign_to"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_assign] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_assign] 'name' is required");
      }
      const assignment = prepareAssignment(input, "erpnext_doc_assign");
      if (!assignment) {
        throw new Error("[erpnext_doc_assign] 'assign_to' is required");
      }

      const doctype = input.doctype as string;
      const name = input.name as string;
      // Fast-fail on a missing document before touching users or ToDos.
      await ctx.client.get(doctype, name);
      await validateAssignees(assignment.assignees, "erpnext_doc_assign", ctx);

      const assignmentInfo = await applyAssignment(
        doctype,
        name,
        assignment,
        ctx,
        `[erpnext_doc_assign] ${doctype} ${name} assignment failed`,
      );
      const doc = await fetchDocAfterAssignment(
        doctype,
        name,
        ctx,
        "erpnext_doc_assign",
      );
      return {
        data: doc,
        message: `${doctype} ${name} is now assigned to ${
          assignment.assignees.join(", ")
        }`,
        assignment: assignmentInfo,
      };
    },
  },

  // ── Generic Unassign ──────────────────────────────────────────────────────

  {
    name: "erpnext_doc_unassign",
    description:
      "Remove one user's assignment from any ERPNext document through Frappe's " +
      "native workflow (closes the user's ToDo and resyncs _assign). " +
      "Works on any DocType. Pass one user per call. Idempotent: removing " +
      "a user who is not assigned is a no-op on the Frappe side.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        doctype: {
          type: "string",
          description:
            "ERPNext DocType name (e.g. 'Task', 'Issue', 'Opportunity')",
        },
        name: {
          type: "string",
          description: "Document name/ID (e.g. 'TASK-2026-00001')",
        },
        assign_to: {
          type: "string",
          description: "User email whose assignment should be removed",
          minLength: 1,
        },
      },
      required: ["doctype", "name", "assign_to"],
    },
    handler: async (input, ctx) => {
      if (!input.doctype) {
        throw new Error("[erpnext_doc_unassign] 'doctype' is required");
      }
      if (!input.name) {
        throw new Error("[erpnext_doc_unassign] 'name' is required");
      }
      if (typeof input.assign_to !== "string" || !input.assign_to.trim()) {
        throw new Error(
          "[erpnext_doc_unassign] 'assign_to' must be a non-empty user email",
        );
      }

      const doctype = input.doctype as string;
      const name = input.name as string;
      const assignee = input.assign_to.trim();
      const unassignment = await removeAssignment(
        doctype,
        name,
        assignee,
        ctx,
        `[erpnext_doc_unassign] ${doctype} ${name} unassignment failed`,
      );
      const doc = await fetchDocAfterAssignment(
        doctype,
        name,
        ctx,
        "erpnext_doc_unassign",
        "unassignment",
      );
      return {
        data: doc,
        message: `${assignee} unassigned from ${doctype} ${name}`,
        assignment: unassignment,
      };
    },
  },

  // ── Method Escape Hatch ────────────────────────────────────────────────────

  {
    name: "erpnext_method_call",
    description:
      "Call a whitelisted Frappe method directly (POST or GET /api/method/{method}). " +
      "Escape hatch for behaviour that is not a plain document write: custom-app " +
      "@frappe.whitelist methods, validate hooks that reject direct field updates, " +
      "and GET-only endpoints. Deny-by-default: the method must match an entry in " +
      "ERPNEXT_METHOD_ALLOWLIST (exact dotted path or 'prefix.*' wildcard), or the " +
      "call is rejected before it reaches ERPNext. Set ERPNEXT_METHOD_ALLOWLIST=* " +
      "to allow any method for a fully open session.",
    category: "operations",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          description:
            "Dotted path to the whitelisted method, e.g. 'frappe.client.get_count' " +
            "or 'my_app.api.reconcile'.",
          minLength: 1,
        },
        args: {
          type: "object",
          description: "Keyword arguments passed to the method.",
        },
        http_method: {
          type: "string",
          enum: ["GET", "POST"],
          description:
            "HTTP verb to use. Defaults to POST. Use GET for methods declared " +
            '@frappe.whitelist(methods=["GET"]), which reject POST.',
        },
        invalidate: {
          type: "object",
          description:
            "Optional { doctype, name } to drop from the read cache after a " +
            "mutating call, so the next read reflects the method's side effects.",
          properties: {
            doctype: { type: "string", minLength: 1 },
            name: { type: "string", minLength: 1 },
          },
          required: ["doctype", "name"],
        },
      },
      required: ["method"],
    },
    handler: async (input, ctx) => {
      if (typeof input.method !== "string" || !input.method.trim()) {
        throw new Error(
          "[erpnext_method_call] 'method' must be a non-empty dotted path",
        );
      }
      const method = input.method.trim();
      if (!isValidMethodPath(method)) {
        throw new Error(
          `[erpnext_method_call] 'method' is not a valid dotted path: '${method}'`,
        );
      }

      const allowlist = loadMethodAllowlist();
      if (!isMethodAllowed(method, allowlist)) {
        throw new Error(
          `[erpnext_method_call] '${method}' is not permitted. Add it (or a ` +
            "'prefix.*' covering it) to ERPNEXT_METHOD_ALLOWLIST, or set " +
            "ERPNEXT_METHOD_ALLOWLIST=* to allow any method.",
        );
      }

      if (
        input.args !== undefined &&
        (typeof input.args !== "object" || input.args === null ||
          Array.isArray(input.args))
      ) {
        throw new Error(
          "[erpnext_method_call] 'args' must be an object of keyword arguments",
        );
      }
      const args = (input.args as Record<string, unknown> | undefined) ?? {};

      let httpMethod: "GET" | "POST" = "POST";
      if (input.http_method !== undefined) {
        if (input.http_method !== "GET" && input.http_method !== "POST") {
          throw new Error(
            "[erpnext_method_call] 'http_method' must be 'GET' or 'POST'",
          );
        }
        httpMethod = input.http_method;
      }

      let invalidate: { doctype: string; name: string } | undefined;
      if (input.invalidate !== undefined) {
        const inv = input.invalidate as Record<string, unknown>;
        if (
          typeof inv?.doctype !== "string" || !inv.doctype.trim() ||
          typeof inv?.name !== "string" || !inv.name.trim()
        ) {
          throw new Error(
            "[erpnext_method_call] 'invalidate' requires non-empty 'doctype' and 'name'",
          );
        }
        invalidate = { doctype: inv.doctype.trim(), name: inv.name.trim() };
      }

      const result = await ctx.client.callMethod(method, args, httpMethod);

      if (invalidate) {
        ctx.client.invalidate(invalidate.doctype, invalidate.name);
      }

      return { data: result };
    },
  },
];
