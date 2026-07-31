/**
 * Safe MRTR handling for ambiguous ERPNext Link fields.
 *
 * The framework owns requestState sealing and verification. This module only
 * consumes its verified retry context and never reads requestState itself.
 */

import { AmbiguousLinkError } from "../api/resolve.ts";
import type {
  InputRequiredSignal,
  ToolHandlerContext,
} from "@casys/mcp-server";

export interface LinkDisambiguationResult {
  result: unknown;
  args: Record<string, unknown>;
}

export interface LinkDisambiguationOptions {
  args: Record<string, unknown>;
  context?: ToolHandlerContext;
  enabled: boolean;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Stable MRTR response key for a top-level Link-field input. */
export function linkDisambiguationRequestKey(inputPath: string): string {
  return `link-disambiguation:${inputPath}`;
}

function supportsElicitation(context?: ToolHandlerContext): boolean {
  return context?.clientCapabilities?.elicitation !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildInputRequiredSignal(
  ambiguity: AmbiguousLinkError,
  inputPath: string,
): InputRequiredSignal {
  const choices = ambiguity.candidates.map(({ id, label }) =>
    `${id} (${label})`
  )
    .join(", ");
  const truncated = ambiguity.truncated
    ? " More matching records may exist."
    : "";

  return {
    resultType: "input_required",
    inputRequests: {
      [linkDisambiguationRequestKey(inputPath)]: {
        method: "elicitation/create",
        params: {
          mode: "form",
          message:
            `Multiple ${ambiguity.doctype} records match "${ambiguity.identifier}". ` +
            `Choose the record ID to use: ${choices}.${truncated}`,
          requestedSchema: {
            type: "object",
            properties: {
              recordId: {
                type: "string",
                enum: ambiguity.candidates.map(({ id }) => id),
              },
            },
            required: ["recordId"],
            additionalProperties: false,
          },
        },
      },
    },
  };
}

function selectedRecordId(
  ambiguity: AmbiguousLinkError,
  inputPath: string,
  context: ToolHandlerContext | undefined,
): string | undefined {
  const hasRetryContext = context?.inputResponses !== undefined ||
    context?.retryVerified !== undefined;
  if (!hasRetryContext) return undefined;

  if (context?.retryVerified !== true) {
    throw new Error(
      "[link-disambiguation] Refusing to use an unverified MRTR response.",
    );
  }

  const key = linkDisambiguationRequestKey(inputPath);
  const response = context.inputResponses?.[key];
  if (!isRecord(response)) {
    throw new Error(
      `[link-disambiguation] Missing or invalid response for "${key}".`,
    );
  }

  if (response.action === "cancel" || response.action === "decline") {
    throw new Error("[link-disambiguation] Record selection was declined.");
  }
  if (response.action !== "accept" || !isRecord(response.content)) {
    throw new Error(
      `[link-disambiguation] Response for "${key}" must accept a record ID.`,
    );
  }

  const recordId = response.content.recordId;
  if (typeof recordId !== "string") {
    throw new Error(
      `[link-disambiguation] Response for "${key}" must contain a string recordId.`,
    );
  }
  if (!ambiguity.candidates.some((candidate) => candidate.id === recordId)) {
    throw new Error(
      `[link-disambiguation] Selected record ID "${recordId}" is not a candidate for this request.`,
    );
  }

  return recordId;
}

/**
 * Executes a tool and turns an eligible ambiguous Link field into an MRTR form.
 * On retry, it deliberately re-runs the original arguments first so candidates
 * are reconstructed from the same request context before an ID is trusted.
 */
export async function runWithLinkDisambiguation(
  options: LinkDisambiguationOptions,
): Promise<LinkDisambiguationResult> {
  try {
    return { result: await options.execute(options.args), args: options.args };
  } catch (error) {
    if (
      !(error instanceof AmbiguousLinkError) || !options.enabled ||
      !error.inputPath || !supportsElicitation(options.context)
    ) {
      throw error;
    }

    const recordId = selectedRecordId(error, error.inputPath, options.context);
    if (recordId === undefined) {
      return {
        result: buildInputRequiredSignal(error, error.inputPath),
        args: options.args,
      };
    }

    const resolvedArgs = { ...options.args, [error.inputPath]: recordId };
    return {
      result: await options.execute(resolvedArgs),
      args: resolvedArgs,
    };
  }
}
