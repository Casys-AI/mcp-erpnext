import { assertEquals } from "@std/assert";
import {
  canSendTextMessage,
  sendTextMessage,
  type TextMessageCapabilities,
  type TextMessageHost,
} from "./host-message.ts";

function host(
  caps: TextMessageCapabilities | undefined,
  result: unknown = {},
): TextMessageHost & { calls: number } {
  return {
    calls: 0,
    getHostCapabilities: () => caps,
    sendMessage(params) {
      this.calls += 1;
      assertEquals(params.content[0]?.type, "text");
      return Promise.resolve(result);
    },
  };
}

Deno.test("message host : seule message.text autorise l'envoi", () => {
  assertEquals(canSendTextMessage(undefined), false);
  assertEquals(canSendTextMessage({ serverTools: {} }), false);
  assertEquals(canSendTextMessage({ message: {} }), false);
  assertEquals(
    canSendTextMessage({ message: { text: {} }, serverTools: {} }),
    true,
  );
});

Deno.test("sendTextMessage : serverTools seul n'appelle jamais sendMessage", async () => {
  const app = host({ serverTools: {} });
  assertEquals(await sendTextMessage(app, "detail"), false);
  assertEquals(app.calls, 0);
});

Deno.test("sendTextMessage : message.text transmet le texte", async () => {
  const app = host({ message: { text: {} } });
  assertEquals(await sendTextMessage(app, "detail"), true);
  assertEquals(app.calls, 1);
});

Deno.test("sendTextMessage : isError et exception sont des échecs", async () => {
  const rejected = host({ message: { text: {} } }, { isError: true });
  assertEquals(await sendTextMessage(rejected, "detail"), false);
  assertEquals(rejected.calls, 1);

  const thrown: TextMessageHost = {
    getHostCapabilities: () => ({ message: { text: {} } }),
    sendMessage: () => Promise.reject(new Error("refus")),
  };
  assertEquals(await sendTextMessage(thrown, "detail"), false);
});
