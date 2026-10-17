# Local MCP Apps host

Run `deno task ui:dev-host`, then open
[the Company list](http://127.0.0.1:5177/?viewer=doclist). The server needs the
existing root `.env` with `ERPNEXT_URL`, `ERPNEXT_API_KEY`, and
`ERPNEXT_API_SECRET`. These remain in the backend process; `NPM_TOKEN` is not
forwarded. UI dependencies must already be installed (`cd src/ui && npm ci` if
needed).

The host starts its own MCP server from the local Deno source on
`127.0.0.1:3216`. The frontend listens on `127.0.0.1:5177`; neither service
replaces a desktop MCP connection. The backend uses a temporary token supplied
by the local proxy, which keeps credentials out of the browser. Stop the command
to stop both services.

The host uses the actual local MCP server source and the same built viewer HTML
served by its resources. Company, invoice, Task board, stock, funnel, revenue
KPI, and chart presets start with read-only calls. Viewer actions call the
actual ERPNext backend. The initial tool result and available-tool manifest are
preserved, and the viewer is chosen from the server's `ui.resourceUri`. There is
no demo mode or simulated capability profile; old `data` and `caps` URL
parameters are ignored.

The header reports the server version followed by **source locale**: this host
shows the current working tree, which can contain changes made after the tagged
or published package with the same version number. The technical protocol
journal is collapsed by default. Changing the selected viewer updates the URL,
so refresh and copied links reopen the same surface.

Server-source edits restart the local MCP process. Viewer/shared source edits
rebuild the HTML and reload the iframe after a successful build. **Recharger**
repeats the initial read and reloads the latest HTML with caching disabled.
Reloading resets the viewer's navigation and unsaved local state.

To inspect another read-only tool, pass `tool` and a JSON `args` object in the
URL. The host checks its `readOnlyHint` in the actual server catalogue before
calling it; an initial write is refused. For example:

```text
http://127.0.0.1:5177/?tool=erpnext_doc_get&args=%7B%22doctype%22%3A%22Company%22%2C%22name%22%3A%22Casys%20Industries%22%7D
```

The host supports server tools and browser downloads. It records context updates
in its journal, which shows what the viewer sends; this does not prove that a
model consumed that context. No model is connected, so conversational messaging
is not advertised and no model turn is created. Binary file contents and
uploaded base64 are omitted from the journal. Use the desktop host for final
checks of model context, conversational actions, and native integration.

For protocol inspection, connect MCP Inspector by Streamable HTTP to
`http://127.0.0.1:5177/__mcp`. The host uses the modern MCP protocol and MCP
Apps capability metadata on its own calls.
