import { assertEquals, assertThrows } from "@std/assert";
import {
  canonicalJson,
  canonicalTimestamp,
  decimalString,
  fingerprint,
  sha256Fingerprint,
  sha256FingerprintOfUtf8,
  utf8ByteCount,
} from "./json.ts";

Deno.test("canonical JSON sorts object keys recursively and keeps array order", () => {
  const text = canonicalJson({
    b: 1,
    a: [{ z: true, y: "x" }, { y: "w", z: false }],
  }, "sample");
  assertEquals(text, '{"a":[{"y":"x","z":true},{"y":"w","z":false}],"b":1}');
});

Deno.test("canonical JSON refuses non-finite numbers and undefined", () => {
  assertThrows(
    () => canonicalJson({ n: Number.POSITIVE_INFINITY }, "sample"),
    TypeError,
    "finite",
  );
  assertThrows(
    () => canonicalJson({ n: undefined }, "sample"),
    TypeError,
    "undefined",
  );
});

Deno.test("fingerprint is SHA-256 of canonical UTF-8 bytes", async () => {
  const value = {
    schemaVersion: "io.casys.mcp-erpnext.buy-source-capture/1.0",
  };
  const text = canonicalJson(value, "sample");
  const expected = await sha256FingerprintOfUtf8(text);
  assertEquals(await sha256Fingerprint(value, "sample"), expected);
  assertEquals(utf8ByteCount(text), new TextEncoder().encode(text).byteLength);
  fingerprint(expected, "sample");
});

Deno.test("canonical timestamps must be UTC milliseconds", () => {
  assertEquals(
    canonicalTimestamp("2026-09-12T10:00:00.000Z", "t"),
    "2026-09-12T10:00:00.000Z",
  );
  assertThrows(
    () => canonicalTimestamp("2026-09-12T10:00:00Z", "t"),
    TypeError,
  );
  assertThrows(
    () => canonicalTimestamp("2026-09-12T12:00:00.000+02:00", "t"),
    TypeError,
  );
});

Deno.test("decimal strings refuse scientific notation and padding", () => {
  assertEquals(decimalString("12.50", "qty"), "12.50");
  assertEquals(decimalString("0", "qty"), "0");
  assertThrows(() => decimalString("1e2", "qty"), TypeError);
  assertThrows(() => decimalString(" 1", "qty"), TypeError);
  assertThrows(() => decimalString(1, "qty"), TypeError);
});
