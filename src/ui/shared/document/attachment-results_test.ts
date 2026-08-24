import { assertEquals, assertThrows } from "@std/assert";
import {
  attachmentListFromToolResult,
  downloadResourceFromToolResult,
} from "./attachment-results.ts";

Deno.test("attachment list keeps canonical File ids and ignores URLs", () => {
  const files = attachmentListFromToolResult({
    content: [{
      type: "text",
      text: JSON.stringify({
        count: 1,
        data: [{
          name: "FILE-7",
          file_name: "report.pdf",
          file_url: "https://attacker.invalid/report.pdf",
          file_size: 42,
          is_private: 1,
          owner: "alice@example.com",
        }],
      }),
    }],
  });

  assertEquals(files, [{
    id: "FILE-7",
    fileName: "report.pdf",
    fileSize: 42,
    isPrivate: true,
    owner: "alice@example.com",
    attachedToField: undefined,
    createdAt: undefined,
    modifiedAt: undefined,
  }]);
  assertEquals("fileUrl" in files[0], false);
});

Deno.test("attachment list rejects rows without canonical identity", () => {
  assertThrows(
    () =>
      attachmentListFromToolResult({
        structuredContent: { data: [{ file_name: "report.pdf" }] },
      }),
    Error,
    "canonical identity",
  );
});

Deno.test("download extracts one exact embedded resource", () => {
  const resource = downloadResourceFromToolResult({
    content: [
      { type: "text", text: "download ready" },
      {
        type: "resource",
        resource: {
          uri: "file:///report.pdf",
          mimeType: "application/pdf",
          blob: "JVBERg==",
        },
      },
    ],
  });
  assertEquals(resource, {
    type: "resource",
    resource: {
      uri: "file:///report.pdf",
      mimeType: "application/pdf",
      blob: "JVBERg==",
    },
  });
});

Deno.test("download rejects links and ambiguous multiple resources", () => {
  assertThrows(
    () =>
      downloadResourceFromToolResult({
        content: [{
          type: "resource_link",
          uri: "https://example.invalid/report.pdf",
          name: "report.pdf",
        }],
      }),
    Error,
    "one inline resource",
  );
  assertThrows(
    () =>
      downloadResourceFromToolResult({
        content: [
          { type: "resource", resource: { uri: "file:///a", blob: "YQ==" } },
          { type: "resource", resource: { uri: "file:///b", blob: "Yg==" } },
        ],
      }),
    Error,
    "one inline resource",
  );
});
