/**
 * Combine multiple AuthProviders into one: a token is accepted if any
 * underlying provider accepts it. Lets static-token and OAuth JWT auth run
 * side by side (e.g. a static token for same-network tooling, OAuth for
 * external clients), which `@casys/mcp-server` doesn't provide out of the box.
 *
 * @module lib/erpnext/src/auth/composite-provider
 */

import {
  type AuthInfo,
  AuthProvider,
  type ProtectedResourceMetadata,
} from "@casys/mcp-server";

export class CompositeAuthProvider extends AuthProvider {
  constructor(private readonly providers: AuthProvider[]) {
    super();
    if (providers.length === 0) {
      throw new Error(
        "[CompositeAuthProvider] at least one provider is required",
      );
    }
  }

  async verifyToken(token: string): Promise<AuthInfo | null> {
    for (const provider of this.providers) {
      const info = await provider.verifyToken(token);
      if (info) return info;
    }
    return null;
  }

  getResourceMetadata(): ProtectedResourceMetadata {
    const metadata = this.providers.map((provider) =>
      provider.getResourceMetadata()
    );
    const primary = metadata[0]!;
    const scopesSupported = [
      ...new Set(metadata.flatMap((item) => item.scopes_supported ?? [])),
    ];

    return {
      ...primary,
      authorization_servers: [
        ...new Set(metadata.flatMap((item) => item.authorization_servers)),
      ],
      ...(scopesSupported.length > 0
        ? { scopes_supported: scopesSupported }
        : {}),
      bearer_methods_supported: [
        ...new Set(
          metadata.flatMap((item) => item.bearer_methods_supported),
        ),
      ],
    };
  }
}
