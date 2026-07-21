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

  /** Metadata from the first provider — used only for discovery, not enforcement. */
  getResourceMetadata(): ProtectedResourceMetadata {
    return this.providers[0].getResourceMetadata();
  }
}
