import { assertEquals, assertThrows } from "@std/assert";
import {
  type AuthInfo,
  AuthProvider,
  type ProtectedResourceMetadata,
} from "@casys/mcp-server";
import { CompositeAuthProvider } from "./composite-provider.ts";

class FixedProvider extends AuthProvider {
  constructor(private readonly accepted: Set<string>) {
    super();
  }
  verifyToken(token: string): Promise<AuthInfo | null> {
    return Promise.resolve(
      this.accepted.has(token) ? { subject: "test-user", scopes: [] } : null,
    );
  }
  getResourceMetadata(): ProtectedResourceMetadata {
    // `resource_metadata_url`'s branded HttpsUrl type isn't constructible
    // outside the framework (its factory isn't part of the public export
    // surface) — cast is fine here since this fixture never touches
    // metadata serving, only verifyToken().
    return {
      resource: "https://mcp.example.com",
      resource_metadata_url:
        "https://mcp.example.com/.well-known/oauth-protected-resource",
      authorization_servers: [],
      bearer_methods_supported: ["header"],
    } as unknown as ProtectedResourceMetadata;
  }
}

Deno.test("CompositeAuthProvider: accepts a token the first provider accepts", async () => {
  const composite = new CompositeAuthProvider([
    new FixedProvider(new Set(["token-a"])),
    new FixedProvider(new Set(["token-b"])),
  ]);
  assertEquals((await composite.verifyToken("token-a")) !== null, true);
});

Deno.test("CompositeAuthProvider: accepts a token only the second provider accepts", async () => {
  const composite = new CompositeAuthProvider([
    new FixedProvider(new Set(["token-a"])),
    new FixedProvider(new Set(["token-b"])),
  ]);
  assertEquals((await composite.verifyToken("token-b")) !== null, true);
});

Deno.test("CompositeAuthProvider: rejects a token no provider accepts", async () => {
  const composite = new CompositeAuthProvider([
    new FixedProvider(new Set(["token-a"])),
    new FixedProvider(new Set(["token-b"])),
  ]);
  assertEquals(await composite.verifyToken("token-c"), null);
});

Deno.test("CompositeAuthProvider: throws when constructed with no providers", () => {
  assertThrows(
    () => new CompositeAuthProvider([]),
    Error,
    "at least one provider is required",
  );
});
