import { assertEquals } from "@std/assert";
import {
  capabilitiesForProfile,
  channelsForProfile,
  resolveCapabilityProfile,
} from "./capabilities.ts";

Deno.test("dev-host capabilities - maps the five profiles exactly", () => {
  assertEquals(capabilitiesForProfile("full"), {
    serverTools: {},
    updateModelContext: { text: {} },
    message: { text: {} },
  });
  assertEquals(capabilitiesForProfile("serverTools-only"), {
    serverTools: {},
  });
  assertEquals(capabilitiesForProfile("context-only"), {
    updateModelContext: { text: {} },
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
    "updateModelContext",
    "message",
  ]);
  assertEquals(channelsForProfile("serverTools-only"), ["serverTools"]);
  assertEquals(channelsForProfile("context-only"), ["updateModelContext"]);
  assertEquals(channelsForProfile("message-only"), ["message"]);
  assertEquals(channelsForProfile("none"), []);
});
