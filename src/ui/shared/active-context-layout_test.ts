import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";

Deno.test("context chip reserves a full-width fixed-height slot even when empty", async () => {
  const chip = await Deno.readTextFile(
    new URL("./ActiveContextChip.tsx", import.meta.url),
  );
  assertEquals(
    chip.slice(chip.indexOf("export function ActiveContextChip")).includes(
      "return null",
    ),
    false,
  );
  assertMatch(
    chip,
    /data-context-slot[\s\S]*?relative flex h-8 w-full shrink-0/,
  );
  assertEquals(chip.includes('&& "flex-wrap"'), false);
  assertEquals(chip.includes("basis-full"), false);
});

Deno.test("context notices remain readable inline badges inside the chip", async () => {
  const chip = await Deno.readTextFile(
    new URL("./ActiveContextChip.tsx", import.meta.url),
  );
  assertMatch(chip, /data-context-chip[\s\S]*?data-context-notices/);
  assertMatch(
    chip,
    /data-context-notices[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/,
  );
  assertStringIncludes(chip, "shrink-0 whitespace-nowrap rounded-badge");
  assertStringIncludes(chip, "overflow-x-auto");
  assertEquals(chip.includes("{singleItem.summary}"), true);
});
