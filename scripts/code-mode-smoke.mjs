// After the viewer and Node builds: node --test scripts/code-mode-smoke.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveDistTag } from "./release-guard.mjs";

const VERSION = "2026-07-28";
const APP_MIME = "text/html;profile=mcp-app";
const APP_CAPABILITIES = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [APP_MIME] } },
};
const VIEW_META = "dev.mcpview/declared-view";
const ERP_VIEWER_META = "io.casys/viewer";
const CONFIRM_META = "io.casys/erpnext-write-confirmation";
const EXECUTION_REFERENCE_META = "io.casys/erpnext-execution-ref";
const SNIPPET_EVENT_META = "io.casys/erpnext-snippet-event";
const EXECUTE_VIEW = "ui://mcp-erpnext/code-mode/v3";
const LEGACY_EXECUTE_VIEWS = [
  "ui://mcp-erpnext/code-mode",
  "ui://mcp-erpnext/code-mode/v2",
];
const INVOICE_VIEW = "ui://mcp-erpnext/invoice-viewer";
const LIST_VIEW = "ui://mcp-erpnext/doclist-viewer";
const INVOICE_ID = "SINV-SMOKE-0001";
const TASK_ID = "TASK-SMOKE-0001";
const LIST = "erpnext_sales_invoice_list";
const GET = "erpnext_sales_invoice_get";
const UPDATE = "erpnext_doc_update";
const GENERIC = "erpnext_method_call";
const CONFIRM = "erpnext_confirm_write";
const UPLOAD = "erpnext_file_upload";
const ISSUER = "https://identity.synthetic.invalid";
const AUDIENCE = "https://resource.synthetic.invalid/mcp";
const FIXTURE_INVOICE = {
  doctype: "Sales Invoice",
  name: INVOICE_ID,
  customer: "CUST-SMOKE",
  posting_date: "2026-09-01",
  due_date: "2026-09-30",
  currency: "EUR",
  grand_total: 252,
  outstanding_amount: 84,
  status: "Overdue",
  items: [],
};

function installPackage(cwd) {
  const binDir = fileURLToPath(new URL("../dist-node/bin", import.meta.url));
  const npm = (args) => execFileSync("npm", args, { cwd, encoding: "utf8" });
  const [packed] = JSON.parse(
    npm(["pack", "--json", "--ignore-scripts", binDir]),
  );
  assert.equal(packed.name, "@casys/mcp-erpnext");
  assert.ok(
    packed.files.some(({ path }) =>
      path === "skills/erpnext-code-mode/SKILL.md"
    ),
  );
  npm([
    "install",
    "--ignore-scripts",
    "--offline",
    "--no-package-lock",
    "--no-audit",
    "--no-fund",
    join(cwd, packed.filename),
  ]);
  return {
    bin: join(cwd, "node_modules", ".bin", "mcp-erpnext"),
    version: packed.version,
  };
}

async function startFrappe(t) {
  const requests = [];
  const updates = [];
  const uploads = [];
  const unexpected = [];
  const task = { doctype: "Task", name: TASK_ID, status: "Open" };
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwks = {
    keys: [{ ...publicKey.export({ format: "jwk" }), kid: "smoke" }],
  };
  const bearerFor = (sub) => {
    const encode = (data) =>
      Buffer.from(JSON.stringify(data)).toString("base64url");
    const unsigned = encode({ alg: "RS256", kid: "smoke" }) + "." + encode({
      sub,
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 120,
    });
    return unsigned + "." + sign("sha256", Buffer.from(unsigned), privateKey)
      .toString("base64url");
  };
  const invoicePath = "/api/resource/Sales%20Invoice";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const request = req.method + " " + url.pathname;
    res.setHeader("Content-Type", "application/json");
    if (request === "GET /jwks") return res.end(JSON.stringify(jwks));
    requests.push(request);
    let body;
    if (req.headers.authorization === "token smoke-key:smoke-secret") {
      if (request === "GET " + invoicePath) {
        body = { data: [FIXTURE_INVOICE] };
      } else if (request === "GET " + invoicePath + "/" + INVOICE_ID) {
        body = { data: FIXTURE_INVOICE };
      } else if (
        request === "GET /api/method/frappe.desk.form.load.getdoctype"
      ) {
        body = { docs: [{ fields: [] }] };
      } else if (request === "PUT /api/resource/Task/" + TASK_ID) {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const { data: fields } = JSON.parse(raw);
        if (
          fields && Object.keys(fields).length === 1 &&
          ["Open", "Working", "Completed"].includes(fields.status)
        ) {
          task.status = fields.status;
          updates.push(fields.status);
          body = { data: task };
        }
      } else if (request === "POST /api/method/upload_file") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const form = await new Response(Buffer.concat(chunks), {
          headers: { "Content-Type": req.headers["content-type"] },
        }).formData();
        const file = form.get("file");
        if (
          file instanceof File && form.get("doctype") === "Task" &&
          form.get("docname") === TASK_ID && form.get("is_private") === "1"
        ) {
          uploads.push({
            name: file.name,
            bytes: file.size,
            sha256: createHash("sha256").update(
              Buffer.from(await file.arrayBuffer()),
            ).digest("hex"),
          });
          body = { message: { name: "FILE-SMOKE-0001", file_name: file.name } };
        }
      }
    }
    if (!body) {
      unexpected.push(request);
      res.statusCode = 404;
      body = { message: "Unexpected request to the synthetic Frappe fixture" };
    }
    res.end(JSON.stringify(body));
  });
  server.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  return {
    url: "http://127.0.0.1:" + server.address().port,
    requests,
    updates,
    uploads,
    unexpected,
    bearerFor,
  };
}

function spawnServer(t, bin, cwd, env, args, stdio) {
  const child = spawn(bin, args, {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    stdio,
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      return;
    }
    const exited = once(child, "exit");
    child.kill();
    await exited;
  });
  return child;
}

function startStdio(t, bin, cwd, env) {
  const child = spawnServer(t, bin, cwd, env, [], ["pipe", "pipe", "pipe"]);
  const lines = createInterface({ input: child.stdout })
    [Symbol.asyncIterator]();
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4096);
  });
  t.after(() => lines.return());
  return async (message) => {
    child.stdin.write(JSON.stringify(message) + "\n");
    const { value: line, done } = await lines.next();
    assert.equal(done, false, "MCP server exited before replying\n" + stderr);
    return JSON.parse(line);
  };
}

function startHttp(t, bin, cwd, env) {
  const child = spawnServer(t, bin, cwd, env, ["--http", "--port=0"], [
    "ignore",
    "ignore",
    "pipe",
  ]);
  let stderr = "";
  return new Promise((resolve, reject) => {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(
        /HTTP server listening[^\r\n]* on (http:\/\/127\.0\.0\.1:\d+)/,
      );
      if (match) resolve(new URL("/mcp", match[1]));
    });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(stderr)));
  });
}

function httpExchange(url, token) {
  return async (message) => {
    const name = message.params.name ?? message.params.uri;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": VERSION,
        "Mcp-Method": message.method,
        ...(name && { "Mcp-Name": name }),
        ...(token && { Authorization: "Bearer " + token }),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    return { ...await response.json(), status: response.status };
  };
}

function makeClient(exchange, capabilities = {}) {
  let id = 0;
  return async (method, params = {}) => {
    const message = {
      jsonrpc: "2.0",
      id: ++id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": capabilities,
        },
      },
    };
    const reply = await exchange(message);
    if (reply.status !== 401) {
      assert.equal(reply.id, message.id, JSON.stringify(reply));
    }
    return reply;
  };
}

function result(reply) {
  assert.ok(reply.result && !reply.error, JSON.stringify(reply));
  return reply.result;
}

function failed(reply) {
  assert.ok(
    reply.error || reply.result?.isError === true,
    JSON.stringify(reply),
  );
}

function call(client, name, args, retry = {}) {
  return client("tools/call", { name, arguments: args, ...retry });
}

function execute(client, code, retry) {
  return call(client, "execute", { code }, retry);
}

function assertInvoiceView(output, resourceUri, toolName, args) {
  assert.equal(output.isError, undefined, JSON.stringify(output));
  assert.deepEqual(
    JSON.parse(output.content[0].text),
    output.structuredContent,
  );
  assert.equal(output._meta.ui.resourceUri, resourceUri);
  assert.deepEqual(output._meta[ERP_VIEWER_META].refreshRequest, {
    toolName,
    arguments: args,
  });
}

async function checkModel(client, fixture) {
  const { tools } = result(await client("tools/list"));
  assert.deepEqual(tools.map((tool) => tool.name), ["execute"]);
  assert.equal(tools[0].annotations.readOnlyHint, false);
  const start = fixture.requests.length;
  const catalog = result(await execute(client, "return erp.catalog"));
  assert.equal(catalog.isError, undefined, JSON.stringify(catalog));
  const { value: operations } = catalog.structuredContent;
  for (const name of [LIST, GET]) {
    assert.equal(
      operations.find((tool) => tool.name === name)?.annotations?.readOnlyHint,
      true,
    );
  }
  for (const name of [UPDATE, GENERIC]) {
    assert.equal(
      operations.find((tool) => tool.name === name)?.annotations?.readOnlyHint,
      false,
    );
  }

  const projection = result(
    await execute(
      client,
      'const list = await erp.call("' + LIST +
        '", { status: "Overdue", limit: 1 });' +
        'const invoice = await erp.call("' + GET +
        '", { name: list.data[0].name });' +
        "return { id: invoice.data.name, due: invoice.data.outstanding_amount };",
    ),
  );
  assert.equal(projection.isError, undefined, JSON.stringify(projection));
  assert.deepEqual(projection.structuredContent?.value, {
    id: INVOICE_ID,
    due: 84,
  });
  assert.equal(projection._meta?.[VIEW_META], undefined);
  const reads = fixture.requests.slice(start);
  assert.ok(reads.includes("GET /api/resource/Sales%20Invoice"));
  assert.ok(reads.includes("GET /api/resource/Sales%20Invoice/" + INVOICE_ID));

  const before = fixture.requests.length;
  failed(await execute(client, updateProgram("Working")));
  failed(
    await execute(
      client,
      'return await erp.call("' + GENERIC +
        '", { method: "smoke.api.read_marker", http_method: "GET" })',
    ),
  );
  failed(await call(client, GET, { name: INVOICE_ID }));
  assert.equal(fixture.requests.length, before);
}

async function checkApp(client) {
  const { tools } = result(await client("tools/list"));
  const modelTools = tools.filter((tool) =>
    !tool._meta?.ui?.visibility ||
    tool._meta.ui.visibility.includes("model")
  );
  assert.deepEqual(modelTools.map((tool) => tool.name), ["execute"]);
  assert.equal(modelTools[0]._meta.ui.resourceUri, EXECUTE_VIEW);
  assert.equal(modelTools[0]._meta["openai/outputTemplate"], EXECUTE_VIEW);
  const { resources } = result(await client("resources/list"));
  assert.equal(
    resources.find(({ uri }) => uri === EXECUTE_VIEW)?.name,
    "ERPNext",
  );
  for (const legacyUri of LEGACY_EXECUTE_VIEWS) {
    assert.match(
      resources.find(({ uri }) => uri === legacyUri)?.name ?? "",
      /compatibility/i,
    );
  }
  for (const name of [LIST, GET, UPDATE, CONFIRM]) {
    assert.deepEqual(
      tools.find((tool) => tool.name === name)?._meta?.ui?.visibility,
      ["app"],
    );
  }

  const list = result(
    await execute(client, 'return await erp.call("' + LIST + '", {})'),
  );
  assertInvoiceView(list, LIST_VIEW, LIST, {});
  assert.equal(list._meta[VIEW_META].resourceUri, LIST_VIEW);
  assert.equal(list.structuredContent.data[0].name, INVOICE_ID);

  const args = { name: INVOICE_ID };
  const invoice = result(
    await execute(
      client,
      'return await erp.call("' + GET + '", ' +
        JSON.stringify(args) + ")",
    ),
  );
  assertInvoiceView(invoice, INVOICE_VIEW, GET, args);
  assert.equal(invoice._meta[VIEW_META].resourceUri, INVOICE_VIEW);
  assert.equal(invoice.structuredContent.data.name, INVOICE_ID);

  for (const uri of [EXECUTE_VIEW, LIST_VIEW, INVOICE_VIEW]) {
    const { contents } = result(await client("resources/read", { uri }));
    assert.equal(contents[0].uri, uri);
    assert.equal(contents[0].mimeType, APP_MIME);
    assert.match(contents[0].text, /<html\b/i);
    if (uri === EXECUTE_VIEW) {
      for (const legacyUri of LEGACY_EXECUTE_VIEWS) {
        const { contents: legacy } = result(
          await client("resources/read", { uri: legacyUri }),
        );
        assert.equal(legacy[0].uri, legacyUri);
        assert.equal(legacy[0].mimeType, APP_MIME);
        assert.equal(legacy[0].text, contents[0].text);
      }
      // The dark overrides survive pruning even when the default palette disappears.
      const css = contents[0].text.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)
        ?.[1];
      const lightTheme = css?.match(/:root,\s*:host\s*\{([^{}]*)\}/)?.[1];
      assert.ok(lightTheme, "Code Mode must bundle the default viewer theme");
      for (const color of ["chart-1", "chart-2", "chart-3", "brand"]) {
        assert.match(lightTheme, new RegExp(`--color-${color}:\\s*[^;}\\s]+`));
      }
      assert.match(
        css,
        /\.bg-chart-4\s*\{/,
        "include mounted KPI viewer utilities",
      );
    }
  }

  const refresh = invoice._meta[ERP_VIEWER_META].refreshRequest;
  const refreshed = result(
    await call(client, refresh.toolName, refresh.arguments),
  );
  assertInvoiceView(refreshed, INVOICE_VIEW, GET, args);
  assert.deepEqual(refreshed.structuredContent, invoice.structuredContent);
}

async function checkSnippets(client, fixture, otherIdentity) {
  const code = '  // Vérification\r\nconst invoice = await erp.call("' +
    GET + '", { name: erp.params.invoice });\r\n' +
    "return invoice.data.outstanding_amount + erp.params.adjustment;\n";
  const initialParams = { invoice: INVOICE_ID, adjustment: 0 };
  const invoke = (args) => call(client, "execute", args);
  const initial = result(await invoke({ code, params: initialParams }));
  assert.equal(initial.structuredContent?.value, 84);
  const runId = initial._meta?.[EXECUTION_REFERENCE_META];
  assert.ok(typeof runId === "string" && runId.length > 0);
  const before = fixture.requests.length;
  const name = "invoice-balance";
  const description = "Look up the outstanding invoice balance.";
  const parameters = { invoice: "string", adjustment: "number" };
  const summary = { id: name, name, description, parameters };
  const save = { runId, name, description };
  if (otherIdentity) {
    failed(await call(otherIdentity, "execute", { save }));
  }
  const saved = result(await invoke({ save }));
  assert.equal(saved._meta?.[SNIPPET_EVENT_META], "saved");
  assert.deepEqual(saved.structuredContent?.value, summary);

  const listed = result(await invoke({ snippets: true }));
  assert.equal(listed._meta?.[SNIPPET_EVENT_META], "list");
  assert.deepEqual(listed.structuredContent?.value, [summary]);
  assert.deepEqual(JSON.parse(listed.content[0].text), [summary]);

  const inspected = result(await invoke({ inspectSnippet: name }));
  assert.equal(inspected._meta?.[SNIPPET_EVENT_META], "source");
  assert.equal(inspected._meta?.[VIEW_META], undefined);
  assert.deepEqual(inspected.structuredContent?.value, {
    name,
    description,
    parameters,
    code,
  });
  if (otherIdentity) {
    const list = result(
      await call(otherIdentity, "execute", { snippets: true }),
    );
    assert.deepEqual(list.structuredContent?.value, []);
    failed(await call(otherIdentity, "execute", { inspectSnippet: name }));
    failed(
      await call(otherIdentity, "execute", {
        snippet: name,
        params: initialParams,
      }),
    );
  }
  assert.equal(fixture.requests.length, before);

  const recalled = result(
    await invoke({
      snippet: name,
      params: { ...initialParams, adjustment: 2 },
    }),
  );
  assert.equal(recalled.structuredContent?.value, 86);
  assert.deepEqual(fixture.requests.slice(before), [
    "GET /api/resource/Sales%20Invoice/" + INVOICE_ID,
  ]);
}

function updateArgs(status) {
  return { doctype: "Task", name: TASK_ID, data: { status } };
}

function updateProgram(first, second) {
  const expression = (status) =>
    'await erp.call("' + UPDATE + '", ' +
    JSON.stringify(updateArgs(status)) + ")";
  return (second ? expression(first) + ";\n" : "") + "return " +
    expression(second ?? first);
}

function approval(reply, action = "accept") {
  const request = result(reply);
  assert.equal(request.resultType, "input_required", JSON.stringify(request));
  assert.equal(typeof request.requestState, "string");
  const entries = Object.entries(request.inputRequests);
  assert.equal(entries.length, 1);
  const [[key, input]] = entries;
  assert.equal(input.method, "elicitation/create");
  assert.match(input.params.message, new RegExp(TASK_ID));
  return {
    requestState: request.requestState,
    inputResponses: {
      [key]: {
        action,
        ...(action === "accept" && { content: { confirm: true } }),
      },
    },
  };
}

async function checkMrtr(client, fixture, otherIdentity) {
  const start = fixture.updates.length;
  const cancelledProgram = updateProgram("Open");
  const declined = approval(await execute(client, cancelledProgram), "decline");
  const cancelled = await execute(client, cancelledProgram, declined);
  assert.notEqual(
    cancelled.result?.resultType,
    "input_required",
    JSON.stringify(cancelled),
  );
  assert.deepEqual(fixture.updates.slice(start), []);

  const program = updateProgram("Working", "Completed");
  const first = approval(await execute(client, program));
  if (otherIdentity) {
    const wrongPrincipal = await execute(otherIdentity, program, first);
    assert.equal(
      wrongPrincipal.error?.data?.reason,
      "wrong_principal",
      JSON.stringify(wrongPrincipal),
    );
  }
  const wrongArgs = await execute(client, updateProgram("Working"), first);
  assert.equal(
    wrongArgs.error?.data?.reason,
    "wrong_params",
    JSON.stringify(wrongArgs),
  );
  assert.deepEqual(fixture.updates.slice(start), []);

  const second = approval(await execute(client, program, first));
  assert.deepEqual(fixture.updates.slice(start), ["Working"]);
  const replay = await execute(client, program, first);
  assert.equal(replay.error?.data?.reason, "replayed", JSON.stringify(replay));
  const completed = result(await execute(client, program, second));
  assert.equal(completed.isError, undefined, JSON.stringify(completed));
  assert.equal(completed.structuredContent.data.status, "Completed");
  assert.deepEqual(fixture.updates.slice(start), ["Working", "Completed"]);

  const runId = completed._meta?.[EXECUTION_REFERENCE_META];
  assert.ok(typeof runId === "string" && runId.length > 0);
  const name = "complete-task";
  const saved = result(
    await call(client, "execute", { save: { runId, name } }),
  );
  assert.equal(saved._meta?.[SNIPPET_EVENT_META], "saved");
  const recalled = { snippet: name };
  const decline = approval(await call(client, "execute", recalled), "decline");
  assert.deepEqual(fixture.updates.slice(start), ["Working", "Completed"]);
  failed(await call(client, "execute", recalled, decline));
  assert.deepEqual(fixture.updates.slice(start), ["Working", "Completed"]);
}

async function checkAppWrite(client, fixture, otherIdentity) {
  const start = fixture.updates.length;
  const propose = async (status) => {
    const args = updateArgs(status);
    const pending = result(await call(client, UPDATE, args));
    const meta = pending._meta?.[CONFIRM_META];
    assert.ok(meta, JSON.stringify(pending));
    assert.equal(typeof meta.ticket, "string");
    assert.equal(meta.operation, UPDATE);
    assert.deepEqual(meta.arguments, args);
    return meta.ticket;
  };
  const confirm = (ticket, decision, caller = client) =>
    call(caller, CONFIRM, { ticket, decision });

  const toCancel = await propose("Open");
  assert.ok((await confirm(toCancel, "cancel")).result);
  failed(await confirm(toCancel, "approve"));
  const toApprove = await propose("Working");
  if (otherIdentity) failed(await confirm(toApprove, "approve", otherIdentity));
  assert.deepEqual(fixture.updates.slice(start), []);

  const approved = result(await confirm(toApprove, "approve"));
  assert.equal(approved.isError, undefined, JSON.stringify(approved));
  assert.equal(approved.structuredContent.data.status, "Working");
  failed(await confirm(toApprove, "approve"));
  assert.deepEqual(fixture.updates.slice(start), ["Working"]);
}

async function checkUpload(client, fixture) {
  const name = "smoke-attachment.bin";
  const file = Buffer.alloc(24 * 1024, 0x2a);
  const sha256 = createHash("sha256").update(file).digest("hex");
  const content = file.toString("base64");
  const args = {
    code: 'return erp.callWithInput("' + UPLOAD + '")',
    input: {
      file_name: name,
      content_base64: content,
      attached_to_doctype: "Task",
      attached_to_name: TASK_ID,
    },
  };
  const pending = await call(client, "execute", args);
  const retry = approval(pending);
  const shown = JSON.stringify(result(pending).inputRequests);
  assert.ok(shown.includes(sha256));
  assert.ok(!shown.includes(content));
  assert.deepEqual(fixture.uploads, []);

  const completed = result(await call(client, "execute", args, retry));
  assert.equal(completed.isError, undefined, JSON.stringify(completed));
  assert.equal(completed.structuredContent.data.file_name, name);
  failed(await call(client, "execute", args, retry));
  assert.deepEqual(fixture.uploads, [{ name, bytes: file.length, sha256 }]);
}

test("installed Code Mode beta over stdio and Streamable HTTP", {
  timeout: 60_000,
}, async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "mcp-erpnext-code-mode-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const { bin, version } = installPackage(cwd);
  assert.match(version, /-beta\.\d+$/);
  assert.equal(
    resolveDistTag({ version, requestedTag: "auto" }).npmDistTag,
    "next",
  );
  assert.throws(() => resolveDistTag({ version, requestedTag: "latest" }), {
    code: "DIST_TAG_MISMATCH",
  });

  const frappe = await startFrappe(t);
  const env = {
    ERPNEXT_URL: frappe.url,
    ERPNEXT_API_KEY: "smoke-key",
    ERPNEXT_API_SECRET: "smoke-secret",
    ERPNEXT_METHOD_ALLOWLIST: "smoke.api.read_marker",
    MCP_CACHE_ENABLED: "false",
  };
  const elicitation = { elicitation: { form: {} } };
  await t.test("stdio", async (t) => {
    const exchange = startStdio(t, bin, cwd, {
      ...env,
      MCP_SNIPPETS_DIR: join(cwd, "snippets-stdio"),
    });
    const plain = makeClient(exchange);
    await checkModel(plain, frappe);
    const app = makeClient(exchange, APP_CAPABILITIES);
    await checkApp(app);
    await checkSnippets(app, frappe);
    const mrtr = makeClient(exchange, elicitation);
    await checkMrtr(mrtr, frappe);
    await checkUpload(mrtr, frappe);
    await checkAppWrite(app, frappe);
  });
  await t.test("authenticated Streamable HTTP", async (t) => {
    const url = await startHttp(t, bin, cwd, {
      ...env,
      MCP_SNIPPETS_DIR: join(cwd, "snippets-http"),
      MCP_OAUTH_JWKS_URL: frappe.url + "/jwks",
      MCP_OAUTH_ISSUER: ISSUER,
      MCP_OAUTH_AUDIENCE: AUDIENCE,
      MCP_AUTH_RESOURCE: AUDIENCE,
    });
    const alice = httpExchange(url, frappe.bearerFor("alice"));
    const bob = httpExchange(url, frappe.bearerFor("bob"));
    const plain = makeClient(alice);
    assert.equal(
      result(await plain("server/discover")).serverInfo.version,
      version,
    );
    const unauthenticated = await execute(
      makeClient(httpExchange(url), elicitation),
      updateProgram("Open"),
    );
    assert.equal(unauthenticated.status, 401);
    await checkModel(plain, frappe);
    const app = makeClient(alice, APP_CAPABILITIES);
    await checkApp(app);
    const otherApp = makeClient(bob, APP_CAPABILITIES);
    await checkSnippets(app, frappe, otherApp);
    await checkMrtr(
      makeClient(alice, elicitation),
      frappe,
      makeClient(bob, elicitation),
    );
    await checkAppWrite(app, frappe, otherApp);
  });
  assert.deepEqual(frappe.unexpected, []);
});
