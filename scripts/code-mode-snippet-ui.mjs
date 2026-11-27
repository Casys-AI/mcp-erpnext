// After deno task ui:build, run CHROME_BIN=chromium node --test scripts/code-mode-snippet-ui.mjs.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

async function runInsideHost() {
  const frame = document.querySelector("iframe");
  const send = (message) =>
    frame.contentWindow.postMessage(
      { jsonrpc: "2.0", ...message },
      location.origin,
    );
  const deliver = (params) =>
    send({ method: "ui/notifications/tool-result", params });
  const find = (selector) => frame.contentDocument.querySelector(selector);
  async function waitFor(predicate) {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      "Widget did not reach the expected state: " + predicate + " — " +
        frame.contentDocument.body.innerText.slice(0, 400),
    );
  }
  const invoice = (name) => ({
    content: [],
    structuredContent: {
      data: {
        doctype: "Sales Invoice",
        name,
        customer: name,
        currency: "EUR",
        grand_total: 10,
        items: [],
      },
    },
    _meta: {
      "dev.mcpview/declared-view": {
        version: 1,
        resourceUri: "ui://mcp-erpnext/invoice-viewer",
      },
    },
  });
  const reference = { "io.casys/erpnext-execution-ref": "run-saveable" };
  const first = invoice("SINV-SOLO");
  const second = invoice("SINV-PAIRED");
  const snippet = {
    id: "monday",
    name: "Monday",
    description: "Open balances",
  };
  const snippetEvent = (kind, value) => ({
    content: [],
    structuredContent: { value },
    _meta: { "io.casys/erpnext-snippet-event": kind },
  });
  const checkBusinessView = () => {
    if (find(".erp-snippets")) {
      throw new Error("An ordinary execution displayed the snippet panel");
    }
  };
  const contextUpdates = [];
  const ready = new Promise((resolve) => {
    globalThis.addEventListener("message", ({ source, origin, data }) => {
      if (source !== frame.contentWindow || origin !== location.origin) return;
      const { id, method, params } = data;
      if (method === "ui/initialize") {
        send({
          id,
          result: {
            protocolVersion: params.protocolVersion,
            hostInfo: { name: "Smoke", version: "1" },
            hostCapabilities: {
              serverTools: {},
              updateModelContext: { structuredContent: {} },
            },
            hostContext: { locale: "en", theme: "light" },
          },
        });
      } else if (method === "ui/notifications/initialized") {
        resolve();
      } else if (
        method === "tools/call" && params.name === "erpnext_stage_board_layout"
      ) {
        const { runId, revision } = params.arguments;
        send({
          id,
          result: { content: [], structuredContent: { runId, revision } },
        });
      } else if (method === "ui/update-model-context") {
        contextUpdates.push(params);
        send({ id, result: {} });
      } else if (id !== undefined) {
        send({ id, result: {} });
      }
    });
  });
  frame.src = "/widget";
  await ready;
  deliver({ ...first, _meta: { ...first._meta, ...reference } });
  await waitFor(() =>
    frame.contentDocument.body.innerText.includes("SINV-SOLO")
  );
  checkBusinessView();
  deliver({
    content: [],
    _meta: {
      ...reference,
      "io.mcpview/snippet-panels": [first, second].map((result, i) => ({
        id: "p" + i,
        layoutId: "invoice:" + (i + 1),
        provider: "erp",
        name: "invoice",
        title: "Panel " + i,
        result,
      })),
    },
  });
  await waitFor(() =>
    frame.contentDocument.querySelectorAll(".code-mode-panel").length === 2 &&
    frame.contentDocument.body.innerText.includes("SINV-PAIRED")
  );
  checkBusinessView();
  const namedPanel = find('section[data-compose-panel][aria-label="Panel 0"]');
  if (
    !namedPanel ||
    !namedPanel.querySelector('button[aria-label="Move Panel 0"]')
  ) {
    throw new Error("The viewer and its move handle need accessible names");
  }
  if (namedPanel.innerText.includes("Panel 0")) {
    throw new Error(
      "The Compose panel repeated its accessible label in the viewer",
    );
  }
  const invoiceTarget = find(
    ".code-mode-panel [data-visual-item][aria-pressed=false]",
  );
  if (!invoiceTarget) throw new Error("Invoice cannot be joined");
  invoiceTarget.dispatchEvent(
    new frame.contentWindow.KeyboardEvent("keydown", {
      key: " ",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  await waitFor(() =>
    JSON.stringify(contextUpdates.at(-1) ?? {}).includes("SINV-SOLO")
  );
  await waitFor(() => find("[data-compose-movement-ready]"));
  const grips = frame.contentDocument.querySelectorAll(
    "button[data-compose-grip]",
  );
  grips[0].click();
  grips[1].click();
  await waitFor(() =>
    contextUpdates.at(-1)?.structuredContent?.snippetLayout?.status === "ready"
  );
  if (!JSON.stringify(contextUpdates.at(-1) ?? {}).includes("SINV-SOLO")) {
    throw new Error("Moving a viewer removed the joined invoice");
  }
  deliver(snippetEvent("saved", snippet));
  await waitFor(() =>
    find(".erp-snippets-success")?.textContent.includes("Snippet saved")
  );
  if (find(".code-mode-panel") || find(".erp-snippets button")) {
    throw new Error("The save receipt must stand alone");
  }
  await waitFor(() => {
    const last = contextUpdates.at(-1)?.structuredContent;
    return last && !last.snippetLayout &&
      JSON.stringify(last).includes("SINV-SOLO");
  });
  deliver(snippetEvent("updated", snippet));
  await waitFor(() =>
    find(".erp-snippets-success")?.textContent.includes("Snippet updated")
  );
  if (find(".code-mode-panel") || find(".erp-snippets button")) {
    throw new Error("The update receipt must stand alone");
  }
  if (!JSON.stringify(contextUpdates.at(-1) ?? {}).includes("SINV-SOLO")) {
    throw new Error("The update receipt removed the joined invoice");
  }
  deliver(snippetEvent("list", [snippet]));
  await waitFor(() =>
    find(".mcp-view-snippet-library li")?.textContent.includes("Monday")
  );
}

test("saveable ERP views stay free of snippet controls, text commands show their own views", async (t) => {
  const widget = await readFile(
    new URL("../src/ui/dist/code-mode/index.html", import.meta.url),
  );
  const host =
    `<!doctype html><meta charset="utf-8"><iframe></iframe><output>pending</output><script>(${runInsideHost.toString()})().then(()=>document.querySelector("output").textContent="passed",e=>document.querySelector("output").textContent=e.message)</script>`;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(req.url === "/widget" ? widget : host);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const profile = await mkdtemp(join(tmpdir(), "erpnext-snippets-browser-"));
  t.after(() => rm(profile, { recursive: true, force: true, maxRetries: 3 }));
  const { stdout } = await promisify(execFile)(
    process.env.CHROME_BIN || "chromium",
    [
      "--headless",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--user-data-dir=" + profile,
      "--virtual-time-budget=10000",
      "--dump-dom",
      `http://127.0.0.1:${server.address().port}`,
    ],
    { timeout: 20000 },
  );
  assert.equal(stdout.match(/<output>([^<]*)<\/output>/)?.[1], "passed");
});
