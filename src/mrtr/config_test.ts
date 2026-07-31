import { assertEquals, assertThrows } from "@std/assert";
import { loadMrtrConfig } from "./config.ts";

const KEY = "0123456789abcdef".repeat(4);

Deno.test("loadMrtrConfig - stays disabled when the key is absent", () => {
  using _ = withSigningKey();
  assertEquals(loadMrtrConfig(), undefined);
});

Deno.test("loadMrtrConfig - returns a valid shared signing key", () => {
  using _ = withSigningKey(KEY);
  assertEquals(loadMrtrConfig(), { signingKey: KEY });
});

Deno.test("loadMrtrConfig - tolerates env-file quotes", () => {
  using _ = withSigningKey(`"${KEY}"`);
  assertEquals(loadMrtrConfig(), { signingKey: KEY });
});

Deno.test("loadMrtrConfig - rejects malformed or uppercase keys", () => {
  for (const value of ["abc", "A".repeat(64), "g".repeat(64)]) {
    using _ = withSigningKey(value);
    assertThrows(
      () => loadMrtrConfig(),
      Error,
      "exactly 64 lowercase hex characters",
    );
  }
});

function withSigningKey(value?: string): Disposable {
  const previous = Deno.env.get("MCP_MRTR_SIGNING_KEY");
  Deno.env.delete("MCP_MRTR_SIGNING_KEY");
  if (value !== undefined) Deno.env.set("MCP_MRTR_SIGNING_KEY", value);

  return {
    [Symbol.dispose]() {
      Deno.env.delete("MCP_MRTR_SIGNING_KEY");
      if (previous !== undefined) {
        Deno.env.set("MCP_MRTR_SIGNING_KEY", previous);
      }
    },
  };
}
