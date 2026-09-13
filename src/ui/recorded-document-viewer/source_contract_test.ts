import { assert, assertEquals, assertStringIncludes } from "@std/assert";

const SOURCES = [
  "./src/app.ts",
  "./src/model.ts",
  "./src/document-model.ts",
  "./src/components.tsx",
  "./src/main.tsx",
] as const;

async function readSources(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    SOURCES.map(async (source) => {
      const text = await Deno.readTextFile(
        new URL(source, import.meta.url),
      );
      return [source, text] as const;
    }),
  );
  return Object.fromEntries(entries);
}

Deno.test("recorded app composes DocumentSurface without live DocViewer hooks", async () => {
  const sources = await readSources();
  const all = Object.values(sources).join("\n");
  assertStringIncludes(sources["./src/components.tsx"], "DocumentSurface");
  assertStringIncludes(sources["./src/components.tsx"], "live={false}");
  assertStringIncludes(sources["./src/components.tsx"], "recorded.document");
  assertStringIncludes(sources["./src/app.ts"], "viewerSession");
  assertStringIncludes(sources["./src/app.ts"], "session-rejected");
  assertStringIncludes(sources["./src/app.ts"], "tool-result-rejected");
  assertStringIncludes(sources["./src/app.ts"], "createSerialQueue");
  assertStringIncludes(
    sources["./src/document-model.ts"],
    "documentModelOf",
  );
  for (
    const forbidden of [
      "DocViewer",
      "useAttachments",
      "useViewerNav",
      "useActiveContext",
      "LevelBody",
      "callServerTool",
      "sendMessage",
      "openLink",
      "updateModelContext",
      "refreshRequest",
      "documentEnvelopeOf",
      "erpnext_file_",
      "erpnext_doc_",
      "erpnext_task_get",
      "visibilitychange",
      "addEventListener",
      "dangerouslySetInnerHTML",
      "<a ",
      "<a>",
      "<img",
    ]
  ) {
    assertEquals(
      all.includes(forbidden),
      false,
      `recorded viewer sources must not contain ${forbidden}`,
    );
  }
  assertEquals(all.includes("fetch("), false);
});

Deno.test("live DocViewer keeps refresh and mutation hooks", async () => {
  const viewer = await Deno.readTextFile(
    new URL("../doc-viewer/src/DocViewer.tsx", import.meta.url),
  );
  assertStringIncludes(viewer, "callServerTool");
  assertStringIncludes(viewer, "REFRESH_INTERVAL_MS");
  assertStringIncludes(viewer, "useAttachments");
  assert(viewer.includes("erpnext_doc_submit") || viewer.includes("canSubmit"));
});
