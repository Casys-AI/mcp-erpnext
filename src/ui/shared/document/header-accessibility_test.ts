import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";

Deno.test("document titles expose context on their identity in both layouts", async () => {
  const source = await Deno.readTextFile(
    new URL("./DocumentHeader.tsx", import.meta.url),
  );
  assertEquals([...source.matchAll(/<h2 /g)].length, 2);
  assertFalse(source.includes("DocumentPin"));
  assertStringIncludes(source, "contextTarget?.selected");
  assertEquals([...source.matchAll(/CONTEXT_ROW_OUTLINE/g)].length, 3);
  assertFalse(source.includes("contextInteractionProps"));
  assertStringIncludes(source, "onToggle: () => contextTarget?.onActivate()");
  assertEquals([...source.matchAll(/\.\.\.identityProps/g)].length, 2);
});
