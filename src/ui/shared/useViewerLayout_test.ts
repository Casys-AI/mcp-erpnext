import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("coarse pointer is read before the first paint", async () => {
  const source = await Deno.readTextFile(
    new URL("./useViewerLayout.ts", import.meta.url),
  );
  const hookStart = source.indexOf("function readCoarsePointer");
  const hookEnd = source.indexOf("function useTouchInput");
  assertEquals(hookStart >= 0 && hookEnd > hookStart, true);
  const hook = source.slice(hookStart, hookEnd);

  assertStringIncludes(hook, 'matchMedia("(pointer: coarse)")');
  assertStringIncludes(hook, "useState(readCoarsePointer)");
  assertEquals(
    hook.includes("useState(false)"),
    false,
    "un false initial peindrait panel puis mobile",
  );
  assertEquals(
    hook.includes("setCoarse(query.matches)"),
    false,
    "la lecture initiale ne doit plus vivre dans l'effet",
  );
});
