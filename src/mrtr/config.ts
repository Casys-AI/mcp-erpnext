import type { MrtrOptions } from "@casys/mcp-server";
import { env } from "../runtime.ts";

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * MRTR is deliberately opt-in: without a shared signing key, ambiguous link
 * fields keep returning the existing actionable error instead of trusting
 * client-controlled retry state.
 */
export function loadMrtrConfig(): MrtrOptions | undefined {
  const signingKey = normalize(env("MCP_MRTR_SIGNING_KEY"));
  if (!signingKey) return undefined;

  if (!/^[0-9a-f]{64}$/.test(signingKey)) {
    throw new Error(
      "[hvgerp-mcp] MCP_MRTR_SIGNING_KEY must be exactly 64 lowercase hex characters",
    );
  }

  return { signingKey };
}
