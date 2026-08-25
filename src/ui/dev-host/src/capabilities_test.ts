import { assertEquals } from "@std/assert";
import {
  capabilitiesForProfile,
  channelsForProfile,
  resolveCapabilityProfile,
} from "./capabilities.ts";

Deno.test("dev-host capabilities - maps the five profiles exactly", () => {
  assertEquals(capabilitiesForProfile("full"), {
    serverTools: {},
    downloadFile: {},
    updateModelContext: { text: {}, resource: {} },
    message: { text: {} },
  });
  assertEquals(capabilitiesForProfile("serverTools-only"), {
    serverTools: {},
  });
  assertEquals(capabilitiesForProfile("context-only"), {
    updateModelContext: { text: {}, resource: {} },
  });
  assertEquals(capabilitiesForProfile("message-only"), {
    message: { text: {} },
  });
  assertEquals(capabilitiesForProfile("none"), {});
});

Deno.test("dev-host capabilities - preserves legacy URL aliases", () => {
  assertEquals(resolveCapabilityProfile("tools"), "full");
  assertEquals(resolveCapabilityProfile("context"), "context-only");
  assertEquals(resolveCapabilityProfile("message"), "message-only");
  assertEquals(resolveCapabilityProfile("unknown"), null);
  assertEquals(resolveCapabilityProfile(null), null);
});

Deno.test("dev-host capabilities - exposes journal channel names", () => {
  assertEquals(channelsForProfile("full"), [
    "serverTools",
    "downloadFile",
    "updateModelContext",
    "message",
  ]);
  assertEquals(channelsForProfile("serverTools-only"), ["serverTools"]);
  assertEquals(channelsForProfile("context-only"), ["updateModelContext"]);
  assertEquals(channelsForProfile("message-only"), ["message"]);
  assertEquals(channelsForProfile("none"), []);
});

Deno.test("dev-host capabilities - keeps download fail-closed outside full", () => {
  for (
    const profile of [
      "serverTools-only",
      "context-only",
      "message-only",
      "none",
    ] as const
  ) {
    assertEquals("downloadFile" in capabilitiesForProfile(profile), false);
  }
});

Deno.test("dev-host capabilities - exposes resources only with model context", () => {
  assertEquals(
    capabilitiesForProfile("full").updateModelContext?.resource,
    {},
  );
  assertEquals(
    capabilitiesForProfile("context-only").updateModelContext?.resource,
    {},
  );
  for (
    const profile of ["serverTools-only", "message-only", "none"] as const
  ) {
    assertEquals(
      capabilitiesForProfile(profile).updateModelContext?.resource,
      undefined,
    );
  }
});
