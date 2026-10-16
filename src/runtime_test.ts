import { assertEquals } from "@std/assert";
import { netPermission as denoNetPermission } from "./runtime.deno.ts";
import { netPermission as nodeNetPermission } from "./runtime.node.ts";

type FakePermissions = {
  querySync: (d: { name: string; host?: string }) => { state: string };
};

function withPermissions<T>(fake: unknown, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(Deno, "permissions");
  Object.defineProperty(Deno, "permissions", {
    value: fake,
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(Deno, "permissions", original);
  }
}

Deno.test("netPermission (Deno) forwards the queried state for the exact host:port", () => {
  const asked: Array<{ name: string; host?: string }> = [];
  for (const state of ["granted", "denied", "prompt"] as const) {
    const fake: FakePermissions = {
      querySync: (descriptor) => {
        asked.push(descriptor);
        return { state };
      },
    };
    assertEquals(
      withPermissions(fake, () => denoNetPermission("jsr.io:443")),
      state,
    );
  }
  assertEquals(asked[0], { name: "net", host: "jsr.io:443" });
});

Deno.test("netPermission (Deno) fails open when the permission API is unavailable", () => {
  assertEquals(
    withPermissions(undefined, () => denoNetPermission("jsr.io:443")),
    "granted",
  );
  assertEquals(
    withPermissions({
      querySync: () => {
        throw new TypeError("nope");
      },
    }, () => denoNetPermission("jsr.io:443")),
    "granted",
  );
});

Deno.test("netPermission (Node) is always granted", () => {
  assertEquals(nodeNetPermission("jsr.io:443"), "granted");
});
