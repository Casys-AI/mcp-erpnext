/**
 * ERPNext Tools Registry
 *
 * Central registry for all ERPNext MCP tools.
 * Exports tools by category and provides lookup utilities.
 *
 * @module lib/erpnext/tools/mod
 */

import { salesTools } from "./sales.ts";
import { inventoryTools } from "./inventory.ts";
import { accountingTools } from "./accounting.ts";
import { hrTools } from "./hr.ts";
import { projectTools } from "./project.ts";
import { purchasingTools } from "./purchasing.ts";
import { deliveryTools } from "./delivery.ts";
import { manufacturingTools } from "./manufacturing.ts";
import { crmTools } from "./crm.ts";
import { assetsTools } from "./assets.ts";
import { operationsTools } from "./operations.ts";
import { setupTools } from "./setup.ts";
import { analyticsTools } from "./analytics.ts";
import type { ErpNextTool, ErpNextToolCategory } from "./types.ts";

export {
  salesTools,
  inventoryTools,
  accountingTools,
  hrTools,
  projectTools,
  purchasingTools,
  deliveryTools,
  manufacturingTools,
  crmTools,
  assetsTools,
  operationsTools,
  setupTools,
  analyticsTools,
};
export type { ErpNextTool, ErpNextToolCategory };

/** All tools grouped by category */
export const toolsByCategory: Record<string, ErpNextTool[]> = {
  sales: salesTools,
  inventory: inventoryTools,
  accounting: accountingTools,
  hr: hrTools,
  project: projectTools,
  purchasing: purchasingTools,
  delivery: deliveryTools,
  manufacturing: manufacturingTools,
  crm: crmTools,
  assets: assetsTools,
  operations: operationsTools,
  setup: setupTools,
  analytics: analyticsTools,
};

/** Flat array of all tools */
export const allTools: ErpNextTool[] = [
  ...salesTools,
  ...inventoryTools,
  ...accountingTools,
  ...hrTools,
  ...projectTools,
  ...purchasingTools,
  ...deliveryTools,
  ...manufacturingTools,
  ...crmTools,
  ...assetsTools,
  ...operationsTools,
  ...setupTools,
  ...analyticsTools,
];

/** Get tools for a specific category */
export function getToolsByCategory(category: string): ErpNextTool[] {
  return toolsByCategory[category as ErpNextToolCategory] ?? [];
}

/** Find a tool by its unique name */
export function getToolByName(name: string): ErpNextTool | undefined {
  return allTools.find((t) => t.name === name);
}

/** Get list of available categories */
export function getCategories(): ErpNextToolCategory[] {
  return Object.keys(toolsByCategory) as ErpNextToolCategory[];
}
