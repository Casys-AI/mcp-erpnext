import { assert, assertEquals } from "@std/assert";

import { DEMO_CATALOGUE_ERROR_CODES } from "./demo-catalogue.ts";

const ROOT = new URL("../../", import.meta.url);
const SCRIPT = new URL("scripts/buy-plan-demo-catalogue.ts", ROOT).pathname;

Deno.test("demo catalogue CLI returns plans and structured input failures", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const malformed = `${directory}/malformed.json`;
    await Deno.writeTextFile(malformed, "{invalid");
    for (
      const [path, code] of [
        [
          new URL("docs/demo-catalogue.unpriced-example.json", ROOT).pathname,
          null,
        ],
        [malformed, "DEMO_CATALOGUE_INVALID_INPUT"],
        [`${directory}/absent.json`, "DEMO_CATALOGUE_UNREADABLE_INPUT"],
      ] as const
    ) {
      const result = await new Deno.Command(Deno.execPath(), {
        cwd: ROOT.pathname,
        args: [
          "run",
          "--cached-only",
          "--no-prompt",
          "--allow-read",
          SCRIPT,
          "--input",
          path,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const decoder = new TextDecoder();
      if (code === null) {
        assertEquals(result.code, 0);
        assertEquals(decoder.decode(result.stderr), "");
        const plan = JSON.parse(decoder.decode(result.stdout));
        assertEquals(plan.schema, "demo-catalogue-plan/1.0");
        assertEquals(plan.grants, "none");
        assertEquals(plan.observations[0].priced, false);
      } else {
        assertEquals(result.code, 1);
        assertEquals(decoder.decode(result.stdout), "");
        const error = JSON.parse(decoder.decode(result.stderr));
        assertEquals(error.error, code);
        assert(DEMO_CATALOGUE_ERROR_CODES.includes(error.error));
        assertEquals(typeof error.message, "string");
        assertEquals(typeof error.context, "object");
        assertEquals(typeof error.recovery, "string");
      }
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
