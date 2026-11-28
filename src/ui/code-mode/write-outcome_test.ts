import { assert, assertEquals } from "@std/assert";
import { writeOutcomeContext } from "./write-outcome.ts";

Deno.test("a cancellation confirmed in the app reaches the model with its code and what was sent", () => {
  const message =
    "[execute] CHANGE_CANCELLED: The user cancelled erpnext_doc_submit. Already sent to ERPNext in this program: erpnext_doc_create. Recovery: Check these records in ERPNext and tell the user what changed; do not repeat them, and ask before proposing another change.";
  const context = writeOutcomeContext({
    content: [{ type: "text", text: message }],
    isError: true,
  });
  assertEquals(context.structuredContent.erpnextWriteOutcome, {
    status: "cancelled",
    code: "CHANGE_CANCELLED",
    message,
  });
  assertEquals(
    context.content[0].text,
    `The user cancelled the ERPNext change in the app.\n${message}`,
  );
});

Deno.test("completed and failed confirmations are told apart and bounded", () => {
  const completed = writeOutcomeContext({
    content: [{ type: "text", text: "Sales Invoice SINV-1 submitted." }],
  });
  assertEquals(completed.structuredContent.erpnextWriteOutcome, {
    status: "finished",
    message: "Sales Invoice SINV-1 submitted.",
  });
  assertEquals(
    completed.content[0].text,
    "The user approved the ERPNext change in the app, and the program finished. Its result:\nSales Invoice SINV-1 submitted.",
  );

  const failed = writeOutcomeContext({
    content: [{
      type: "text",
      text:
        "[execute] WRITE_APPLIED_THEN_FAILED: ERPNext completed erpnext_doc_submit, but the program could not finish. Recovery: Check the record.",
    }],
    isError: true,
  });
  assertEquals(failed.structuredContent.erpnextWriteOutcome.status, "failed");
  assert(
    failed.content[0].text.startsWith(
      "An approved ERPNext change may have been applied, but the program did not finish.",
    ),
  );
  assertEquals(
    failed.structuredContent.erpnextWriteOutcome.code,
    "WRITE_APPLIED_THEN_FAILED",
  );

  const long = writeOutcomeContext({
    content: [
      { type: "text", text: "x".repeat(5_000) },
      { type: "image", text: "ignored" },
    ],
  });
  const kept = long.structuredContent.erpnextWriteOutcome.message;
  assertEquals(kept.length, 1_000);
  assert(kept.endsWith("…"));

  const silent = writeOutcomeContext({ content: [], isError: true });
  assertEquals(silent.structuredContent.erpnextWriteOutcome, {
    status: "failed",
    message: "",
  });
  assertEquals(
    silent.content[0].text,
    "The program did not finish after the user's decision in the app.",
  );
});
