/**
 * Frappe Client Tests
 *
 * Tests for the FrappeClient HTTP client.
 * Uses mock fetch to avoid real network calls.
 *
 * @module lib/erpnext/tests/api/frappe-client_test
 */

import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  FrappeAPIError,
  FrappeClient,
  getFrappeClient,
  normalizeFrappeSiteUrl,
  setFrappeClient,
} from "./frappe-client.ts";
import { MemoryCache } from "../cache/memory.ts";

// ── Test helpers ──────────────────────────────────────────────────────────────

interface MockResponse {
  status: number;
  body: unknown;
  contentType?: string;
  /** Raw body string — overrides `body` when provided (for malformed JSON tests). */
  rawBody?: string;
  /** Extra response headers (e.g. retry-after). */
  headers?: Record<string, string>;
}

const callCountRef: { current: number } = { current: 0 };

function mockFetch(responses: Array<MockResponse>) {
  callCountRef.current = 0;
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    const config = responses[callCountRef.current++];
    if (!config) throw new Error("No more mock responses configured");

    const body = config.rawBody ?? JSON.stringify(config.body);
    return new Response(body, {
      status: config.status,
      headers: {
        "content-type": config.contentType ?? "application/json",
        ...(config.headers ?? {}),
      },
    });
  };

  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function mockStalledFetch(
  phase: "headers" | "body",
  stalledAttempts = Infinity,
) {
  const original = globalThis.fetch;
  const cleanups: Array<() => void> = [];
  let calls = 0;
  globalThis.fetch = (_url, init): Promise<Response> => {
    if (++calls > stalledAttempts) {
      return Promise.resolve(jsonResponse({ docs: [] }));
    }
    let fail!: (reason: unknown) => void;
    const response = phase === "headers"
      ? new Promise<Response>((_resolve, reject) => {
        fail = reject;
      })
      : Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"docs":['));
              fail = (reason) => controller.error(reason);
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    // Comme fetch, le faux transport interrompt aussi le flux à l'abandon.
    const onAbort = () => fail(new DOMException("aborted", "AbortError"));
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    if (init?.signal?.aborted) onAbort();
    cleanups.push(() => {
      init?.signal?.removeEventListener("abort", onAbort);
      fail(new Error("Test cleanup"));
    });
    return response;
  };
  return {
    get calls() {
      return calls;
    },
    restore() {
      globalThis.fetch = original;
      for (const cleanup of cleanups) cleanup();
    },
  };
}

async function withinDeadline<T>(pending: Promise<T>, ms = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        // Cette garde fait échouer le test rouge sans le laisser suspendu.
        timer = setTimeout(
          () => reject(new Error("Test deadline exceeded")),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return new FrappeClient({
    baseUrl: "http://localhost:8000",
    apiKey: "test-key",
    apiSecret: "test-secret",
    // Tests run with very short backoff so they stay fast.
    retryBackoffMs: 1,
    ...overrides,
  });
}

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => void,
) {
  const original = Deno.env.get(key);
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
  try {
    fn();
  } finally {
    if (original === undefined) Deno.env.delete(key);
    else Deno.env.set(key, original);
  }
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

Deno.test("FrappeClient.list() - sends limit 0, limit_start and group_by verbatim", async () => {
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url: string | URL | Request) => {
    urls.push(url.toString());
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = makeClient();
    // limit=0 is Frappe's "every row": it must reach the wire, not be dropped
    // as falsy.
    await client.list("Item", { limit: 0 });
    await client.list("Stock Entry", {
      limit: 20,
      limit_start: 40,
      group_by: "`tabStock Entry`.name",
    });
    await client.list("Item", { limit: 20 });

    const [all, grouped, plain] = urls.map((url) => new URL(url).searchParams);
    assertEquals(all.get("limit"), "0");
    assertEquals(all.get("limit_start"), null);
    assertEquals(grouped.get("limit_start"), "40");
    assertEquals(grouped.get("group_by"), "`tabStock Entry`.name");
    assertEquals(plain.get("group_by"), null);
  } finally {
    globalThis.fetch = original;
  }
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

// ── uploadFile() ─────────────────────────────────────────────────────────────

Deno.test("FrappeClient.uploadFile() - sends native multipart attachment", async () => {
  const requests: Array<{
    url: string;
    method: string;
    headers: Headers;
    body: FormData | string | undefined;
  }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push({
      url: url.toString(),
      method: init?.method ?? "",
      headers: new Headers(init?.headers),
      body: init?.body as FormData | string | undefined,
    });
    if (requests.length === 2) {
      return new Response(
        JSON.stringify({
          data: {
            name: "CRM-DEAL-0001",
            proposal: "/private/files/proposal.pdf",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        message: {
          doctype: "File",
          name: "a1b2c3",
          file_name: "proposal.pdf",
          file_url: "/private/files/proposal.pdf",
          is_private: 1,
          attached_to_doctype: "CRM Deal",
          attached_to_name: "CRM-DEAL-0001",
          attached_to_field: "proposal",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    const result = await client.uploadFile({
      fileName: "proposal.pdf",
      contentBase64: btoa("PDF bytes"),
      attachedToDoctype: "CRM Deal",
      attachedToName: "CRM-DEAL-0001",
      attachedToField: "proposal",
    });

    const upload = requests[0];
    assertEquals(new URL(upload.url).pathname, "/api/method/upload_file");
    assertEquals(upload.method, "POST");
    assertEquals(
      upload.headers.get("authorization"),
      "token test-key:test-secret",
    );
    assertEquals(upload.headers.get("accept"), "application/json");
    assertEquals(upload.headers.has("content-type"), false);
    if (!(upload.body instanceof FormData)) {
      throw new Error("Expected FormData");
    }
    assertEquals(upload.body.get("doctype"), "CRM Deal");
    assertEquals(upload.body.get("docname"), "CRM-DEAL-0001");
    assertEquals(upload.body.get("fieldname"), "proposal");
    assertEquals(upload.body.get("is_private"), "1");

    const file = upload.body.get("file");
    if (!(file instanceof File)) throw new Error("Expected multipart File");
    assertEquals(file.name, "proposal.pdf");
    assertEquals(await file.text(), "PDF bytes");

    const fieldUpdate = requests[1];
    assertEquals(
      new URL(fieldUpdate.url).pathname,
      "/api/resource/CRM%20Deal/CRM-DEAL-0001",
    );
    assertEquals(fieldUpdate.method, "PUT");
    assertEquals(
      JSON.parse(fieldUpdate.body as string),
      { data: { proposal: "/private/files/proposal.pdf" } },
    );
    assertEquals(result.name, "a1b2c3");
    assertEquals(result.file_url, "/private/files/proposal.pdf");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.uploadFile() - sends explicit public privacy", async () => {
  let capturedBody: FormData | undefined;
  const original = globalThis.fetch;

  globalThis.fetch = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    capturedBody = init?.body as FormData;
    return new Response(
      JSON.stringify({
        message: {
          name: "public-file",
          file_name: "brochure.pdf",
          file_url: "/files/brochure.pdf",
          is_private: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.uploadFile({
      fileName: "brochure.pdf",
      contentBase64: btoa("public"),
      attachedToDoctype: "Lead",
      attachedToName: "LEAD-0001",
      isPrivate: false,
    });

    assertEquals(capturedBody?.get("is_private"), "0");
    assertEquals(capturedBody?.has("fieldname"), false);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.uploadFile() - rejects malformed or empty base64", async () => {
  const client = makeClient();
  const input = {
    fileName: "proposal.pdf",
    attachedToDoctype: "CRM Deal",
    attachedToName: "CRM-DEAL-0001",
  };

  await assertRejects(
    () => client.uploadFile({ ...input, contentBase64: "not-base64!" }),
    Error,
    "valid base64",
  );
  await assertRejects(
    () => client.uploadFile({ ...input, contentBase64: "" }),
    Error,
    "must not be empty",
  );
});

Deno.test("FrappeClient.uploadFile() - rejects decoded content over configured limit", async () => {
  const client = makeClient({ maxUploadBytes: 2 });

  await assertRejects(
    () =>
      client.uploadFile({
        fileName: "proposal.pdf",
        contentBase64: btoa("abc"),
        attachedToDoctype: "CRM Deal",
        attachedToName: "CRM-DEAL-0001",
      }),
    Error,
    "exceeds",
  );
});

Deno.test("FrappeClient - rejects a non-positive upload limit", () => {
  assertThrows(
    () => makeClient({ maxUploadBytes: 0 }),
    Error,
    "maxUploadBytes",
  );
});

Deno.test("FrappeClient.uploadFile() - preserves Frappe permission errors", async () => {
  const restore = mockFetch([
    {
      status: 403,
      body: { message: "Not permitted", exc_type: "PermissionError" },
    },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () =>
        client.uploadFile({
          fileName: "proposal.pdf",
          contentBase64: btoa("PDF bytes"),
          attachedToDoctype: "CRM Deal",
          attachedToName: "CRM-DEAL-0001",
        }),
      FrappeAPIError,
      "HTTP 403",
    );
  } finally {
    restore();
  }
});

Deno.test("FrappeClient.uploadFile() - invalidates File and target caches", async () => {
  const restore = mockFetch([
    { status: 200, body: { data: [{ name: "FILE-OLD" }] } },
    { status: 200, body: { data: { name: "TASK-001", subject: "Before" } } },
    {
      status: 200,
      body: {
        message: {
          name: "FILE-NEW",
          file_name: "report.pdf",
          file_url: "/private/files/report.pdf",
          is_private: 1,
        },
      },
    },
    { status: 200, body: { data: [{ name: "FILE-NEW" }] } },
    { status: 200, body: { data: { name: "TASK-001", subject: "After" } } },
  ]);

  try {
    const client = makeClient({ cache: new MemoryCache() });
    await client.list("File");
    await client.get("Task", "TASK-001");
    await client.uploadFile({
      fileName: "report.pdf",
      contentBase64: btoa("report"),
      attachedToDoctype: "Task",
      attachedToName: "TASK-001",
    });

    const files = await client.list("File");
    const task = await client.get("Task", "TASK-001");
    assertEquals(files[0].name, "FILE-NEW");
    assertEquals(task.subject, "After");
    assertEquals(callCountRef.current, 5);
  } finally {
    restore();
  }
});

Deno.test("getFrappeClient() - treats a blank upload limit as unset", () => {
  withEnv("ERPNEXT_URL", "http://localhost:8000", () => {
    withEnv("ERPNEXT_API_KEY", "test-key", () => {
      withEnv("ERPNEXT_API_SECRET", "test-secret", () => {
        withEnv("ERPNEXT_MAX_UPLOAD_BYTES", "  ", () => {
          setFrappeClient(null);
          try {
            assertEquals(getFrappeClient() instanceof FrappeClient, true);
          } finally {
            setFrappeClient(null);
          }
        });
      });
    });
  });
});

// ── downloadFile() ──────────────────────────────────────────────────────────

Deno.test("FrappeClient.downloadFile() - downloads a private attachment with auth and no redirects", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push({ url: url.toString(), init });
    if (requests.length === 1) {
      return jsonResponse({
        data: {
          name: "FILE-001",
          file_name: "folder/report\u0000.pdf",
          file_url: "/private/files/report.pdf",
          file_size: 3,
          is_private: 1,
          attached_to_doctype: "Task",
          attached_to_name: "TASK-001",
        },
      });
    }
    return new Response(new Uint8Array([0, 255, 1]), {
      status: 200,
      headers: {
        "content-type": "Application/PDF; charset=binary",
        "content-length": "3",
        "content-disposition": "attachment; filename=attacker.exe",
      },
    });
  };

  try {
    const result = await makeClient().downloadFile({
      fileId: "FILE-001",
      attachedToDoctype: "Task",
      attachedToName: "TASK-001",
    });

    assertEquals(
      new URL(requests[0].url).pathname,
      "/api/resource/File/FILE-001",
    );
    const downloadUrl = new URL(requests[1].url);
    assertEquals(downloadUrl.origin, "http://localhost:8000");
    assertEquals(
      downloadUrl.pathname,
      "/api/method/frappe.handler.download_file",
    );
    assertEquals(
      downloadUrl.searchParams.get("file_url"),
      "/private/files/report.pdf",
    );
    assertEquals(requests[1].init?.redirect, "manual");
    assertEquals(requests[1].init?.cache, "no-store");
    assertEquals(
      new Headers(requests[1].init?.headers).get("authorization"),
      "token test-key:test-secret",
    );
    assertEquals(result.fileName, "folder_report.pdf");
    assertEquals(result.mimeType, "application/pdf");
    assertEquals(result.bytes, new Uint8Array([0, 255, 1]));
    assertEquals(result.isPrivate, true);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.downloadFile() - supports a public local file and MIME fallback", async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (): Promise<Response> => {
    call++;
    if (call === 1) {
      return jsonResponse({
        data: {
          name: "FILE-PUBLIC",
          file_name: "brochure.bin",
          file_url: "/files/brochure.bin",
          is_private: 0,
          attached_to_doctype: "Lead",
          attached_to_name: "LEAD-001",
        },
      });
    }
    return new Response(new Uint8Array([7]), {
      headers: { "content-type": "application/unknown; charset=utf-8" },
    });
  };

  try {
    const result = await makeClient().downloadFile({
      fileId: "FILE-PUBLIC",
      attachedToDoctype: "Lead",
      attachedToName: "LEAD-001",
    });
    assertEquals(result.isPrivate, false);
    assertEquals(result.mimeType, "application/octet-stream");
    assertEquals(result.bytes, new Uint8Array([7]));
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.downloadFile() - rejects a mismatched attachment before fetching bytes", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (): Promise<Response> => {
    calls++;
    return jsonResponse({
      data: {
        name: "FILE-001",
        file_name: "report.pdf",
        file_url: "/private/files/report.pdf",
        is_private: 1,
        attached_to_doctype: "Task",
        attached_to_name: "TASK-OTHER",
      },
    });
  };

  try {
    await assertRejects(
      () =>
        makeClient().downloadFile({
          fileId: "FILE-001",
          attachedToDoctype: "Task",
          attachedToName: "TASK-001",
        }),
      Error,
      "not attached",
    );
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.downloadFile() - rejects remote, traversing, encoded, and privacy-mismatched file URLs", async () => {
  const cases: Array<{ fileUrl: string; isPrivate: 0 | 1 }> = [
    { fileUrl: "https://evil.example/report.pdf", isPrivate: 1 },
    { fileUrl: "//evil.example/report.pdf", isPrivate: 0 },
    { fileUrl: "/api/method/evil", isPrivate: 0 },
    { fileUrl: "/private/files/../secret.txt", isPrivate: 1 },
    { fileUrl: "/private/files/%2e%2e", isPrivate: 1 },
    { fileUrl: "/private/files/%252e%252e", isPrivate: 1 },
    { fileUrl: "/private/files/a%2fb.pdf", isPrivate: 1 },
    { fileUrl: "/private/files/a\\b.pdf", isPrivate: 1 },
    { fileUrl: "/private/files/a.pdf?token=secret", isPrivate: 1 },
    { fileUrl: "/private/files/%ZZ.pdf", isPrivate: 1 },
    { fileUrl: "/files/public.pdf", isPrivate: 1 },
  ];

  for (const testCase of cases) {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      return jsonResponse({
        data: {
          name: "FILE-001",
          file_name: "report.pdf",
          file_url: testCase.fileUrl,
          is_private: testCase.isPrivate,
          attached_to_doctype: "Task",
          attached_to_name: "TASK-001",
        },
      });
    };

    try {
      await assertRejects(
        () =>
          makeClient().downloadFile({
            fileId: "FILE-001",
            attachedToDoctype: "Task",
            attachedToName: "TASK-001",
          }),
        Error,
        "file_url",
      );
      assertEquals(calls, 1, `must not fetch bytes for ${testCase.fileUrl}`);
    } finally {
      globalThis.fetch = original;
    }
  }
});

Deno.test("FrappeClient.downloadFile() - enforces metadata and Content-Length limits", async () => {
  const input = {
    fileId: "FILE-001",
    attachedToDoctype: "Task",
    attachedToName: "TASK-001",
  };

  for (const source of ["metadata", "header"] as const) {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) {
        return jsonResponse({
          data: {
            name: "FILE-001",
            file_name: "report.pdf",
            file_url: "/private/files/report.pdf",
            ...(source === "metadata" ? { file_size: 4 } : {}),
            is_private: 1,
            attached_to_doctype: "Task",
            attached_to_name: "TASK-001",
          },
        });
      }
      return new Response(new Uint8Array([1]), {
        headers: { "content-length": "4" },
      });
    };

    try {
      await assertRejects(
        () => makeClient({ maxDownloadBytes: 3 }).downloadFile(input),
        Error,
        "exceeds",
      );
      assertEquals(calls, source === "metadata" ? 1 : 2);
    } finally {
      globalThis.fetch = original;
    }
  }
});

Deno.test("FrappeClient.downloadFile() - stops a lying stream at max plus one", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let cancelled = false;
  globalThis.fetch = async (): Promise<Response> => {
    calls++;
    if (calls === 1) {
      return jsonResponse({
        data: {
          name: "FILE-001",
          file_name: "report.pdf",
          file_url: "/private/files/report.pdf",
          file_size: 1,
          is_private: 1,
          attached_to_doctype: "Task",
          attached_to_name: "TASK-001",
        },
      });
    }
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-length": "1" } },
    );
  };

  try {
    await assertRejects(
      () =>
        makeClient({ maxDownloadBytes: 3 }).downloadFile({
          fileId: "FILE-001",
          attachedToDoctype: "Task",
          attachedToName: "TASK-001",
        }),
      Error,
      "exceeds",
    );
    assertEquals(cancelled, true);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.downloadFile() - refuses redirects instead of following them", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (): Promise<Response> => {
    calls++;
    if (calls === 1) {
      return jsonResponse({
        data: {
          name: "FILE-001",
          file_name: "report.pdf",
          file_url: "/private/files/report.pdf",
          is_private: 1,
          attached_to_doctype: "Task",
          attached_to_name: "TASK-001",
        },
      });
    }
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/report.pdf" },
    });
  };

  try {
    await assertRejects(
      () =>
        makeClient().downloadFile({
          fileId: "FILE-001",
          attachedToDoctype: "Task",
          attachedToName: "TASK-001",
        }),
      FrappeAPIError,
      "refused an HTTP redirect",
    );
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.downloadFile() - does not reuse cached File metadata", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (): Promise<Response> => {
    calls++;
    if (calls % 2 === 1) {
      return jsonResponse({
        data: {
          name: "FILE-001",
          file_name: "report.pdf",
          file_url: "/private/files/report.pdf",
          is_private: 1,
          attached_to_doctype: "Task",
          attached_to_name: "TASK-001",
        },
      });
    }
    return new Response(new Uint8Array([calls]));
  };

  try {
    const client = makeClient({ cache: new MemoryCache() });
    const input = {
      fileId: "FILE-001",
      attachedToDoctype: "Task",
      attachedToName: "TASK-001",
    };
    await client.downloadFile(input);
    await client.downloadFile(input);
    assertEquals(calls, 4);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient - defaults downloads to 10 MiB and validates the limit", async () => {
  assertThrows(
    () => makeClient({ maxDownloadBytes: 0 }),
    Error,
    "maxDownloadBytes",
  );

  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (): Promise<Response> => {
    calls++;
    return jsonResponse({
      data: {
        name: "FILE-001",
        file_name: "large.bin",
        file_url: "/private/files/large.bin",
        file_size: 10 * 1024 * 1024 + 1,
        is_private: 1,
        attached_to_doctype: "Task",
        attached_to_name: "TASK-001",
      },
    });
  };
  try {
    await assertRejects(
      () =>
        makeClient().downloadFile({
          fileId: "FILE-001",
          attachedToDoctype: "Task",
          attachedToName: "TASK-001",
        }),
      Error,
      "10485760-byte limit",
    );
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("getFrappeClient() - reads ERPNEXT_MAX_DOWNLOAD_BYTES", () => {
  withEnv("ERPNEXT_URL", "http://localhost:8000", () => {
    withEnv("ERPNEXT_API_KEY", "test-key", () => {
      withEnv("ERPNEXT_API_SECRET", "test-secret", () => {
        withEnv("ERPNEXT_MAX_DOWNLOAD_BYTES", "0", () => {
          setFrappeClient(null);
          try {
            assertThrows(
              () => getFrappeClient(),
              Error,
              "maxDownloadBytes",
            );
          } finally {
            setFrappeClient(null);
          }
        });
      });
    });
  });
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

Deno.test("FrappeClient - throws FrappeAPIError on HTTP 500 (POST not retried)", async () => {
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
    // POST is not in the retry method list by default — single call expected.
    assertEquals(callCountRef.current, 1);
  } finally {
    restore();
  }
});

// ── Retry / backoff ───────────────────────────────────────────────────────────

Deno.test({
  name:
    "FrappeClient timeout - a stalled response body times out without a caller signal",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn() {
    const mock = mockStalledFetch("body");
    try {
      const error = await assertRejects(
        () =>
          withinDeadline(
            makeClient({ timeoutMs: 20, retries: 0 }).callMethodRaw(
              "my_app.api.ping",
              {},
              "GET",
            ),
          ),
        FrappeAPIError,
        "Request timed out after 20ms",
      );
      assertEquals(error.status, 408);
      assertEquals(mock.calls, 1);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FrappeClient timeout - headers and body share one deadline",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn() {
    const mock = mockStalledFetch("body");
    const stalledFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return stalledFetch(url, init);
    };
    try {
      const error = await assertRejects(
        () =>
          withinDeadline(
            makeClient({ timeoutMs: 300, retries: 0 }).callMethodRaw(
              "my_app.api.ping",
              {},
              "GET",
            ),
            // Un nouveau délai de 300 ms après les en-têtes dépasserait la garde.
            450,
          ),
        FrappeAPIError,
        "Request timed out after 300ms",
      );
      assertEquals(error.status, 408);
      assertEquals(mock.calls, 1);
    } finally {
      mock.restore();
    }
  },
});

Deno.test({
  name: "FrappeClient timeout - headers and body follow the same retry policy",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn(t) {
    const cases: Array<{
      name: string;
      config?: Record<string, unknown>;
      method?: "GET" | "POST";
      retry?: false;
      stalledAttempts?: number;
      calls: number;
      success?: boolean;
    }> = [
      { name: "GET recovers", stalledAttempts: 1, calls: 2, success: true },
      { name: "GET exhausts retries", calls: 4 },
      { name: "retry false", retry: false, calls: 1 },
      { name: "retries zero", config: { retries: 0 }, calls: 1 },
      { name: "408 excluded", config: { retryStatuses: [] }, calls: 1 },
      { name: "POST is not retried", method: "POST", calls: 1 },
      {
        name: "POST retries when configured",
        method: "POST",
        config: { retryMethods: ["POST"] },
        stalledAttempts: 1,
        calls: 2,
        success: true,
      },
    ];
    for (const phase of ["headers", "body"] as const) {
      for (const scenario of cases) {
        await t.step(`${phase}: ${scenario.name}`, async () => {
          const mock = mockStalledFetch(phase, scenario.stalledAttempts);
          try {
            const pending = withinDeadline(
              makeClient({ timeoutMs: 20, ...scenario.config }).callMethodRaw(
                "my_app.api.ping",
                {},
                scenario.method ?? "GET",
                { retry: scenario.retry },
              ),
            );
            if (scenario.success) {
              assertEquals(await pending, { docs: [] });
            } else {
              const error = await assertRejects(
                () => pending,
                FrappeAPIError,
                "Request timed out after 20ms",
              );
              assertEquals(error.status, 408);
            }
            assertEquals(mock.calls, scenario.calls);
          } finally {
            mock.restore();
          }
        });
      }
    }
  },
});

Deno.test({
  name:
    "FrappeClient timeout - a normal streamed body is parsed and leaves no timer",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn() {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of ['{"docs":[', '{"name":"Task"}]}']) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    try {
      assertEquals(
        await makeClient().callMethodRaw("my_app.api.ping", {}, "GET"),
        { docs: [{ name: "Task" }] },
      );
    } finally {
      globalThis.fetch = original;
    }
  },
});

Deno.test({
  name:
    "FrappeClient timeout - a body read failure is unchanged and leaves no timer",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn() {
    const original = globalThis.fetch;
    const bodyError = new TypeError("body stream failed");
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(bodyError);
          },
        }),
      );
    };
    try {
      const error = await assertRejects(
        () => makeClient().callMethodRaw("my_app.api.ping", {}, "GET"),
        TypeError,
      );
      assertEquals(error, bodyError);
      assertEquals(calls, 1);
    } finally {
      globalThis.fetch = original;
    }
  },
});

Deno.test({
  name:
    "FrappeClient timeout - caller abort during body read remains 499 without retry",
  sanitizeOps: true,
  sanitizeResources: true,
  async fn() {
    const original = globalThis.fetch;
    const caller = new AbortController();
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      return new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            }, { once: true });
          },
          pull() {
            caller.abort();
          },
        }, { highWaterMark: 0 }),
      );
    };
    try {
      const error = await assertRejects(
        () =>
          withinDeadline(
            makeClient().callMethodRaw("my_app.api.ping", {}, "GET", {
              signal: caller.signal,
            }),
          ),
        FrappeAPIError,
        "aborted",
      );
      assertEquals(error.status, 499);
      assertEquals(calls, 1);
    } finally {
      globalThis.fetch = original;
    }
  },
});

Deno.test("FrappeClient retry - GET 503 succeeds on second attempt", async () => {
  const restore = mockFetch([
    { status: 503, body: { message: "Service Unavailable" } },
    {
      status: 200,
      body: { data: [{ name: "CUST-001", customer_name: "Acme" }] },
    },
  ]);

  try {
    const client = makeClient();
    const result = await client.list("Customer");
    assertEquals(result.length, 1);
    assertEquals(result[0].name, "CUST-001");
    assertEquals(callCountRef.current, 2);
  } finally {
    restore();
  }
});

Deno.test("FrappeClient retry - GET retries up to configured max then throws", async () => {
  const restore = mockFetch([
    { status: 503, body: { message: "Service Unavailable" } },
    { status: 503, body: { message: "Service Unavailable" } },
    { status: 503, body: { message: "Service Unavailable" } },
    { status: 503, body: { message: "Service Unavailable" } },
  ]);

  try {
    const client = makeClient({ retries: 2 });
    await assertRejects(
      () => client.list("Customer"),
      FrappeAPIError,
      "HTTP 503",
    );
    // 1 initial attempt + 2 retries = 3 calls total
    assertEquals(callCountRef.current, 3);
  } finally {
    restore();
  }
});

Deno.test("FrappeClient retry - 404 is not retried", async () => {
  const restore = mockFetch([
    { status: 404, body: { message: "Document not found" } },
  ]);

  try {
    const client = makeClient();
    await assertRejects(
      () => client.get("Customer", "MISSING"),
      FrappeAPIError,
      "HTTP 404",
    );
    assertEquals(callCountRef.current, 1);
  } finally {
    restore();
  }
});

Deno.test("FrappeClient retry - retries disabled when retries=0", async () => {
  const restore = mockFetch([
    { status: 503, body: { message: "Service Unavailable" } },
  ]);

  try {
    const client = makeClient({ retries: 0 });
    await assertRejects(
      () => client.list("Customer"),
      FrappeAPIError,
      "HTTP 503",
    );
    assertEquals(callCountRef.current, 1);
  } finally {
    restore();
  }
});

Deno.test("FrappeClient retry - 429 surfaces Retry-After header on FrappeAPIError", async () => {
  const restore = mockFetch([
    {
      status: 429,
      body: { message: "Too Many Requests" },
      headers: { "retry-after": "0" },
    },
    {
      status: 200,
      body: { data: [] },
    },
  ]);

  try {
    const client = makeClient();
    const result = await client.list("Customer");
    assertEquals(result.length, 0);
    assertEquals(callCountRef.current, 2);
  } finally {
    restore();
  }
});

// ── Robust JSON parsing ──────────────────────────────────────────────────────

Deno.test("FrappeClient parsing - malformed JSON in error body falls back to text", async () => {
  const restore = mockFetch([
    {
      status: 500,
      // Server claims JSON but returns broken markup (HTML error page is common)
      contentType: "application/json",
      body: null,
      rawBody: "<html><body>500 Internal Server Error</body></html>",
    },
  ]);

  try {
    const client = makeClient({ retries: 0 });
    const error = await assertRejects(
      () => client.get("Customer", "ANY"),
      FrappeAPIError,
      "HTTP 500",
    );
    // Body must surface the raw text rather than crashing on JSON.parse
    assertEquals(typeof error.body, "string");
  } finally {
    restore();
  }
});

// ── Caching ──────────────────────────────────────────────────────────────────

Deno.test("FrappeClient.get() - caches result, second call skips fetch", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({ data: { name: "CUST-001" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.get("Customer", "CUST-001");
    await client.get("Customer", "CUST-001");
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.get() - skipCache bypasses the cached read", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({ data: { name: "CUST-001" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.get("Customer", "CUST-001");
    await client.get("Customer", "CUST-001", { skipCache: true });
    assertEquals(fetchCount, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.list() - caches result for identical options", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({ data: [{ name: "CUST-001" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.list("Customer", { limit: 10 });
    await client.list("Customer", { limit: 10 });
    assertEquals(fetchCount, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.list() - skipCache bypasses the cached read", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({ data: [{ name: "CUST-001" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.list("Customer", { limit: 10 });
    await client.list("Customer", { limit: 10 }, { skipCache: true });
    assertEquals(fetchCount, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.create() - invalidates the list cache for that doctype", async () => {
  let fetchCount = 0;
  let created = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init?: RequestInit) => {
    fetchCount++;
    if (init?.method === "POST") {
      created = true;
      return new Response(
        JSON.stringify({ data: { name: "CUST-002" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        data: created ? [{ name: "CUST-001" }, { name: "CUST-002" }] : [{
          name: "CUST-001",
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    const before = await client.list("Customer", { limit: 10 });
    assertEquals(before.length, 1);

    await client.create("Customer", { customer_name: "New Corp" });

    const after = await client.list("Customer", { limit: 10 });
    assertEquals(after.length, 2);
    assertEquals(fetchCount, 3); // initial list, create, refreshed list
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.delete() - invalidates both the list cache and the cached get() for that name", async () => {
  let fetchCount = 0;
  let deleted = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init?: RequestInit) => {
    fetchCount++;
    if (init?.method === "DELETE") {
      deleted = true;
      return new Response("", { status: 202 });
    }
    if (deleted) {
      return new Response(
        JSON.stringify({ message: "Document not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ data: { name: "CUST-001" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.get("Customer", "CUST-001");
    await client.delete("Customer", "CUST-001");

    await assertRejects(
      () => client.get("Customer", "CUST-001"),
      FrappeAPIError,
      "HTTP 404",
    );
    assertEquals(fetchCount, 3); // initial get, delete, refreshed (now-404) get
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.update() - invalidates the cached get() for that name", async () => {
  let fetchCount = 0;
  let updated = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init?: RequestInit) => {
    fetchCount++;
    if (init?.method === "PUT") {
      updated = true;
      return new Response(
        JSON.stringify({
          data: { name: "CUST-001", customer_name: "Updated" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        data: {
          name: "CUST-001",
          customer_name: updated ? "Updated" : "Original",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    const before = await client.get("Customer", "CUST-001");
    assertEquals(before.customer_name, "Original");

    await client.update("Customer", "CUST-001", { customer_name: "Updated" });

    const after = await client.get("Customer", "CUST-001");
    assertEquals(after.customer_name, "Updated");
    assertEquals(fetchCount, 3); // initial get, update, refreshed get
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.invalidate() - clears list cache for a doctype", async () => {
  let fetchCount = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return new Response(
      JSON.stringify({ data: [{ name: "CUST-001" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const client = makeClient();
    await client.list("Customer", { limit: 10 });
    client.invalidate("Customer");
    await client.list("Customer", { limit: 10 });
    assertEquals(fetchCount, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.invalidate() - clears resolveLink's negative-match cache for a doctype", () => {
  const cache = new MemoryCache();
  const client = makeClient({ cache });
  cache.set("resolve:miss:Customer:Acme", true, 15_000);

  client.invalidate("Customer");

  assertEquals(cache.get("resolve:miss:Customer:Acme"), undefined);
});

// ── callMethod ────────────────────────────────────────────────────────────────

Deno.test("FrappeClient.callMethod() - defaults to POST with a JSON body", async () => {
  const original = globalThis.fetch;
  let seen: { url: string; method: string; body: unknown } | undefined;
  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    seen = {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body,
    };
    return jsonResponse({ message: 42 });
  };

  try {
    const client = makeClient();
    const result = await client.callMethod("frappe.client.get_count", {
      doctype: "Task",
    });
    assertEquals(result, 42);
    assertEquals(
      seen?.url,
      "http://localhost:8000/api/method/frappe.client.get_count",
    );
    assertEquals(seen?.method, "POST");
    assertEquals(seen?.body, JSON.stringify({ doctype: "Task" }));
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethod() - GET encodes args into the query string", async () => {
  const original = globalThis.fetch;
  let seen: { url: string; method: string; body: unknown } | undefined;
  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    seen = {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body,
    };
    return jsonResponse({ message: { ok: true } });
  };

  try {
    const client = makeClient();
    const result = await client.callMethod(
      "my_app.api.status",
      { doctype: "Task", limit: 5 },
      "GET",
    );
    assertEquals(result, { ok: true });
    assertEquals(seen?.method, "GET");
    assertEquals(seen?.body, undefined);
    const url = new URL(seen!.url);
    assertEquals(url.pathname, "/api/method/my_app.api.status");
    assertEquals(url.searchParams.get("doctype"), "Task");
    assertEquals(url.searchParams.get("limit"), "5");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethod() - GET with no args omits the query string", async () => {
  const original = globalThis.fetch;
  let seenUrl: string | undefined;
  globalThis.fetch = async (
    url: string | URL | Request,
  ): Promise<Response> => {
    seenUrl = String(url);
    return jsonResponse({ message: null });
  };

  try {
    const client = makeClient();
    await client.callMethod("my_app.api.ping", {}, "GET");
    assertEquals(seenUrl, "http://localhost:8000/api/method/my_app.api.ping");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethodRaw() - returns the whole body for methods that fill frappe.response", async () => {
  const original = globalThis.fetch;
  let seen: { url: string; method: string } | undefined;
  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    seen = { url: String(url), method: init?.method ?? "GET" };
    // `getdoctype` ne renvoie rien : il écrit `docs` dans frappe.response.
    return jsonResponse({ docs: [{ name: "Task", fields: [] }] });
  };

  try {
    const client = makeClient();
    const body = await client.callMethodRaw(
      "frappe.desk.form.load.getdoctype",
      { doctype: "Task" },
      "GET",
    );
    assertEquals(body, { docs: [{ name: "Task", fields: [] }] });
    assertEquals(seen?.method, "GET");
    assertEquals(
      new URL(seen!.url).searchParams.get("doctype"),
      "Task",
    );
    assertEquals(
      await client.callMethod("frappe.desk.form.load.getdoctype", {}, "GET"),
      undefined,
    );
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethodRaw() - propagates HTTP errors as FrappeAPIError", async () => {
  const restore = mockFetch([{
    status: 403,
    body: { exc_type: "PermissionError", message: "No permission" },
  }]);
  try {
    await assertRejects(
      () => makeClient().callMethodRaw("my_app.api.secret", {}, "GET"),
      FrappeAPIError,
    );
  } finally {
    restore();
  }
});

Deno.test("FrappeClient.callMethodRaw() - { retry: false } makes a single attempt on a transient failure", async () => {
  const transient = {
    status: 503,
    body: { exc_type: "ServiceUnavailable", message: "Busy" },
  };
  // Par défaut, le client reprend un 503 sur GET : le 2e appel réussit.
  let restore = mockFetch([transient, { status: 200, body: { docs: [] } }]);
  try {
    assertEquals(
      await makeClient().callMethodRaw("my_app.api.ping", {}, "GET"),
      { docs: [] },
    );
    assertEquals(callCountRef.current, 2);
  } finally {
    restore();
  }

  // Avec `retry: false`, le même 503 remonte tel quel après une seule tentative.
  restore = mockFetch([transient, { status: 200, body: { docs: [] } }]);
  try {
    const error = await assertRejects(
      () =>
        makeClient().callMethodRaw("my_app.api.ping", {}, "GET", {
          retry: false,
        }),
      FrappeAPIError,
    );
    assertEquals(error.status, 503);
    assertEquals(callCountRef.current, 1);
  } finally {
    restore();
  }
});

Deno.test("FrappeClient.callMethodRaw() - an abort signal cancels the request without any retry", async () => {
  const original = globalThis.fetch;
  let fetchCalls = 0;
  let fetchSignal: AbortSignal | null | undefined;
  // Un serveur qui ne répond jamais : seul le signal met fin à l'attente.
  globalThis.fetch = (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    fetchCalls++;
    fetchSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
      );
    });
  };

  try {
    const controller = new AbortController();
    const pending = makeClient({ retries: 3 }).callMethodRaw(
      "my_app.api.ping",
      {},
      "GET",
      { signal: controller.signal },
    );
    controller.abort();
    const error = await assertRejects(() => pending, FrappeAPIError);
    // L'abandon vient de l'appelant : ni 408 (délai) ni 0 (réseau), jamais repris.
    assertEquals(error.status, 499);
    assertEquals(error.message.includes("aborted"), true);
    assertEquals(fetchCalls, 1);
    assertEquals(fetchSignal?.aborted, true);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethodRaw() - an already aborted signal fails fast without touching the network", async () => {
  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (): Promise<Response> => {
    fetchCalls++;
    return Promise.resolve(jsonResponse({ docs: [] }));
  };

  try {
    const error = await assertRejects(
      () =>
        makeClient().callMethodRaw("my_app.api.ping", {}, "GET", {
          signal: AbortSignal.abort(),
        }),
      FrappeAPIError,
    );
    assertEquals(error.status, 499);
    assertEquals(fetchCalls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("FrappeClient.callMethodRaw() - an abort signal also interrupts the retry backoff", async () => {
  // 1er essai : 503, puis une attente de 10 s avant la reprise.
  const restore = mockFetch([
    { status: 503, body: { message: "Busy" } },
    { status: 200, body: { docs: [] } },
  ]);
  try {
    const controller = new AbortController();
    const startedAt = performance.now();
    const pending = makeClient({ retryBackoffMs: 10_000 }).callMethodRaw(
      "my_app.api.ping",
      {},
      "GET",
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 20);
    const error = await assertRejects(() => pending, FrappeAPIError);
    assertEquals(error.status, 499);
    assertEquals(callCountRef.current, 1);
    assertEquals(performance.now() - startedAt < 2000, true);
  } finally {
    restore();
  }
});

Deno.test("normalizeFrappeSiteUrl strips credentials, query, fragment, and trailing slash", () => {
  assertEquals(
    normalizeFrappeSiteUrl(
      "https://user:secret@erp.example.com:8443/site-a/?x=1#frag",
    ),
    "https://erp.example.com:8443/site-a",
  );
  assertEquals(
    normalizeFrappeSiteUrl("http://localhost:8000/"),
    "http://localhost:8000",
  );
});

Deno.test("FrappeClient.normalizedSiteUrl is derived from the configured client, not a caller label", () => {
  const client = makeClient({
    baseUrl: "https://user:secret@erp.example.com/site-a/",
  });
  assertEquals(client.normalizedSiteUrl(), "https://erp.example.com/site-a");
});

Deno.test("normalizeFrappeSiteUrl rejects non-http URLs", () => {
  assertThrows(
    () => normalizeFrappeSiteUrl("file:///tmp/erp"),
    Error,
    "http or https",
  );
});
