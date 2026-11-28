import { assertEquals, assertRejects } from "@std/assert";
import { runCodeProgram, SuspendCodeMode } from "./sandbox.ts";
import { parseToolInputError } from "../tools/errors.ts";
import { CodeModeError } from "./errors.ts";

const receipt = { data: { docs: [{ amount: 120 }] }, reference: "host-only" };
const read = () => Promise.resolve(receipt);

Deno.test("QuickJS preserves the original object across reads and detaches computed copies", async () => {
  assertEquals(
    await runCodeProgram(
      `
    const [first, second] = await Promise.all([erp.call("first", {}), erp.call("next", {})]);
    return first;
  `,
      [],
      (name) => Promise.resolve({ data: { name }, reference: name }),
    ),
    {
      native: { data: { name: "first" }, reference: "first" },
    },
  );
  assertEquals(
    await runCodeProgram(
      `
    const invoice = await erp.call("read",{});
    return { ...invoice, receipt: typeof invoice.reference, total: invoice.docs[0].amount };
  `,
      [],
      read,
    ),
    { value: { docs: [{ amount: 120 }], receipt: "undefined", total: 120 } },
  );
  await assertRejects(() =>
    runCodeProgram(
      'const invoice=await erp.call("read",{}); invoice.docs[0].amount=0; return invoice;',
      [],
      read,
    )
  );
  assertEquals(receipt.data.docs[0].amount, 120);
});

Deno.test("QuickJS isolates each program from system capabilities and other executions", async () => {
  await runCodeProgram("globalThis.previousERP=1; return true", [], read);
  assertEquals(
    await runCodeProgram(
      `
    return [typeof process,typeof Deno,typeof fetch,typeof require,typeof WebSocket,typeof previousERP];
  `,
      [],
      read,
    ),
    { value: Array(6).fill("undefined") },
  );
  let invoked = 0;
  assertEquals(
    await runCodeProgram('erp.call("unused",{}); return 7', [], () => {
      invoked++;
      throw new Error("Unawaited read should have been discarded");
    }),
    { value: 7 },
  );
  assertEquals(invoked, 0);
});

Deno.test("QuickJS bounds computation, pending promises, read count and JSON sizes", async () => {
  await assertRejects(() => runCodeProgram("while (true) {}", [], read), Error);
  await assertRejects(
    () => runCodeProgram("return new Promise(() => {})", [], read),
    Error,
    "unresolved promise",
  );
  let calls = 0;
  await assertRejects(
    () =>
      runCodeProgram(
        `
    for (let i=0; i<13; i++) await erp.call("read",{});
    return true;
  `,
        [],
        () => {
          calls++;
          return read();
        },
      ),
    Error,
    "12 ERP calls",
  );
  assertEquals(calls, 12);
  await assertRejects(
    () => runCodeProgram("return 'a'.repeat(1024*1024)", [], read),
    Error,
    "size limit",
  );
  await assertRejects(
    () => runCodeProgram("return undefined", [], read),
    Error,
    "Expected a JSON value",
  );
  await assertRejects(
    () => runCodeProgram(" ", [], read),
    Error,
    "function body",
  );
  await assertRejects(
    () =>
      runCodeProgram(
        "return new Uint8Array(64 * 1024 * 1024).length",
        [],
        read,
      ),
    Error,
    "out of memory",
  );
  assertEquals(await runCodeProgram("return 42", [], read), { value: 42 });
});

Deno.test("an oversized committed write is reported as completed and cannot be retried by guest catch", async () => {
  const calls: string[] = [];
  await assertRejects(
    () =>
      runCodeProgram(
        'try {return await erp.call("write",{});} catch {return erp.call("write",{});}',
        [],
        async (name) => {
          calls.push(name);
          return { data: "x".repeat(1024 * 1024) };
        },
        new Set(["write"]),
      ),
    SuspendCodeMode,
    "ERPNext completed write",
  );
  assertEquals(calls, ["write"]);
});

Deno.test("program failures reach the agent as [execute] CODE errors and keep coded ERP errors intact", async () => {
  const codeOf = async (program: string, call = read) => {
    const error = await assertRejects(() => runCodeProgram(program, [], call));
    const parsed = parseToolInputError((error as Error).message);
    return parsed && `${parsed.tool} ${parsed.code}`;
  };
  assertEquals(
    await codeOf('throw new Error("boom")'),
    "execute PROGRAM_FAILED",
  );
  assertEquals(await codeOf("while (true) {}"), "execute PROGRAM_TIMEOUT");
  assertEquals(
    await codeOf(
      'for (let i = 0; i < 13; i++) await erp.call("read", {}); return 1',
    ),
    "execute CALL_LIMIT",
  );
  assertEquals(
    await codeOf("return new Promise(() => {})"),
    "execute PROGRAM_FAILED",
  );
  // An ERP tool error the program does not catch keeps its own code and recovery.
  const coded =
    "[erpnext_doc_list] INVALID_FILTER: filters[0] is malformed. Recovery: Send [field, operator, value].";
  await assertRejects(
    () =>
      runCodeProgram(
        'return await erp.call("list", {})',
        [],
        () => Promise.reject(new Error(coded)),
      ),
    Error,
    coded,
  );
  // The guest's own message survives inside PROGRAM_FAILED.
  await assertRejects(
    () =>
      runCodeProgram('throw new Error("minimum must be a number")', [], read),
    Error,
    "PROGRAM_FAILED: minimum must be a number. Recovery:",
  );
});

Deno.test("syntax errors and unserializable results leave the sandbox with a code", async () => {
  for (
    const program of [
      "return {",
      "return 10n",
      "return { toJSON() { throw new Error('nope'); } }",
    ]
  ) {
    const error = await assertRejects(() => runCodeProgram(program, [], read));
    assertEquals(
      parseToolInputError((error as Error).message)?.code,
      "PROGRAM_FAILED",
      program,
    );
  }
});

Deno.test("an unawaited write fails with UNAWAITED_CALLS and never reaches ERPNext; an unawaited read does not", async () => {
  const sent: string[] = [];
  const call = (name: string) => {
    sent.push(name);
    return Promise.resolve({ data: { name } });
  };
  const error = await assertRejects(
    () =>
      runCodeProgram(
        'await erp.call("read", {}); erp.call("submit", {}); return "done"',
        [],
        call,
        new Set(["submit"]),
      ),
    CodeModeError,
  );
  assertEquals(error.code, "UNAWAITED_CALLS");
  assertEquals(error.context, { notSent: ["submit"] });
  assertEquals(sent, ["read"]);
  // A dropped read changes nothing, so the program's own result stands.
  assertEquals(
    await runCodeProgram(
      'erp.call("read", {}); return 7',
      [],
      call,
      new Set(["submit"]),
    ),
    { value: 7 },
  );
  assertEquals(sent, ["read"]);
});

Deno.test("a typed ERP error keeps its code inside the program and after it", async () => {
  class TypedFailure extends Error {
    readonly code = "BUY_CAPTURE_MISSING_SOURCE";
    readonly recovery = "Capture the supplier quotation first.";
  }
  const failing = () =>
    Promise.reject(new TypedFailure("No supplier quotation for ITEM-1"));
  // A guest catch reads an Error with code and recovery, not a bare string.
  assertEquals(
    await runCodeProgram(
      'try { await erp.call("erpnext_buy_capture", {}); } catch (e) { return [e instanceof Error, e.code, e.recovery, e.message]; }',
      [],
      failing,
    ),
    {
      value: [
        true,
        "BUY_CAPTURE_MISSING_SOURCE",
        "Capture the supplier quotation first.",
        "[erpnext_buy_capture] BUY_CAPTURE_MISSING_SOURCE: No supplier quotation for ITEM-1. Recovery: Capture the supplier quotation first.",
      ],
    },
  );
  // Uncaught, the agent gets the same coded message.
  await assertRejects(
    () =>
      runCodeProgram(
        'return await erp.call("erpnext_buy_capture", {})',
        [],
        failing,
      ),
    Error,
    "[erpnext_buy_capture] BUY_CAPTURE_MISSING_SOURCE: No supplier quotation for ITEM-1. Recovery:",
  );
});

Deno.test("a write the program never consumes is never sent, even if it awaits other calls afterwards", async () => {
  const sent: string[] = [];
  const call = (name: string) => {
    sent.push(name);
    return Promise.resolve({ data: { name } });
  };
  const writes = new Set(["submit"]);
  const unsent = async (program: string) => {
    sent.length = 0;
    const error = await assertRejects(
      () => runCodeProgram(program, [], call, writes),
      CodeModeError,
    );
    assertEquals(error.code, "UNAWAITED_CALLS");
    assertEquals(sent.includes("submit"), false, program);
  };
  // Created before an awaited read: a FIFO queue used to send it first.
  await unsent(
    'erp.call("submit", {}); return (await erp.call("read", {})).name',
  );
  // Returning the read's native receipt or selecting panels does not mask it.
  await unsent('erp.call("submit", {}); return await erp.call("read", {})');
  await unsent(
    'erp.call("submit", {}); const r = await erp.call("read", {}); erp.panel(r); return null',
  );
  // A toJSON that starts a write while the result is serialized.
  await unsent(
    'return { toJSON() { erp.call("submit", {}).then(() => {}); return 1; } }',
  );

  // Consumed calls run in order: await, then/catch and Promise.all all start them.
  sent.length = 0;
  assertEquals(
    await runCodeProgram(
      `
      const read = erp.call("read", {});
      const submitted = await erp.call("submit", {}).then((r) => r.name);
      const [a, b] = await Promise.all([read, erp.call("read", {})]);
      return [submitted, a.name, b.name];
    `,
      [],
      call,
      writes,
    ),
    { value: ["submit", "read", "read"] },
  );
  assertEquals(sent, ["submit", "read", "read"]);
});

Deno.test("a caught and rethrown ERP error keeps its code despite circular or shadowed properties", async () => {
  const coded =
    "[erpnext_doc_list] INVALID_FILTER: filters[0] is malformed. Recovery: Send [field, operator, value].";
  const failing = () => Promise.reject(new Error(coded));
  await assertRejects(
    () =>
      runCodeProgram(
        'try { await erp.call("list", {}); } catch (e) { e.self = e; throw e; }',
        [],
        failing,
      ),
    Error,
    coded,
  );
  assertEquals(
    await runCodeProgram(
      `Object.defineProperty(Error.prototype, "code", { value: "SHADOW", writable: false });
       try { await erp.call("list", {}); } catch (e) { return e.code; }`,
      [],
      failing,
    ),
    { value: "INVALID_FILTER" },
  );
});

Deno.test("a lazy call sends the arguments it was created with and fails once", async () => {
  const seen: unknown[] = [];
  const call = (_name: string, args: Record<string, unknown>) => {
    seen.push(args);
    return Promise.resolve({ data: { ok: true } });
  };
  // Editing the argument object after creating the call does not change it.
  await runCodeProgram(
    'const args = { status: "Open" }; const pending = erp.call("update", args); args.status = "Closed"; await pending; return 1',
    [],
    call,
    new Set(["update"]),
  );
  assertEquals(seen, [{ status: "Open" }]);
  // Invalid arguments fail where the call is written, not when it is awaited.
  await assertRejects(
    () => runCodeProgram('const p = erp.call("read", []); return 1', [], call),
    Error,
    "Expected an argument object",
  );
  // A start that fails (here the call budget) is not retried by consuming again.
  seen.length = 0;
  assertEquals(
    await runCodeProgram(
      `
      for (let i = 0; i < 12; i++) await erp.call("read", {});
      const last = erp.call("read", {});
      const settled = await Promise.allSettled(Array(20).fill(last));
      return settled.filter((s) => s.status === "rejected" && s.reason.code === "CALL_LIMIT").length;
    `,
      [],
      call,
    ),
    { value: 20 },
  );
  assertEquals(seen.length, 12);
});

Deno.test("a program that only starts a write reports it unsent rather than a serialization error", async () => {
  const error = await assertRejects(
    () =>
      runCodeProgram(
        'erp.call("submit", {})',
        [],
        () => Promise.resolve({ data: {} }),
        new Set(["submit"]),
      ),
    CodeModeError,
  );
  assertEquals(error.code, "UNAWAITED_CALLS");
});
