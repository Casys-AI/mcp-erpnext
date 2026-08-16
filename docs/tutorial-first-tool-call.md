# Tutorial: Your first tool call

In this tutorial we will connect mcp-erpnext to Claude Desktop and confirm that
it can talk to your ERPNext instance — from zero to a working tool response in
four steps.

## Prerequisites

Before step 1, make sure you have all three of these:

1. **An ERPNext instance.** The lowest-friction option is a
   [Frappe Cloud](https://frappe.cloud) trial — no server setup required, and it
   removes the self-hosting prerequisite entirely. A self-hosted instance works
   the same way.

2. **Claude Desktop** installed and running on your machine. Download it from
   [claude.ai/download](https://claude.ai/download).

3. **Node.js 20 or later**, so that `npx` is available on your PATH. Check with
   `node --version`. If it prints something below `v20`, update before
   continuing.

---

## Step 1 — Generate API credentials in ERPNext

1. Log in to your ERPNext instance.
2. Click your name in the top-right corner and choose **My Settings**.
3. Scroll down to the **API Access** section and click **Generate Keys**.
4. ERPNext displays an **API Key** and an **API Secret**. Copy both values and
   keep them handy — you will need them in the next step.

> The secret is shown only once. If you navigate away before copying it, click
> **Generate Keys** again to issue a new pair.

---

## Step 2 — Add the server to Claude Desktop

Open the Claude Desktop configuration file in a text editor:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

If the file does not exist yet, create it. Paste the block below, replacing the
three placeholder values with your own:

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "npx",
      "args": ["-y", "@casys/mcp-erpnext"],
      "env": {
        "ERPNEXT_URL": "https://yoursite.frappe.cloud",
        "ERPNEXT_API_KEY": "your-api-key",
        "ERPNEXT_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

Save the file.

---

## Step 3 — Restart Claude Desktop

Quit Claude Desktop completely and reopen it.

After it starts, open a new conversation. Click the tools icon (the plug or
hammer icon near the chat input). You will see **erpnext** listed as a connected
server. That confirms the server started and Claude Desktop can reach it.

---

## Step 4 — Make your first tool call

In the chat, type exactly:

```
List my sales orders
```

Claude Desktop will call the `erpnext_sales_order_list` tool and return the
result. On a brand-new ERPNext instance the list will be empty — **an empty list
is a successful result.** It confirms the tool call completed, the server
authenticated with ERPNext, and the response came back correctly.

---

## What next?

- **See what else you can ask:** the
  [tools overview in the README](../README.md) lists the categories and gives
  you a sense of what is available.
- **Understand how it works:** read [docs/concepts.md](./concepts.md) for the
  mental model behind the server — link resolution, caching, UI viewers, and
  when to reach for the generic tools.
