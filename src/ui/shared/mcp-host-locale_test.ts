import { assertEquals } from "@std/assert";
import { hostLocalePatch } from "./mcp-host-locale.ts";

const parent = {};
const initialize = {
  jsonrpc: "2.0",
  id: "mcp-init",
  result: { hostContext: { locale: "ur-PK" } },
};
const change = {
  jsonrpc: "2.0",
  method: "ui/notifications/host-context-changed",
  params: { locale: "zh-Hant-TW" },
};

Deno.test("loader accepts locale only from the expected host window", () => {
  assertEquals(
    hostLocalePatch({ source: parent, data: initialize }, parent, false),
    { locale: "ur-PK" },
  );
  for (const source of [{}, null, undefined]) {
    assertEquals(
      hostLocalePatch({ source, data: initialize }, parent, false),
      undefined,
    );
    assertEquals(
      hostLocalePatch({ source, data: change }, parent, true),
      undefined,
    );
  }
  assertEquals(
    hostLocalePatch({ source: null, data: change }, null, true),
    undefined,
  );
});

Deno.test("loader locale notifications require an accepted initialization", () => {
  assertEquals(
    hostLocalePatch({ source: parent, data: change }, parent, false),
    undefined,
  );
  assertEquals(
    hostLocalePatch({ source: parent, data: change }, parent, true),
    { locale: "zh-Hant-TW" },
  );
  assertEquals(
    hostLocalePatch({ source: parent, data: initialize }, parent, true),
    undefined,
  );
});

Deno.test("loader rejects malformed and unrelated locale envelopes", () => {
  for (
    const data of [
      null,
      [],
      { ...initialize, jsonrpc: "1.0" },
      { ...initialize, id: "other-request" },
      { ...initialize, result: [] },
      {
        ...initialize,
        error: { code: -32000, message: "Initialization refused" },
      },
      { ...initialize, error: null },
      { ...initialize, result: { hostContext: { locale: 42 } } },
      { ...initialize, result: { hostContext: { theme: "dark" } } },
      { ...change, method: "ui/notifications/tool-result" },
      { ...change, params: { theme: "light" } },
      { ...change, params: { locale: null } },
    ]
  ) {
    assertEquals(
      hostLocalePatch({ source: parent, data }, parent, false),
      undefined,
    );
    assertEquals(
      hostLocalePatch({ source: parent, data }, parent, true),
      undefined,
    );
  }
});
