import { assert, assertEquals, assertRejects } from "@std/assert";
import type { ToolHandlerContext } from "@mcpview/server";
import { type Operation, WriteConfirmations } from "./confirmation.ts";

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
