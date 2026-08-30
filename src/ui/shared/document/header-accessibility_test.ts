import { assert, assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("document header keeps headings outside the context button", async () => {
  const source = await Deno.readTextFile(
    new URL("./DocumentHeader.tsx", import.meta.url),
  );

  assertStringIncludes(source, "function DocumentContextButton");
  assertStringIncludes(source, '<button\n      type="button"');
  assertEquals(
    [...source.matchAll(/<h2 /g)].length,
    2,
  );
  assert(
    !source.includes(
      "<div\n          {...contextInteractionProps(contextTarget)}",
    ),
  );
});
