/**
 * Frappe Client Tests
 *
 * Tests for the FrappeClient HTTP client.
 * Uses mock fetch to avoid real network calls.
 *
 * @module lib/erpnext/tests/api/frappe-client_test
 */

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { FrappeAPIError, FrappeClient } from "../../src/api/frappe-client.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

function mockFetch(
  responses: Array<{ status: number; body: unknown; contentType?: string }>,
) {
  let callIndex = 0;
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    const config = responses[callIndex++];
    if (!config) throw new Error("No more mock responses configured");

    const body = JSON.stringify(config.body);
    return new Response(body, {
      status: config.status,
      headers: {
        "content-type": config.contentType ?? "application/json",
      },
    });
  };

  return () => {
    globalThis.fetch = original;
  };
}

function makeClient() {
  return new FrappeClient({
    baseUrl: "http://localhost:8000",
    apiKey: "test-key",
    apiSecret: "test-secret",
  });
}

// ── Auth header ───────────────────────────────────────────────────────────────

Deno.test("FrappeClient - sends correct auth header", async () => {
  let capturedHeaders: Record<string, string> = {};
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    capturedHeaders = Object.fromEntries(
      new Headers(init?.headers).entries(),
    );
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const client = makeClient();
  await client.list("Customer");

  assertEquals(capturedHeaders["authorization"], "token test-key:test-secret");

  globalThis.fetch = original;
});

// ── list() ────────────────────────────────────────────────────────────────────

Deno.test("FrappeClient.list() - returns data array", async () => {
  const restore = mockFetch([
    {
      status: 200,
      body: {
        data: [
          { name: "CUST-001", customer_name: "Acme Corp" },
          { name: "CUST-002", customer_name: "Globex" },
        ],
      },
    },
  ]);

  try {
    const client = makeClient();
    const result = await client.list("Customer", {
      fields: ["name", "customer_name"],
      limit: 10,
    });
    assertEquals(result.length, 2);
    assertEquals(result[0].name, "CUST-001");
    assertEquals(result[1].customer_name, "Globex");
  } finally {
    restore();
  }
});

Deno.test("FrappeClient.list() - builds correct query string", async () => {
  let capturedUrl = "";
  const original = globalThis.fetch;

  globalThis.fetch = async (
    url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    capturedUrl = url.toString();
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const client = makeClient();
  await client.list("Sales Order", {
    fields: ["name", "customer"],
    filters: [["customer", "=", "CUST-001"]],
    limit: 5,
    order_by: "modified desc",
  });

  const url = new URL(capturedUrl);
  assertEquals(url.pathname, "/api/resource/Sales%20Order");
  assertEquals(url.searchParams.get("limit"), "5");
  assertEquals(url.searchParams.get("order_by"), "modified desc");
  assertEquals(url.searchParams.get("as_dict"), "1");

  globalThis.fetch = original;
});

// ── get() ─────────────────────────────────────────────────────────────────────

Deno.test("FrappeClient.get() - returns single document", async () => {
  const restore = mockFetch([
    {
      status: 200,
      body: {
        data: { name: "SINV-001", customer: "CUST-001", grand_total: 1500.0 },
      },
    },
  ]);

  try {
    const client = makeClient();
    const result = await client.get("Sales Invoice", "SINV-001");
    assertEquals(result.name, "SINV-001");
    assertEquals(result.grand_total, 1500.0);
  } finally {
    restore();
  }
});

// ── create() ─────────────────────────────────────────────────────────────────

Deno.test("FrappeClient.create() - sends POST with data", async () => {
  let capturedBody: unknown;
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(
      JSON.stringify({ data: { name: "SO-001", customer: "CUST-001" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const client = makeClient();
  const result = await client.create("Sales Order", {
    customer: "CUST-001",
    transaction_date: "2026-02-18",
  });

  assertEquals(result.name, "SO-001");
  assertEquals(
    (capturedBody as { data: { customer: string } }).data.customer,
    "CUST-001",
  );

  globalThis.fetch = original;
});

// ── Error handling ────────────────────────────────────────────────────────────

Deno.test("FrappeClient - throws FrappeAPIError on HTTP 404", async () => {
  const restore = mockFetch([
    {
      status: 404,
      body: { message: "Document not found" },
    },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.get("Customer", "NONEXISTENT"),
      FrappeAPIError,
      "HTTP 404",
    );
  } finally {
    restore();
  }
});

Deno.test("FrappeClient - throws FrappeAPIError on HTTP 403", async () => {
  const restore = mockFetch([
    {
      status: 403,
      body: { message: "Permission denied", exc_type: "PermissionError" },
    },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.list("Payroll Entry"),
      FrappeAPIError,
      "HTTP 403",
    );
  } finally {
    restore();
  }
});

Deno.test("FrappeClient - throws FrappeAPIError on HTTP 500", async () => {
  const restore = mockFetch([
    {
      status: 500,
      body: { message: "Internal Server Error" },
    },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.callMethod("frappe.client.get_list"),
      FrappeAPIError,
      "HTTP 500",
    );
  } finally {
    restore();
  }
});
