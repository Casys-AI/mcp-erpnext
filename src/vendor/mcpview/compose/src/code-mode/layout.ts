/** Versioned layout preferences for a Code Mode dashboard. @module */
/** User-selected panel positions and supported widths, independent of ERP data and chat context. */
export type PanelLayoutSnapshot = {
  readonly version: 1;
  /** Panel IDs in the template's original slot order. */
  readonly order: readonly string[];
  readonly widths: readonly { readonly panel: string; readonly width: number }[];
  readonly placements: readonly {
    readonly panel: string;
    readonly beside: string;
    readonly side: "left" | "right" | "below";
  }[];
};

// This is a versioned wire format. Only geometry crosses the snippet boundary.
const maxPanels = 128;
const maxIdLength = 256;

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxIdLength &&
    !Array.from(value).some((ch) => ch.charCodeAt(0) < 32);
}

/** Validate an untrusted JSON snapshot, including placement anchors and their dependencies. */
export function isPanelLayoutSnapshot(value: unknown): value is PanelLayoutSnapshot {
  if (!fields(value, ["version", "order", "widths", "placements"]) || value.version !== 1) {
    return false;
  }
  const { order, widths, placements } = value;
  if (
    !Array.isArray(order) || !order.length || order.length > maxPanels ||
    !Array.isArray(widths) || widths.length > order.length ||
    !Array.isArray(placements) || placements.length >= order.length
  ) return false;
  const ids = new Set<unknown>(order);
  if (ids.size !== order.length || !Array.from(ids).every(validId)) return false;
  const resized = new Set<unknown>();
  for (const item of widths) {
    if (
      !fields(item, ["panel", "width"]) || !ids.has(item.panel) || resized.has(item.panel) ||
      typeof item.width !== "number" || !Number.isSafeInteger(item.width) || item.width <= 0
    ) return false;
    resized.add(item.panel);
  }
  const anchors = new Map<unknown, unknown>();
  for (const item of placements) {
    if (
      !fields(item, ["panel", "beside", "side"]) || !ids.has(item.panel) || !ids.has(item.beside) ||
      anchors.has(item.panel) ||
      (item.side !== "left" && item.side !== "right" && item.side !== "below")
    ) return false;
    anchors.set(item.panel, item.beside);
  }
  for (let id of anchors.keys()) {
    const seen = new Set<unknown>();
    while (anchors.has(id)) {
      if (seen.has(id)) return false;
      seen.add(id);
      id = anchors.get(id);
    }
  }
  return true;
}
