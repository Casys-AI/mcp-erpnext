import { assertEquals, assertFalse } from "@std/assert";

Deno.test("document titles stay readable independently of the explicit pin at every size", async () => {
  const source = await Deno.readTextFile(
    new URL("./DocumentHeader.tsx", import.meta.url),
  );
  assertEquals([...source.matchAll(/<h2 /g)].length, 2);
  assertEquals(
    [...source.matchAll(/<DocumentPin target=\{contextTarget\}/g)].length,
    2,
  );
  assertFalse(source.includes("contextInteractionProps"));
});
