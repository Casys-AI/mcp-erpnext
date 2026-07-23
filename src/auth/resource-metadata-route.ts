import type {
  AuthProvider,
  ProtectedResourceMetadata,
} from "@casys/mcp-server";

type CustomHttpRoute = {
  method: "get";
  path: string;
  handler: (request: Request) => Response;
};

const ROOT_METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * McpApp serves the root metadata endpoint itself. When the resource includes
 * a path (for example `/mcp`), RFC 9728 requires that path after the
 * well-known segment, so register the corresponding alias alongside McpApp.
 */
export function resourceMetadataRoute(
  provider: Pick<AuthProvider, "getResourceMetadata">,
): CustomHttpRoute | undefined {
  const metadata = provider.getResourceMetadata();
  const path = new URL(metadata.resource_metadata_url).pathname;

  if (path === ROOT_METADATA_PATH) return undefined;

  return {
    method: "get",
    path,
    handler: () => jsonMetadata(metadata),
  };
}

function jsonMetadata(metadata: ProtectedResourceMetadata): Response {
  return Response.json(metadata);
}
