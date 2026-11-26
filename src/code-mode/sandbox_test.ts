import { assertEquals, assertRejects } from "@std/assert";
import { runCodeProgram, SuspendCodeMode } from "./sandbox.ts";

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
  assertEquals(
    await runCodeProgram('erp.call("unused",{}); return 7', [], () => {
      throw new Error("Unawaited read should have been discarded");
    }),
    { value: 7 },
  );
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
