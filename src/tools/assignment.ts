/**
 * Frappe Native Assignment Helpers
 *
 * Shared logic for assigning documents to users through Frappe's native
 * assignment workflow (`frappe.desk.form.assign_to.add`): one ToDo per
 * assignee, `_assign` sync, permission sharing, document follow, and native
 * notifications. Doctype-agnostic — used by the Task tools and the generic
 * `erpnext_doc_assign` tool.
 *
 * @module lib/erpnext/tools/assignment
 */

import type { ErpNextToolContext, JSONSchema } from "./types.ts";

const ASSIGNMENT_METHOD = "frappe.desk.form.assign_to.add";

// Keeps the validation query well under Frappe's result cap (500) and the
// native per-assignee ToDo/notification fan-out within a sane request.
const MAX_ASSIGNEES_PER_CALL = 50;

export type PreparedAssignment = {
  assignees: string[];
  args: Record<string, unknown>;
};

/**
 * Shared inputSchema properties for tools that accept native assignment.
 * Frappe v15 always notifies assignees (no per-call suppression), so
 * `notify_user` only documents that behavior and rejects `false`.
 */
export const ASSIGNMENT_INPUT_PROPERTIES: Record<string, JSONSchema> = {
  assign_to: {
    type: ["string", "array"],
    description: "User email or non-empty array of user emails to assign",
    minLength: 1,
    minItems: 1,
    items: { type: "string", minLength: 1 },
  },
  notify_user: {
    type: "boolean",
    description:
      "Frappe always sends its native assignment notification (v15 has no " +
      "per-call suppression), so only true is accepted (default true)",
    default: true,
  },
  assignment_description: {
    type: "string",
    description: "Description for the native ToDo assignment",
  },
  assignment_priority: {
    type: "string",
    description: "Native ToDo priority",
    enum: ["Low", "Medium", "High"],
  },
  assignment_date: {
    type: "string",
    description: "Native ToDo date YYYY-MM-DD",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  },
};

/**
 * Validate and normalize assignment inputs. Returns undefined when the
 * input carries no `assign_to` (the tool runs its non-assignment path).
 */
export function prepareAssignment(
  input: Record<string, unknown>,
  toolName: string,
): PreparedAssignment | undefined {
  if (input.assign_to === undefined) return undefined;

  if (input.notify_user === false) {
    throw new Error(
      `[${toolName}] 'notify_user=false' is not supported for native assignments`,
    );
  }
  if (
    input.notify_user !== undefined && typeof input.notify_user !== "boolean"
  ) {
    throw new Error(`[${toolName}] 'notify_user' must be a boolean`);
  }

  const rawAssignees = typeof input.assign_to === "string"
    ? [input.assign_to]
    : Array.isArray(input.assign_to)
    ? input.assign_to
    : undefined;
  if (!rawAssignees || rawAssignees.length === 0) {
    throw new Error(
      `[${toolName}] 'assign_to' must be a non-empty string or array of non-empty strings`,
    );
  }

  const assignees = [
    ...new Set(rawAssignees.map((assignee) => {
      if (typeof assignee !== "string" || !assignee.trim()) {
        throw new Error(
          `[${toolName}] 'assign_to' must be a non-empty string or array of non-empty strings`,
        );
      }
      return assignee.trim();
    })),
  ];
  if (assignees.length > MAX_ASSIGNEES_PER_CALL) {
    throw new Error(
      `[${toolName}] 'assign_to' accepts at most ${MAX_ASSIGNEES_PER_CALL} distinct users per call (got ${assignees.length})`,
    );
  }

  const args: Record<string, unknown> = { assign_to: assignees };
  if (input.assignment_description !== undefined) {
    if (typeof input.assignment_description !== "string") {
      throw new Error(
        `[${toolName}] 'assignment_description' must be a string`,
      );
    }
    args.description = input.assignment_description;
  }
  if (input.assignment_priority !== undefined) {
    if (
      input.assignment_priority !== "Low" &&
      input.assignment_priority !== "Medium" &&
      input.assignment_priority !== "High"
    ) {
      throw new Error(
        `[${toolName}] 'assignment_priority' must be one of: Low, Medium, High`,
      );
    }
    args.priority = input.assignment_priority;
  }
  if (input.assignment_date !== undefined) {
    if (
      typeof input.assignment_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.assignment_date)
    ) {
      throw new Error(`[${toolName}] 'assignment_date' must be YYYY-MM-DD`);
    }
    args.date = input.assignment_date;
  }

  return { assignees, args };
}

/** Reject nonexistent or disabled assignees before any mutation. */
export async function validateAssignees(
  assignees: string[],
  toolName: string,
  ctx: ErpNextToolContext,
): Promise<void> {
  const users = await ctx.client.list("User", {
    fields: ["name", "enabled"],
    filters: [["name", "in", assignees]],
    limit: assignees.length,
  });
  const enabledByName = new Map(
    users.map((user) => [user.name as string, user.enabled]),
  );
  for (const assignee of assignees) {
    if (!enabledByName.has(assignee)) {
      throw new Error(
        `[${toolName}] User '${assignee}' does not exist or is not accessible`,
      );
    }
    if (!enabledByName.get(assignee)) {
      throw new Error(`[${toolName}] User '${assignee}' is disabled`);
    }
  }
}

/**
 * Run the native assignment. On failure, rethrows with `failureContext`
 * prepended so callers can state what was already mutated (e.g. "Task X
 * was created, but assignment failed").
 */
export async function applyAssignment(
  doctype: string,
  name: string,
  assignment: PreparedAssignment,
  ctx: ErpNextToolContext,
  failureContext: string,
): Promise<Record<string, unknown>> {
  let nativeResult: unknown;
  try {
    nativeResult = await ctx.client.callMethod(ASSIGNMENT_METHOD, {
      doctype,
      name,
      ...assignment.args,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${failureContext}: ${reason}`, { cause: error });
  }

  const todos = Array.isArray(nativeResult)
    ? nativeResult.map((todo) => {
      const record = todo as Record<string, unknown>;
      return { owner: record.owner, name: record.name };
    })
    : [];
  return { notify_user: true, assignees: assignment.assignees, todos };
}

/**
 * Re-fetch a document after a committed assignment. A failure here must not
 * read like an assignment failure — the mutation already succeeded.
 */
export async function fetchDocAfterAssignment(
  doctype: string,
  name: string,
  ctx: ErpNextToolContext,
  toolName: string,
): Promise<Record<string, unknown>> {
  try {
    return await ctx.client.get(doctype, name);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[${toolName}] ${doctype} ${name} assignment succeeded, but re-fetching the document failed: ${reason}`,
      { cause: error },
    );
  }
}
