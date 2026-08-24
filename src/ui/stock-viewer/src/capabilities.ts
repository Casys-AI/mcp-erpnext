import { canCallViewerTool } from "../../shared/viewer-tools.ts";

export interface StockDetailCapabilities {
  canLoadItem: boolean;
  canLoadMovements: boolean;
}

export interface StockRowChannels {
  fixture: boolean;
  hasJump: boolean;
  canInspect: boolean;
  messagesEnabled: boolean;
}

/** Lectures exactes que le panneau stock peut déléguer à l'hôte. */
export function stockDetailCapabilities(
  serverTools: unknown,
  availableTools: readonly string[] | undefined,
): StockDetailCapabilities {
  return {
    canLoadItem: canCallViewerTool(
      serverTools,
      availableTools,
      "erpnext_item_get",
    ),
    canLoadMovements: canCallViewerTool(
      serverTools,
      availableTools,
      "erpnext_stock_entry_list",
    ),
  };
}

/** Une ligne ne prend le focus que si son activation produit quelque chose. */
export function canInteractWithStockRow(
  channels: StockRowChannels,
): boolean {
  return channels.fixture || channels.hasJump || channels.canInspect ||
    channels.messagesEnabled;
}
