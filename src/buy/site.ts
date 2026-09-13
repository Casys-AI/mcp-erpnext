/**
 * Derive the opaque ERPNext site identifier from the actual FrappeClient.
 *
 * `siteId` is SHA-256 of the UTF-8 bytes of the normalized site URL
 * (origin + site path, no credentials/query/fragment). Scope is the
 * configured client base URL. This is not an ERP database UUID.
 */

import type { FrappeClient } from "../api/frappe-client.ts";
import { BUY_SOURCE_INSTANCE_KIND } from "./identities.ts";
import { sha256FingerprintOfUtf8 } from "../shared/json.ts";

export interface BuySourceInstance {
  readonly kind: typeof BUY_SOURCE_INSTANCE_KIND;
  readonly siteId: string;
}

export interface SiteIdentityClient {
  normalizedSiteUrl(): string;
}

export async function sourceInstanceFromClient(
  client: SiteIdentityClient | FrappeClient,
): Promise<BuySourceInstance> {
  const normalized = client.normalizedSiteUrl();
  return {
    kind: BUY_SOURCE_INSTANCE_KIND,
    siteId: await sha256FingerprintOfUtf8(normalized),
  };
}
