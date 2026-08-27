import { assertEquals, assertThrows } from "@std/assert";
import type { EmbeddedDownloadResource } from "./attachment-results.ts";
import {
  attachmentPreviewKind,
  attachmentTextPreview,
  base64ByteLength,
  base64Bytes,
  isAttachmentPreviewCandidate,
  normalizedMimeType,
  prepareAttachmentPreview,
  resourceFromPreparedPreview,
} from "./attachment-preview.ts";

function resource(
  mimeType: string | undefined,
  bytes: string,
): EmbeddedDownloadResource {
  return {
    type: "resource",
    resource: {
      uri: "file:///preview",
      ...(mimeType ? { mimeType } : {}),
      blob: btoa(bytes),
    },
  };
}

function utf8Resource(
  mimeType: string,
  text: string,
): EmbeddedDownloadResource {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return resource(mimeType, binary);
}

Deno.test("attachment preview candidates are conservative and case-insensitive", () => {
  assertEquals(isAttachmentPreviewCandidate("invoice.PDF"), true);
  assertEquals(isAttachmentPreviewCandidate("photo.webp"), true);
  assertEquals(isAttachmentPreviewCandidate("payload.json"), true);
  assertEquals(isAttachmentPreviewCandidate("vector.svg"), false);
  assertEquals(isAttachmentPreviewCandidate("page.html"), false);
  assertEquals(isAttachmentPreviewCandidate("archive.zip"), false);
  assertEquals(isAttachmentPreviewCandidate("README"), false);
});

Deno.test("attachment preview trusts a narrow MIME allowlist", () => {
  const png = String.fromCharCode(
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  );
  assertEquals(attachmentPreviewKind(resource("image/png", png)), "image");
  assertEquals(
    attachmentPreviewKind(resource("text/plain; charset=utf-8", "hello")),
    "text",
  );
  assertEquals(
    attachmentPreviewKind(resource("application/json", "{}")),
    "text",
  );
  assertEquals(
    attachmentPreviewKind(resource("application/pdf", "%PDF-1.7")),
    "pdf",
  );
  assertEquals(
    attachmentPreviewKind(resource("application/pdf", "not a pdf")),
    "unsupported",
  );
  assertEquals(
    attachmentPreviewKind(resource("image/svg+xml", "<svg/>")),
    "unsupported",
  );
  assertEquals(
    attachmentPreviewKind(resource("text/html", "<script/>")),
    "unsupported",
  );
  assertEquals(
    attachmentPreviewKind(resource("application/octet-stream", "%PDF-1.7")),
    "unsupported",
  );
});

Deno.test("attachment text preview decodes UTF-8 and reports truncation", () => {
  const preview = attachmentTextPreview(
    utf8Resource("text/plain", "caf\u00e9 and more"),
    5,
  );
  assertEquals(preview.text, "caf\u00e9");
  assertEquals(preview.truncated, true);
  assertEquals(preview.byteLength, 14);
});

Deno.test("attachment binary helpers reject mismatched content", () => {
  assertEquals([...base64Bytes(btoa("AB"))], [65, 66]);
  assertEquals(base64ByteLength(btoa("AB")), 2);
  assertEquals(normalizedMimeType(" IMAGE/PNG ; charset=x "), "image/png");
  assertThrows(() => base64Bytes("not base64"));
  assertThrows(() =>
    attachmentTextPreview(resource("application/pdf", "%PDF"))
  );
  assertThrows(() => attachmentTextPreview(resource("text/plain", "x"), 0));
});

Deno.test("prepared previews discard transport base64 and can recreate downloads", () => {
  const source = resource("text/plain", "hello");
  const prepared = prepareAttachmentPreview(source);
  assertEquals(prepared.kind, "text");
  assertEquals(prepared.text, "hello");
  assertEquals([...prepared.bytes], [104, 101, 108, 108, 111]);
  assertEquals(resourceFromPreparedPreview(prepared), source);
});

Deno.test("malformed UTF-8 is download-only", () => {
  const malformed = resource("text/plain", String.fromCharCode(0xc3, 0x28));
  assertEquals(prepareAttachmentPreview(malformed).kind, "unsupported");
  assertThrows(() => attachmentTextPreview(malformed));
});
