/**
 * ERPNext CRM Tools
 *
 * MCP tools for Customer Relationship Management: leads, opportunities,
 * contacts, campaigns.
 *
 * @module lib/erpnext/tools/crm
 */

import type { FrappeFilter } from "../api/types.ts";
import type { ErpNextTool } from "./types.ts";

export const crmTools: ErpNextTool[] = [
  // ── Leads ─────────────────────────────────────────────────────────────────

  {
    name: "erpnext_lead_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List CRM Leads. Filterable by status, lead_owner, source. " +
      "Fields: name, lead_name, company_name, status, lead_owner, source, email_id, mobile_no.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        status: {
          type: "string",
          description:
            "Filter by status (Open, Replied, Opportunity, Interested, Converted, Do Not Contact)",
        },
        lead_owner: { type: "string", description: "Filter by assigned sales rep (user)" },
        source: {
          type: "string",
          description: "Filter by lead source (Cold Calling, Website, etc.)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.lead_owner) {
        filters.push(["lead_owner", "=", input.lead_owner as string]);
      }
      if (input.source) {
        filters.push(["source", "=", input.source as string]);
      }

      const docs = await ctx.client.list("Lead", {
        fields: [
          "name",
          "lead_name",
          "company_name",
          "status",
          "lead_owner",
          "source",
          "email_id",
          "mobile_no",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Lead",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_lead_get",
    description: "Get a single CRM Lead by name. Returns all lead details including contact info.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lead name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_lead_get] 'name' is required");
      }
      const doc = await ctx.client.get("Lead", input.name as string);
      return { data: doc };
    },
  },

  {
    name: "erpnext_lead_create",
    description:
      "Create a new CRM Lead. Requires lead_name. Optionally set company_name, email_id, mobile_no, source.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        lead_name: { type: "string", description: "Full name of the lead contact" },
        company_name: { type: "string", description: "Company name" },
        email_id: { type: "string", description: "Email address" },
        mobile_no: { type: "string", description: "Mobile number" },
        source: {
          type: "string",
          description: "Lead source (Cold Calling, Website, Advertisement, etc.)",
        },
        lead_owner: { type: "string", description: "Assigned sales rep (ERPNext user)" },
      },
      required: ["lead_name"],
    },
    handler: async (input, ctx) => {
      if (!input.lead_name) {
        throw new Error("[erpnext_lead_create] 'lead_name' is required");
      }

      const doc = await ctx.client.create("Lead", {
        lead_name: input.lead_name as string,
        company_name: (input.company_name as string) ?? undefined,
        email_id: (input.email_id as string) ?? undefined,
        mobile_no: (input.mobile_no as string) ?? undefined,
        source: (input.source as string) ?? undefined,
        lead_owner: (input.lead_owner as string) ?? undefined,
      });

      return {
        data: doc,
        message: `Lead ${doc.name} created successfully`,
      };
    },
  },

  // ── Opportunities ─────────────────────────────────────────────────────────

  {
    name: "erpnext_opportunity_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List CRM Opportunities. Filterable by status, opportunity_owner, opportunity_from. " +
      "Fields: name, opportunity_from, party_name, status, opportunity_amount, currency, probability, opportunity_owner.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        status: {
          type: "string",
          description: "Filter by status (Open, Quotation, Converted, Lost, Closed)",
        },
        opportunity_owner: {
          type: "string",
          description: "Filter by assigned sales rep (user)",
        },
        party_name: { type: "string", description: "Filter by customer or lead name" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }
      if (input.opportunity_owner) {
        filters.push(["opportunity_owner", "=", input.opportunity_owner as string]);
      }
      if (input.party_name) {
        filters.push(["party_name", "=", input.party_name as string]);
      }

      const docs = await ctx.client.list("Opportunity", {
        fields: [
          "name",
          "opportunity_from",
          "party_name",
          "status",
          "opportunity_amount",
          "currency",
          "probability",
          "opportunity_owner",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Opportunity",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_opportunity_get",
    description:
      "Get a single CRM Opportunity by name. Returns full details including items and competitors.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Opportunity name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_opportunity_get] 'name' is required");
      }
      const doc = await ctx.client.get("Opportunity", input.name as string);
      return { data: doc };
    },
  },

  // ── Contacts ──────────────────────────────────────────────────────────────

  {
    name: "erpnext_contact_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List Contacts. Filterable by company_name, status. " +
      "Fields: name, first_name, last_name, company_name, email_id, mobile_no, status.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        company_name: { type: "string", description: "Filter by company name" },
        status: {
          type: "string",
          description: "Filter by status (Passive, Open, Replied)",
        },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.company_name) {
        filters.push(["company_name", "=", input.company_name as string]);
      }
      if (input.status) {
        filters.push(["status", "=", input.status as string]);
      }

      const docs = await ctx.client.list("Contact", {
        fields: [
          "name",
          "first_name",
          "last_name",
          "company_name",
          "email_id",
          "mobile_no",
          "status",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Contact",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },

  {
    name: "erpnext_contact_get",
    description: "Get a single Contact by name. Returns all contact details.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name (ID)" },
      },
      required: ["name"],
    },
    handler: async (input, ctx) => {
      if (!input.name) {
        throw new Error("[erpnext_contact_get] 'name' is required");
      }
      const doc = await ctx.client.get("Contact", input.name as string);
      return { data: doc };
    },
  },

  // ── Campaigns ─────────────────────────────────────────────────────────────

  {
    name: "erpnext_campaign_list",
    _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
    description:
      "List CRM Campaigns. " +
      "Fields: name, campaign_name, campaign_type, start_date, end_date, description.",
    category: "crm",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
        campaign_type: { type: "string", description: "Filter by campaign type" },
      },
    },
    handler: async (input, ctx) => {
      const limit = (input.limit as number) ?? 20;
      const filters: FrappeFilter[] = [];
      if (input.campaign_type) {
        filters.push(["campaign_type", "=", input.campaign_type as string]);
      }

      const docs = await ctx.client.list("Campaign", {
        fields: [
          "name",
          "campaign_name",
          "campaign_type",
          "start_date",
          "end_date",
          "description",
        ],
        filters,
        limit,
        order_by: "modified desc",
      });

      return {
        doctype: "Campaign",
        count: docs.length,
        data: docs,
        _meta: { ui: { resourceUri: "ui://mcp-erpnext/doclist-viewer" } },
      };
    },
  },
];
