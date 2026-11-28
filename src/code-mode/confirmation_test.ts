import { assert, assertEquals, assertRejects } from "@std/assert";
import type { ToolHandlerContext } from "@mcpview/server";
import { type Operation, WriteConfirmations } from "./confirmation.ts";
import { CodeModeError } from "./errors.ts";
import { SuspendCodeMode } from "./sandbox.ts";
import { parseToolInputError } from "../tools/errors.ts";

const source = { name: "execute", args: { code: "fixture program" } };
const operation = (n: number): Operation => ({
  name: "change",
  args: { amount: n },
});
const http = (subject: string, form = false): ToolHandlerContext => ({
  toolName: "execute",
  request: new Request("https://local/mcp"),
  authInfo: { subject, scopes: [] },
  clientCapabilities: form ? { elicitation: { form: {} } } : {
    extensions: {
      "io.modelcontextprotocol/ui": {
        mimeTypes: ["text/html;profile=mcp-app"],
      },
    },
  },
});
function appTicket(value: unknown): string {
  const r = value as {
    _meta: Record<string, { ticket: string }>;
    content: unknown;
  };
  const id = r._meta["io.casys/erpnext-write-confirmation"].ticket;
  assert(!JSON.stringify(r.content).includes(id));
  return id;
}
function formId(value: unknown): string {
  const r = value as {
    resultType: string;
    inputRequests: Record<string, unknown>;
  };
  assertEquals(r.resultType, "input_required");
  return Object.keys(r.inputRequests)[0];
}
const yes = { action: "accept", content: { confirm: true } };

Deno.test("Apps approves each concrete operation once across concurrent retries and two writes", async () => {
  const flow = new WriteConfirmations();
  const writes: number[] = [];
  const alice = http("alice");
  const run = (_entry: Operation, ctx: ToolHandlerContext) =>
    flow.run(ctx, source, true, async (write) => {
      const one = await write(operation(1), async () => {
        writes.push(1);
        return { amount: 1 };
      });
      assertEquals(one, { amount: 1 });
      const two = await write(operation(2), async () => {
        writes.push(2);
        return { amount: 2 };
      });
      return two;
    });
  const id = appTicket(await run(source, alice));
  assertEquals(writes, []);
  const decide = (ticket: string, ctx: ToolHandlerContext) =>
    flow.confirmInApp({ ticket, decision: "approve" }, ctx, run);
  await assertRejects(() => decide(id, http("bob")), Error, "unavailable");
  const duplicate = await Promise.allSettled([
    decide(id, alice),
    decide(id, alice),
  ]);
  const good = duplicate.filter((p) => p.status === "fulfilled");
  assertEquals(good.length, 1);
  assertEquals(writes, [1]);
  const next = appTicket(good[0].value);
  assertEquals(await decide(next, alice), { amount: 2 });
  assertEquals(writes, [1, 2]);
  await assertRejects(() => decide(next, alice), Error, "already used");
});

Deno.test("form approval requires a signed matching retry and stable resolved arguments", async () => {
  const flow = new WriteConfirmations();
  const alice = http("alice", true);
  let amount = 10;
  let count = 0;
  const run = (ctx: ToolHandlerContext) =>
    flow.run(
      ctx,
      source,
      false,
      (write) => write(operation(amount), async () => ++count),
    );
  const id = formId(await run(alice));
  await assertRejects(
    () => run({ ...alice, inputResponses: { [id]: yes } }),
    Error,
    "signed",
  );
  await assertRejects(
    () =>
      run({
        ...http("bob", true),
        retryVerified: true,
        inputResponses: { [id]: yes },
      }),
    Error,
    "unavailable",
  );
  amount = 20;
  await assertRejects(
    () => run({ ...alice, retryVerified: true, inputResponses: { [id]: yes } }),
    Error,
    "arguments changed",
  );
  assertEquals(count, 0);
  const next = formId(await run(alice));
  assertEquals(
    await run({
      ...alice,
      retryVerified: true,
      inputResponses: { [next]: yes },
    }),
    1,
  );
  await assertRejects(
    () =>
      run({ ...alice, retryVerified: true, inputResponses: { [next]: yes } }),
    Error,
    "already used",
  );
  assertEquals(count, 1);
});

Deno.test("expired, declined and unauthenticated approvals cannot call ERP", async () => {
  let now = 0;
  const flow = new WriteConfirmations(() => now);
  const alice = http("alice");
  const run = (_entry: Operation, ctx: ToolHandlerContext) =>
    flow.run(ctx, source, true, (write) =>
      write(operation(1), async () => {
        throw new Error("unexpected ERP call");
      }));
  let id = appTicket(await run(source, alice));
  await assertRejects(
    () => flow.confirmInApp({ ticket: id, decision: "cancel" }, alice, run),
    Error,
    "cancelled",
  );
  await assertRejects(
    () => flow.confirmInApp({ ticket: id, decision: "approve" }, alice, run),
    Error,
    "already used",
  );
  id = appTicket(await run(source, alice));
  now += 300_001;
  await assertRejects(
    () => flow.confirmInApp({ ticket: id, decision: "approve" }, alice, run),
    Error,
    "expired",
  );
  await assertRejects(
    () => run(source, { ...alice, authInfo: undefined }),
    Error,
    "authenticated principal",
  );
});

Deno.test("the native upload callback can confirm a maximum-size file inside a dual-capability app", async () => {
  const flow = new WriteConfirmations();
  const ctx = http("alice");
  const both = {
    ...ctx,
    clientCapabilities: {
      ...ctx.clientCapabilities,
      elicitation: { form: {} },
    },
  };
  const size = 10 * 1024 * 1024;
  const content = btoa("A".repeat(size));
  const args = {
    file_name: "sample.bin",
    content_base64: content,
    attached_to_doctype: "Task",
    attached_to_name: "TEST",
    is_private: true,
  };
  const upload = { name: "erpnext_file_upload", args };
  let count = 0;
  const run = (entry: Operation, current: ToolHandlerContext) =>
    flow.run(current, entry, true, (write) =>
      write(entry, async () => {
        assertEquals(entry.args.content_base64, content);
        count++;
        return "uploaded";
      }));
  const pending = await run(upload, both);
  assertEquals(count, 0);
  const id = appTicket(pending);
  const display = JSON.stringify(pending);
  assert(display.length < 1000);
  assert(
    display.includes('"bytes":10485760') && display.includes('"sha256":') &&
      display.includes("TEST"),
  );
  assertEquals(
    await flow.confirmInApp({ ticket: id, decision: "approve" }, both, run),
    "uploaded",
  );
  assertEquals(count, 1);
});

Deno.test("a declined write tells the agent which approved writes already reached ERPNext", async () => {
  const no = { action: "decline" };
  const named = (name: string): Operation => ({
    name,
    args: { doc: "SINV-1" },
  });

  // Form rail: the first write is approved and applied, the second is declined.
  const form = new WriteConfirmations();
  const alice = http("alice", true);
  const writes: string[] = [];
  const program = (ctx: ToolHandlerContext) =>
    form.run(ctx, source, false, async (write) => {
      await write(named("erpnext_doc_create"), async () => {
        writes.push("create");
        return { name: "SINV-1" };
      });
      return await write(named("erpnext_doc_submit"), async () => {
        writes.push("submit");
        return { docstatus: 1 };
      });
    });
  const first = formId(await program(alice));
  const second = formId(
    await program({
      ...alice,
      retryVerified: true,
      inputResponses: { [first]: yes },
    }),
  );
  assertEquals(writes, ["create"]);
  const error = await assertRejects(
    () =>
      program({
        ...alice,
        retryVerified: true,
        inputResponses: { [second]: no },
      }),
    CodeModeError,
  );
  assertEquals(error.code, "CHANGE_CANCELLED");
  assertEquals(error.context, {
    declined: "erpnext_doc_submit",
    sent: ["erpnext_doc_create"],
    failed: [],
  });
  assertEquals(parseToolInputError(error.message)?.code, "CHANGE_CANCELLED");
  assert(
    error.message.includes(
      "Already sent to ERPNext in this program: erpnext_doc_create",
    ),
  );
  assertEquals(writes, ["create"]);

  // Apps rail, nothing approved yet: the agent learns that nothing changed.
  const app = new WriteConfirmations();
  const bob = http("bob");
  const once = (_entry: Operation, ctx: ToolHandlerContext) =>
    app.run(
      ctx,
      source,
      true,
      (write) =>
        write(named("erpnext_doc_cancel"), async () => {
          throw new Error("unexpected ERP call");
        }),
    );
  const ticket = appTicket(await once(source, bob));
  const declined = await assertRejects(
    () => app.confirmInApp({ ticket, decision: "cancel" }, bob, once),
    CodeModeError,
  );
  assertEquals(declined.context, {
    declined: "erpnext_doc_cancel",
    sent: [],
    failed: [],
  });
  assert(declined.message.includes("No ERPNext change was made"));
});

Deno.test("a write that failed after reaching ERPNext is never reported as no change", async () => {
  const flow = new WriteConfirmations();
  const alice = http("alice", true);
  const named = (name: string): Operation => ({
    name,
    args: { doc: "TASK-1" },
  });
  const program = (ctx: ToolHandlerContext) =>
    flow.run(ctx, source, false, async (write) => {
      try {
        await write(named("erpnext_task_create"), async () => {
          throw new Error("assignment failed after the task was created");
        });
      } catch (error) {
        // In the sandbox a suspension bypasses guest catch handlers.
        if (error instanceof SuspendCodeMode) throw error;
        // The program carries on after the ERP failure, as guest code may.
      }
      return await write(named("erpnext_task_assign"), async () => ({}));
    });
  const first = formId(await program(alice));
  const second = formId(
    await program({
      ...alice,
      retryVerified: true,
      inputResponses: { [first]: yes },
    }),
  );
  const error = await assertRejects(
    () =>
      program({
        ...alice,
        retryVerified: true,
        inputResponses: { [second]: { action: "decline" } },
      }),
    CodeModeError,
  );
  assertEquals(error.context, {
    declined: "erpnext_task_assign",
    sent: [],
    failed: ["erpnext_task_create"],
  });
  assert(
    error.message.includes(
      "Sent but failed, possibly in part: erpnext_task_create",
    ),
  );
  assert(!error.message.includes("No ERPNext change"));
});

Deno.test("a program that fails after an approved write tells the agent not to rerun it", async () => {
  const flow = new WriteConfirmations();
  const alice = http("alice", true);
  let creates = 0;
  const program = (ctx: ToolHandlerContext) =>
    flow.run(ctx, source, false, async (write) => {
      await write(
        { name: "erpnext_doc_submit", args: { doc: "SINV-1" } },
        async () => {
          creates++;
          return { docstatus: 1 };
        },
      );
      // A replayed read now sees the submitted record and rejects it.
      throw new Error(
        "[erpnext_doc_get] INVALID_INPUT: SINV-1 is not a draft. Recovery: Pick a draft.",
      );
    });
  const id = formId(await program(alice));
  const error = await assertRejects(
    () =>
      program({ ...alice, retryVerified: true, inputResponses: { [id]: yes } }),
    Error,
  );
  const parsed = parseToolInputError(error.message);
  assertEquals(parsed?.code, "WRITE_APPLIED_THEN_FAILED");
  assert(parsed?.message.includes("erpnext_doc_submit"));
  assert(parsed?.message.includes("INVALID_INPUT: SINV-1 is not a draft"));
  assert(!parsed?.message.includes("Pick a draft"));
  assertEquals(creates, 1);
});
