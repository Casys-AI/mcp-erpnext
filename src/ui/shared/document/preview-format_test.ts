import { assertEquals } from "@std/assert";
import { setLocaleSource } from "../format.ts";
import { formatDocumentPreviewText } from "./preview-format.ts";

setLocaleSource(() => "fr-FR");

Deno.test("preview formats ERPNext civil dates without changing their day", () => {
  assertEquals(formatDocumentPreviewText("2026-09-30"), "30/09/2026");
  assertEquals(formatDocumentPreviewText("2028-02-29"), "29/02/2028");
});

Deno.test("preview formats Frappe timestamps and omits their microsecond noise", () => {
  assertEquals(
    formatDocumentPreviewText("2026-09-30 00:05:42.277831"),
    "30/09/2026 00:05:42",
  );
  assertEquals(
    formatDocumentPreviewText("2026-09-30T23:59:59"),
    "30/09/2026 23:59:59",
  );
  assertEquals(
    formatDocumentPreviewText("2026-09-30 14:25"),
    "30/09/2026 14:25",
  );
});

Deno.test("preview leaves invalid dates, identifiers, and prose unchanged", () => {
  for (
    const value of [
      "",
      "SAL-ORD-2026-00043",
      "Due on 2026-09-30",
      "2026-02-29",
      "2026-09-31",
      "2026-13-01",
      "2026-09-30 25:00:00",
      "2026-09-30 12:60:00",
      "2026-09-30 12:00:60",
    ]
  ) {
    assertEquals(formatDocumentPreviewText(value), value);
  }
});

Deno.test("preview follows the host locale without rewriting raw values", () => {
  try {
    setLocaleSource(() => "en-US");
    assertEquals(formatDocumentPreviewText("2026-09-30"), "09/30/2026");
    setLocaleSource(() => "zh-TW");
    assertEquals(formatDocumentPreviewText("2026-09-30"), "2026/09/30");
  } finally {
    setLocaleSource(() => "fr-FR");
  }
});
