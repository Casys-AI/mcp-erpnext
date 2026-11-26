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
