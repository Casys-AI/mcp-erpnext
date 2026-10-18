import { assert, assertStringIncludes } from "@std/assert";
import { ACTIVE_CONTEXT_INSTRUCTIONS } from "./server-instructions.ts";
import {
  ACTIVE_CONTEXT_SCHEMA,
  ACTIVE_CONTEXT_VERSION,
} from "./ui/shared/active-context.ts";

Deno.test("server instructions describe active context in under 900 characters", () => {
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, ACTIVE_CONTEXT_SCHEMA);
  assertStringIncludes(
    ACTIVE_CONTEXT_INSTRUCTIONS,
    `version ${ACTIVE_CONTEXT_VERSION}`,
  );
  assertStringIncludes(
    ACTIVE_CONTEXT_INSTRUCTIONS,
    "{id, view, label, value?, fields?, query?}",
  );
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "version 3");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "compact record");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "query.tool");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "query.args");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "truncated: true");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "includedCount");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "record:<doctype>:<name>");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "name argument");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "*_get");
  assertStringIncludes(ACTIVE_CONTEXT_INSTRUCTIONS, "erpnext_doc_get");
  assert(ACTIVE_CONTEXT_INSTRUCTIONS.length < 900);
});

Deno.test("server.ts passes active context instructions to McpApp", async () => {
  // Le bootstrap démarre le serveur à l'import ; son câblage est vérifié à la source.
  const source = await Deno.readTextFile(
    new URL("../server.ts", import.meta.url),
  );
  assert(
    /import\s*\{\s*ACTIVE_CONTEXT_INSTRUCTIONS\s*\}\s*from\s*"\.\/src\/server-instructions\.ts"/
      .test(source),
  );
  assert(
    /new McpApp\(\{[^}]*instructions:\s*ACTIVE_CONTEXT_INSTRUCTIONS\s*[,}]/s
      .test(source),
  );
});
