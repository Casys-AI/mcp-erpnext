/**
 * Buy evidence capture tool.
 *
 * Read-only bounded capture of closed ERPNext commercial documents.
 * Presentation of sealed evidence is not a live ERP qualification.
 */

import {
  BUY_CAPTURE_DOCTYPE,
  BUY_CAPTURE_MAX_DOCUMENTS,
} from "../buy/identities.ts";
import { runBuyCapture } from "../buy/capture.ts";
import type { ErpNextTool } from "./types.ts";

export const buyTools: ErpNextTool[] = [
  {
    name: "erpnext_buy_capture",
    annotations: { readOnlyHint: true },
    description:
      "Read-only bounded capture of exact ERPNext commercial documents " +
      "(Item, BOM, Item Price, Supplier Quotation, Supplier, Price List, UOM, " +
      "Currency Exchange). Two skipCache reads must agree on modified and the " +
      "closed projection fingerprint. Returns canonical JSON + SHA-256; does " +
      "not store CAS, create BOM/RFQ/PO, compute a cost total, or qualify a " +
      "live ERP. Not a registered purchase capability.",
    category: "buy",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documents"],
      properties: {
        documents: {
          type: "array",
          minItems: 1,
          maxItems: BUY_CAPTURE_MAX_DOCUMENTS,
          description:
            "Exact document references. Do not pass sourceInstance, URL, " +
            "credentials, capturedAt, or a caller digest.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["doctype", "name"],
            properties: {
              doctype: {
                type: "string",
                enum: [...BUY_CAPTURE_DOCTYPE],
                description: "Closed Buy capture DocType",
              },
              name: {
                type: "string",
                minLength: 1,
                maxLength: 140,
                description: "Exact ERP document name",
              },
              expectedModified: {
                type: "string",
                description:
                  "Optional exact Frappe modified timestamp to match",
              },
            },
          },
        },
      },
    },
    handler: async (input, ctx) => {
      return await runBuyCapture(input, { client: ctx.client });
    },
  },
];
