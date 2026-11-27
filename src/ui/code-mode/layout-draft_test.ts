import { assertEquals } from "@std/assert";
import { createLayoutPublisher, type LayoutReceipt } from "./layout-draft.ts";

Deno.test("only the latest staged revision becomes ready after out-of-order responses", async () => {
  const first = Promise.withResolvers<void>();
  const receipts: LayoutReceipt[] = [];
  const shown: string[] = [];
  const lifetime = new AbortController();
  const publish = createLayoutPublisher(
    "ref",
    lifetime.signal,
    (_, rev) => rev === 1 ? first.promise : Promise.resolve(),
    (receipt) => {
      receipts.push(receipt);
      return Promise.resolve();
    },
    (status) => shown.push(status),
  );
  const slow = publish("moved");
  await publish("moved and resized");
  first.resolve();
  await slow;
  assertEquals(receipts.map(({ revision, status }) => [revision, status]), [
    [1, "pending"],
    [2, "pending"],
    [2, "ready"],
  ]);
  assertEquals(shown, ["pending", "pending", "ready"]);
  lifetime.abort();
  await publish("late");
  assertEquals(receipts.length, 3);
});

Deno.test("failed staging exposes a failed receipt, and retry receives a fresh revision", async () => {
  const receipts: LayoutReceipt[] = [];
  const publish = createLayoutPublisher(
    "ref",
    new AbortController().signal,
    (_, rev) =>
      rev === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(),
    (receipt) => {
      receipts.push(receipt);
      return Promise.resolve();
    },
    () => {},
  );
  await publish("wide");
  await publish("wide");
  assertEquals(receipts.map(({ revision, status }) => [revision, status]), [
    [1, "pending"],
    [1, "failed"],
    [2, "pending"],
    [2, "ready"],
  ]);
});
