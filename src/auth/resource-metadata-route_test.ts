import { assertEquals } from "@std/assert";
import { createStaticTokenAuthProvider } from "@casys/mcp-server";
import { resourceMetadataRoute } from "./resource-metadata-route.ts";

Deno.test("resourceMetadataRoute: serves RFC 9728 metadata for a path resource", async () => {
  const provider = createStaticTokenAuthProvider(
    ["test-token"],
    { resource: "https://mcp.example.com/mcp" },
  );
  const route = resourceMetadataRoute(provider);

  assertEquals(route?.method, "get");
  assertEquals(route?.path, "/.well-known/oauth-protected-resource/mcp");

  const response = await route!.handler(
    new Request(
      "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
    ),
  );
  assertEquals(response.status, 200);
  assertEquals(
    await response.json(),
    JSON.parse(JSON.stringify(provider.getResourceMetadata())),
  );
});

Deno.test("resourceMetadataRoute: leaves the framework-owned root route alone", () => {
  const provider = createStaticTokenAuthProvider(
    ["test-token"],
    { resource: "https://mcp.example.com" },
  );
  const route = resourceMetadataRoute(provider);

  assertEquals(route, undefined);
});
