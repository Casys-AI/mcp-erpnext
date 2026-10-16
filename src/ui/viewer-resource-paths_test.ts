import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  isViewerNetAllowed,
  readViewerDist,
  remoteViewerNetTarget,
  resolveViewerDistPath,
  VIEWER_FETCH_TIMEOUT_MS,
  viewerNetRecovery,
} from "./viewer-resource-paths.ts";
import {
  isViewerResourceError,
  VIEWER_RESOURCE_ERROR_CODES,
  ViewerResourceError,
} from "./viewer-errors.ts";

Deno.test("resolveViewerDistPath prefers source dist in repo mode", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/server.ts",
    "kanban-viewer",
    (path: string) =>
      path === "/workspace/lib/erpnext/src/ui/dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "/workspace/lib/erpnext/src/ui/dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath falls back to packaged ui-dist for npm bundle", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/dist-node/bin/mcp-erpnext.mjs",
    "kanban-viewer",
    (path: string) =>
      path ===
        "/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath resolves Windows file URLs for packaged ui-dist", () => {
  const resolved = resolveViewerDistPath(
    "file:///C:/workspace/lib/erpnext/dist-node/bin/mcp-erpnext.mjs",
    "kanban-viewer",
    (path: string) =>
      path ===
        "C:/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );

  assertEquals(
    resolved,
    "C:/workspace/lib/erpnext/dist-node/bin/ui-dist/kanban-viewer/index.html",
  );
});

Deno.test("resolveViewerDistPath returns null when no viewer build exists", () => {
  const resolved = resolveViewerDistPath(
    "file:///workspace/lib/erpnext/server.ts",
    "kanban-viewer",
    () => false,
  );

  assertEquals(resolved, null);
});

Deno.test("resolveViewerDistPath preserves the published JSR viewer URL", () => {
  let localProbeCalled = false;
  const resolved = resolveViewerDistPath(
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/server.ts",
    "doc-viewer",
    () => {
      localProbeCalled = true;
      return false;
    },
  );

  assertEquals(
    resolved,
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
  );
  assertEquals(localProbeCalled, false);
});

Deno.test("readViewerDist fetches a published viewer URL", async () => {
  const calls: string[] = [];
  const html = await readViewerDist(
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
    () => Promise.reject(new Error("local reader must not run")),
    {
      cache: new Map(),
      fetchRemote: (url) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve("<html>published viewer</html>"),
        });
      },
    },
  );

  assertEquals(html, "<html>published viewer</html>");
  assertEquals(calls, [
    "https://jsr.io/@casys/mcp-erpnext/3.1.0-beta.3/src/ui/dist/doc-viewer/index.html",
  ]);
});

Deno.test("readViewerDist keeps local npm and repository reads local", async () => {
  const calls: string[] = [];
  const html = await readViewerDist(
    "/workspace/ui-dist/doc-viewer/index.html",
    (path) => {
      calls.push(path);
      return Promise.resolve("<html>local viewer</html>");
    },
    {
      fetchRemote: () => Promise.reject(new Error("remote fetch must not run")),
    },
  );

  assertEquals(html, "<html>local viewer</html>");
  assertEquals(calls, ["/workspace/ui-dist/doc-viewer/index.html"]);
});

// ─── Remote viewers: permission gate (pure decisions) ────

const JSR_VIEWER =
  "https://jsr.io/@casys/mcp-erpnext/3.1.0/src/ui/dist/kpi-viewer/index.html";

Deno.test("remoteViewerNetTarget makes the port explicit for remote URLs", () => {
  assertEquals(remoteViewerNetTarget(JSR_VIEWER), "jsr.io:443");
  assertEquals(
    remoteViewerNetTarget("http://example.test/a.html"),
    "example.test:80",
  );
  assertEquals(
    remoteViewerNetTarget("https://example.test:8443/a.html"),
    "example.test:8443",
  );
});

Deno.test("remoteViewerNetTarget is null for local paths", () => {
  assertEquals(remoteViewerNetTarget("/workspace/ui-dist/x/index.html"), null);
  assertEquals(
    remoteViewerNetTarget("C:/workspace/ui-dist/x/index.html"),
    null,
  );
  assertEquals(remoteViewerNetTarget("file:///workspace/x/index.html"), null);
});

Deno.test("isViewerNetAllowed accepts only an explicit grant", () => {
  assertEquals(isViewerNetAllowed("granted"), true);
  assertEquals(isViewerNetAllowed("prompt"), false);
  assertEquals(isViewerNetAllowed("denied"), false);
});

Deno.test("viewerNetRecovery names the flag and the npm alternative", () => {
  const recovery = viewerNetRecovery("jsr.io");
  assert(recovery.includes("--allow-net=jsr.io"));
  assert(recovery.includes("npx -y @casys/mcp-erpnext"));
});

// ─── Remote viewers: memoisation, timeout, structured errors ───

function okResponse(body: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(body),
  };
}

function statusResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: "nope",
    text: () => Promise.resolve("<html>SECRET-BODY</html>"),
  };
}

const noLocal = () => Promise.reject(new Error("local reader must not run"));

async function failureOf(
  promise: Promise<unknown>,
): Promise<ViewerResourceError> {
  const error = await assertRejects(() => promise);
  assert(isViewerResourceError(error), "expected a ViewerResourceError");
  return error;
}

Deno.test("VIEWER_FETCH_TIMEOUT_MS is 15 seconds", () => {
  assertEquals(VIEWER_FETCH_TIMEOUT_MS, 15_000);
});

Deno.test("readViewerDist memoises a remote fetch per URL", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const fetchRemote = () => {
    calls++;
    return Promise.resolve(okResponse("<html>kpi</html>"));
  };

  const first = await readViewerDist(JSR_VIEWER, noLocal, {
    cache,
    fetchRemote,
  });
  const second = await readViewerDist(JSR_VIEWER, noLocal, {
    cache,
    fetchRemote,
  });

  assertEquals(first, "<html>kpi</html>");
  assertEquals(second, "<html>kpi</html>");
  assertEquals(calls, 1);
});

Deno.test("readViewerDist shares one request between concurrent reads", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const fetchRemote = () => {
    calls++;
    return Promise.resolve(okResponse("<html>kpi</html>"));
  };

  const [a, b] = await Promise.all([
    readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
    readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
  ]);

  assertEquals([a, b], ["<html>kpi</html>", "<html>kpi</html>"]);
  assertEquals(calls, 1);
});

Deno.test("readViewerDist does not share the memo between distinct URLs", async () => {
  const cache = new Map<string, Promise<string>>();
  const seen: string[] = [];
  const fetchRemote = (url: string) => {
    seen.push(url);
    return Promise.resolve(okResponse(`<html>${url}</html>`));
  };
  const other = JSR_VIEWER.replace("kpi-viewer", "doc-viewer");

  const a = await readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote });
  const b = await readViewerDist(other, noLocal, { cache, fetchRemote });

  assertEquals(seen, [JSR_VIEWER, other]);
  assert(a !== b);
});

Deno.test("readViewerDist forgets a failed fetch so the next read retries", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const fetchRemote = () => {
    calls++;
    return calls === 1
      ? Promise.reject(new TypeError("connection reset"))
      : Promise.resolve(okResponse("<html>second try</html>"));
  };

  const error = await failureOf(
    readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
  );
  assertEquals(error.code, "VIEWER_REMOTE_NETWORK_ERROR");
  assertEquals(cache.size, 0);

  const html = await readViewerDist(JSR_VIEWER, noLocal, {
    cache,
    fetchRemote,
  });
  assertEquals(html, "<html>second try</html>");
  assertEquals(calls, 2);
});

Deno.test("readViewerDist retries after a concurrent failure", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  const fetchRemote = () => {
    calls++;
    return calls === 1
      ? Promise.reject(new TypeError("boom"))
      : Promise.resolve(okResponse("<html>ok</html>"));
  };

  const results = await Promise.allSettled([
    readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
    readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
  ]);
  assertEquals(results.map((r) => r.status), ["rejected", "rejected"]);
  assertEquals(calls, 1);

  assertEquals(
    await readViewerDist(JSR_VIEWER, noLocal, { cache, fetchRemote }),
    "<html>ok</html>",
  );
  assertEquals(calls, 2);
});

Deno.test("readViewerDist never memoises local reads", async () => {
  const cache = new Map<string, Promise<string>>();
  let reads = 0;
  const readLocal = () => Promise.resolve(`<html>v${++reads}</html>`);

  assertEquals(
    await readViewerDist("/ui-dist/x/index.html", readLocal, { cache }),
    "<html>v1</html>",
  );
  assertEquals(
    await readViewerDist("/ui-dist/x/index.html", readLocal, { cache }),
    "<html>v2</html>",
  );
  assertEquals(cache.size, 0);
});

Deno.test("readViewerDist passes an abort signal to the fetch", async () => {
  let signal: AbortSignal | undefined;
  await readViewerDist(JSR_VIEWER, noLocal, {
    cache: new Map(),
    fetchRemote: (_url, init) => {
      signal = init?.signal;
      return Promise.resolve(okResponse("<html/>"));
    },
  });
  assert(signal instanceof AbortSignal);
});

Deno.test("readViewerDist times out a fetch that never answers", async () => {
  const cache = new Map<string, Promise<string>>();
  const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
    cache,
    timeoutMs: 20,
    fetchRemote: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        );
      }),
  }));

  assertEquals(error.code, "VIEWER_REMOTE_TIMEOUT");
  assertEquals(error.retryable, true);
  assertEquals(error.context.timeoutMs, 20);
  assertEquals(error.context.host, "jsr.io:443");
  assertEquals(cache.size, 0);
});

Deno.test("readViewerDist times out a body that stays pending", async () => {
  const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
    cache: new Map(),
    timeoutMs: 20,
    // Ignores the signal on purpose: the body read must still be bounded.
    fetchRemote: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => new Promise<string>(() => {}),
      }),
  }));

  assertEquals(error.code, "VIEWER_REMOTE_TIMEOUT");
});

Deno.test("readViewerDist maps NotCapable to a permission error with recovery", async () => {
  for (const name of ["NotCapable", "PermissionDenied"]) {
    const denied = new Error('Requires net access to "jsr.io:443"');
    denied.name = name;
    const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
      cache: new Map(),
      fetchRemote: () => Promise.reject(denied),
    }));

    assertEquals(error.code, "VIEWER_REMOTE_PERMISSION_DENIED");
    assertEquals(error.retryable, false);
    assert(error.recovery.includes("--allow-net=jsr.io"));
    assertEquals(error.context.url, JSR_VIEWER);
  }
});

Deno.test("readViewerDist classifies HTTP statuses (retryable only for 5xx and 429)", async () => {
  const expected: Array<[number, boolean]> = [
    [404, false],
    [403, false],
    [429, true],
    [500, true],
    [503, true],
  ];
  for (const [status, retryable] of expected) {
    const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
      cache: new Map(),
      fetchRemote: () => Promise.resolve(statusResponse(status)),
    }));
    assertEquals(error.code, "VIEWER_REMOTE_HTTP_ERROR");
    assertEquals(error.context.status, status);
    assertEquals(error.retryable, retryable);
  }
});

Deno.test("readViewerDist errors are parseable JSON with a closed code and no body", async () => {
  const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
    cache: new Map(),
    fetchRemote: () => Promise.resolve(statusResponse(500)),
  }));

  const wire = JSON.parse(error.message);
  assertEquals(
    Object.keys(wire).sort(),
    ["code", "context", "message", "recovery", "retryable"],
  );
  assert(
    (VIEWER_RESOURCE_ERROR_CODES as readonly string[]).includes(wire.code),
  );
  assertEquals(wire.code, error.code);
  assertEquals(wire.context, {
    url: JSR_VIEWER,
    host: "jsr.io:443",
    status: 500,
  });
  assert(!error.message.includes("SECRET-BODY"));
  assert(error.message.length < 1_000);
});

Deno.test("readViewerDist rethrows a structured error untouched", async () => {
  const original = new ViewerResourceError("VIEWER_REMOTE_HTTP_ERROR", "x", {
    context: { url: JSR_VIEWER, host: "jsr.io:443", status: 418 },
    recovery: "r",
  });
  const error = await failureOf(readViewerDist(JSR_VIEWER, noLocal, {
    cache: new Map(),
    fetchRemote: () => Promise.reject(original),
  }));
  assert(error === original);
});
