import { assert, assertEquals, assertRejects } from "@std/assert";
import { AmbiguousLinkError } from "../api/resolve.ts";
import {
  linkDisambiguationRequestKey,
  runWithLinkDisambiguation,
} from "./link-disambiguation.ts";
import type { ToolHandlerContext } from "@casys/mcp-server";

const inputPath = "customer";
const requestKey = linkDisambiguationRequestKey(inputPath);
const candidates = [
  { id: "CUST-001", label: "Acme" },
  { id: "CUST-002", label: "Acme" },
];

function ambiguity(path: string | undefined = inputPath): AmbiguousLinkError {
  return new AmbiguousLinkError({
    message: "the original ambiguity",
    doctype: "Customer",
    identifier: "Acme",
    inputPath: path,
    candidates,
    truncated: true,
  });
}

function elicitationContext(
  overrides: Partial<ToolHandlerContext> = {},
): ToolHandlerContext {
  return {
    toolName: "erpnext_customer_create",
    clientCapabilities: { elicitation: {} },
    ...overrides,
  };
}

Deno.test("link disambiguation - falls back by rethrowing the original ambiguity", async () => {
  const original = ambiguity();

  try {
    await runWithLinkDisambiguation({
      args: { customer: "Acme" },
      enabled: false,
      context: elicitationContext(),
      execute: () => Promise.reject(original),
    });
    throw new Error("expected ambiguity to be thrown");
  } catch (error) {
    assert(error === original, "must rethrow the exact original error");
  }

  const noPath = new AmbiguousLinkError({
    message: "no input path",
    doctype: "Customer",
    identifier: "Acme",
    candidates,
    truncated: false,
  });
  await assertRejects(
    () =>
      runWithLinkDisambiguation({
        args: { customer: "Acme" },
        enabled: true,
        context: elicitationContext(),
        execute: () => Promise.reject(noPath),
      }),
    AmbiguousLinkError,
  );
  await assertRejects(
    () =>
      runWithLinkDisambiguation({
        args: { customer: "Acme" },
        enabled: true,
        execute: () => Promise.reject(original),
      }),
    AmbiguousLinkError,
  );
});

Deno.test("link disambiguation - returns a deterministic MRTR form initially", async () => {
  const result = await runWithLinkDisambiguation({
    args: { customer: "Acme" },
    enabled: true,
    context: elicitationContext(),
    execute: () => Promise.reject(ambiguity()),
  });

  assertEquals(result.args, { customer: "Acme" });
  assertEquals(result.result, {
    resultType: "input_required",
    inputRequests: {
      [requestKey]: {
        method: "elicitation/create",
        params: {
          mode: "form",
          message:
            'Multiple Customer records match "Acme". Choose the record ID to use: ' +
            "CUST-001 (Acme), CUST-002 (Acme). More matching records may exist.",
          requestedSchema: {
            type: "object",
            properties: {
              recordId: {
                type: "string",
                enum: ["CUST-001", "CUST-002"],
              },
            },
            required: ["recordId"],
            additionalProperties: false,
          },
        },
      },
    },
  });
});

Deno.test("link disambiguation - verified acceptance re-runs with the selected ID", async () => {
  const calls: Record<string, unknown>[] = [];
  const result = await runWithLinkDisambiguation({
    args: { customer: "Acme", status: "Draft" },
    enabled: true,
    context: elicitationContext({
      inputResponses: {
        [requestKey]: { action: "accept", content: { recordId: "CUST-002" } },
      },
      retryVerified: true,
    }),
    execute: async (args) => {
      calls.push(args);
      if (args.customer === "Acme") throw ambiguity();
      return { customer: args.customer };
    },
  });

  assertEquals(calls, [
    { customer: "Acme", status: "Draft" },
    { customer: "CUST-002", status: "Draft" },
  ]);
  assertEquals(result.args, { customer: "CUST-002", status: "Draft" });
  assertEquals(result.result, { customer: "CUST-002" });
});

for (
  const [name, response, retryVerified] of [
    [
      "unverified",
      { action: "accept", content: { recordId: "CUST-001" } },
      false,
    ],
    [
      "unknown ID",
      { action: "accept", content: { recordId: "CUST-404" } },
      true,
    ],
    ["cancel", { action: "cancel" }, true],
    ["decline", { action: "decline" }, true],
    ["invalid", { action: "accept", content: { recordId: 42 } }, true],
  ] as const
) {
  Deno.test(`link disambiguation - ${name} response cannot reach a mutation`, async () => {
    let mutations = 0;
    await assertRejects(
      () =>
        runWithLinkDisambiguation({
          args: { customer: "Acme" },
          enabled: true,
          context: elicitationContext({
            inputResponses: { [requestKey]: response },
            retryVerified,
          }),
          execute: async (args) => {
            if (args.customer === "Acme") throw ambiguity();
            mutations++;
            return { name: "MUTATION" };
          },
        }),
      Error,
    );
    assertEquals(mutations, 0);
  });
}
