import { assert, assertEquals } from "@std/assert";
import { until, withDocument } from "@mcpview/components/testing";
import { createWriteApproval } from "./approval.ts";

function request(ticket: string) {
  return {
    content: [],
    _meta: {
      "io.casys/erpnext-write-confirmation": {
        ticket,
        operation: "erpnext_doc_update",
        arguments: { name: "<INV-1>" },
      },
    },
  };
}

Deno.test("write decisions require a click for each operation and consume a double click once", () =>
  withDocument(async (root) => {
    const sent: unknown[] = [];
    const done = {
      content: [{ type: "text" as const, text: "cancelled" }],
      isError: true,
    };
    const approval = createWriteApproval(root, {
      callServerTool(params) {
        sent.push(params);
        return Promise.resolve(sent.length === 1 ? request("next") : done);
      },
    });
    const result = approval.resolve(
      request("first"),
      new AbortController().signal,
    );
    const panel = root.previousElementSibling as HTMLElement;
    assertEquals(sent.length, 0);
    assertEquals(
      panel.querySelector("pre")?.textContent,
      '{\n  "name": "<INV-1>"\n}',
    );
    assert(!panel.textContent?.includes("first"));
    assert(root.inert);
    const approve = panel.querySelector("button")!;
    approve.click();
    approve.click();
    await until(
      () => approve.parentElement === null && !panel.hidden,
      "second confirmation",
    );
    const cancel = panel.querySelectorAll("button")[1];
    cancel.click();
    assertEquals(await result, done);
    assertEquals(sent, [
      {
        name: "erpnext_confirm_write",
        arguments: { ticket: "first", decision: "approve" },
      },
      {
        name: "erpnext_confirm_write",
        arguments: { ticket: "next", decision: "cancel" },
      },
    ]);
    assert(panel.hidden && !root.inert);
  }));

Deno.test("a decision answered after the dialog closed is handed back instead of dropped", () =>
  withDocument(async (root) => {
    let answer: (value: unknown) => void = () => {};
    const late: Array<[unknown, boolean]> = [];
    const approval = createWriteApproval(
      root,
      {
        callServerTool() {
          return new Promise((resolve) => (answer = resolve)) as never;
        },
      },
      { onLateResult: (result, more) => late.push([result, more]) },
    );
    const delivery = new AbortController();
    const pending = approval.resolve(request("first"), delivery.signal);
    const panel = root.previousElementSibling as HTMLElement;
    (panel.querySelector("button") as HTMLButtonElement).click();
    // A new result replaces the view while the approval is in flight.
    delivery.abort();
    await pending.catch(() => {});
    const committed = { content: [{ type: "text" as const, text: "done" }] };
    answer(committed);
    await until(() => late.length === 1, "late result");
    assertEquals(late, [[committed, false]]);

    // An answer that asks for a further approval is flagged as such.
    const second = new AbortController();
    const again = approval.resolve(request("second"), second.signal);
    (panel.querySelector("button") as HTMLButtonElement).click();
    second.abort();
    await again.catch(() => {});
    answer(request("third"));
    await until(() => late.length === 2, "second late result");
    assertEquals(late[1][1], true);
  }));
