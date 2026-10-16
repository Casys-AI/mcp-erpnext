import { formatPercent, toNumber } from "../../shared/format.ts";

/** `delta` already contains percentage points; the badge carries direction. */
export function formatDeltaPercent(delta: unknown): string {
  const n = toNumber(delta);
  if (n === null) return formatPercent(delta);
  const magnitude = Math.abs(n);
  return formatPercent(magnitude, magnitude % 1 === 0 ? 0 : 1);
}
