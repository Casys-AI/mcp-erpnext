# Migrate from 3.0 to 3.1 (and 3.2)

The package in this checkout reports **`3.2.0`**, the stable release. The 3.1
changes described here were developed as 3.1 prereleases and reach the stable
channel in 3.2.0; stable 3.1.0 carried only a subset (KPI and funnel context
selection and creation-error guidance). This guide therefore applies when you
move from 3.0 to 3.2, and also when you move from stable 3.1.0 to 3.2. See the
[CHANGELOG](../CHANGELOG.md) for the details of each change. This guide
describes the current source.

3.1 retains the 3.0 tool names and adds generic document presentation,
attachments, navigation within a viewer, and bounded active context. Existing
ERPNext credentials remain valid. This is not a migration of the ERP database.

## Choose the deployment

Replace the package argument in your existing MCP host configuration with
`@casys/mcp-erpnext@latest` (npm/Node), or `jsr:@casys/mcp-erpnext@3.2.0/server`
(Deno). JSR has no npm-style dist-tags, so the Deno command pins the exact
version. Restart the server process after changing the configuration. An exact
version such as `@casys/mcp-erpnext@3.2.0` pins the npm package instead of
following the `latest` channel.

To try the source changes in this checkout, keep your existing environment
configuration and build the viewers before starting the server:

```bash
cd src/ui
npm ci
node build-all.mjs
cd ../..
deno run -A server.ts
```

Development requires Deno 2.x. The npm bundle requires Node 20 or newer.
`deno task release:check` performs the local release preflight without
publishing.

For JSR under restricted Deno permissions, grant network access to both your ERP
host and `jsr.io`. Viewers are fetched from their published JSR URL on first
resource read, with a 15-second timeout; successful remote reads are cached for
the process. If the JSR host permission is denied or would require a prompt, the
server omits those viewer resources and logs `VIEWER_REMOTE_PERMISSION_DENIED`
with recovery guidance. Resource-read errors carry a JSON message with `code`,
`message`, `retryable`, `context`, and `recovery`.

For a compiled binary, run `deno task ui:build` before `deno task compile` so
the HTML resources can be embedded. The repository Dockerfile builds them in its
UI stage. A deployment missing the built HTML can still expose tools while its
viewer resources are unavailable; check startup resource registration.

## Check your MCP host

Document reads now bind to `doc-viewer`, except Sales Order, Sales Invoice, and
Quotation, which retain `invoice-viewer`. Record results retain their document
data and carry additional presentation and navigation metadata. Hosts without
MCP Apps can continue to consume the normal tool result.

Interactive features depend on the host and on the exact server tools selected
for that deployment:

| Feature                                                   | Required capability or contract                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Open related lists, records, and charts inside the viewer | Host `serverTools`; the target tool must be in the result's `_availableTools`                                                   |
| Save an attachment                                        | Host `serverTools` and `downloadFile`; client announces `io.modelcontextprotocol/ui` with MIME type `text/html;profile=mcp-app` |
| Replace active context                                    | Host `updateModelContext`; attachment resources additionally require the resource modality                                      |
| Ask the conversation to continue                          | Host `message.text`; the viewer labels this as a conversational action                                                          |
| Submit or Cancel from a document                          | Host `serverTools`; an available mutation tool, a read-only refresh request, and an eligible document state                     |

The download tool's `visibility: ["app"]` hides it from model tool lists. The
new capability guard refuses `erpnext_file_download` before an ERPNext request
when the MCP Apps declaration or MIME type is missing, returning
`APP_CONTEXT_REQUIRED`. Calling it through `ErpNextToolsClient.execute()` is
also refused because that library entry point has no MCP client capabilities.

This guard identifies a capable host, not the origin of an individual call. MCP
does not distinguish a model from an App in `tools/call`. A host that announces
MCP Apps must keep hidden App tools and their binary resource results out of
model calls. See the
[attachment contract](tools.md#generic-operations--doc-viewer--doclist-viewer).

Downloads re-read the File record, verify the exact parent and privacy, accept
only a local Frappe file path, authenticate the request, and follow no
redirects. Uploads remain private by default. Both operations default to a 10
MiB limit, configured separately by `ERPNEXT_MAX_UPLOAD_BYTES` and
`ERPNEXT_MAX_DOWNLOAD_BYTES`.

## Keep list calls compatible

`erpnext_doc_list` still accepts a DocType, field selection, Frappe filters, and
ordering. It also accepts `offset` and `skip_cache: true` for fresh reads. The
default limit is 20; non-negative integer limits and offsets have no additional
server ceiling.

```json
{
  "doctype": "Sales Invoice",
  "fields": ["name", "customer", "posting_date", "grand_total"],
  "filters": [["Sales Invoice Item", "item_code", "=", "SKU-1"]],
  "limit": 50,
  "offset": 0,
  "skip_cache": true
}
```

Use positive limits for viewer calls and repeated refreshes. `limit: 0`
preserves Frappe's request for every matching row, which may produce a very
large result. Combining it with `offset > 0` is rejected with
`INVALID_PAGINATION` to avoid different results across supported Frappe
versions. Continue pagination with a positive limit and the next offset.

Filters use either `[fieldname, operator, value]` or
`[child doctype, fieldname, operator, value]`. Values may be strings, numbers,
booleans, or `null`; `in` and `not in` accept arrays of strings or numbers.
Legacy longer tuples are forwarded compatibly for Frappe to interpret. The
schema uses portable arrays rather than tuple-only JSON Schema features; the
handler validates the positions and rejects malformed filters with
`INVALID_FILTER`.

A child-table join now qualifies bare parent ordering, avoiding an ambiguous
`modified` column on Frappe v14/v15. When selecting and ordering only parent
fields, grouping returns each matching parent once. Queries explicitly selecting
child fields or expressions keep their joined-row behaviour.
`erpnext_stock_entry_list` uses the same plan for its `item_code` filter. See
[the full list contract](tools.md#erpnext_doc_list).

Programmatic callers can catch `ToolInputError` or parse its rendered message
with `parseToolInputError`, exported from `mod.ts`. MCP error text has the shape
`[erpnext_doc_list] CODE: message. Recovery: ...`; schema violations may be
rejected by the host before the handler runs.

## Check dedicated list fields on ERPNext 16

The source changes correct three standard-list queries that requested columns
not present on ERPNext 16:

| List          | Result contract                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payment Entry | `currency` remains an alias of `paid_from_account_currency`, matching `paid_amount`. `received_amount` and `paid_to_account_currency` expose the other side. For a payment of type `Pay`, the party amount is the destination amount, `received_amount`.                                   |
| Asset         | `gross_purchase_amount` remains an alias for the standard Net Purchase Amount field (`gross_purchase_amount` on v15, `net_purchase_amount` on v16). `current_value` aliases `value_after_depreciation`. The canonical field names are also returned. This is book value, not market value. |
| Shipment      | The nonexistent `delivery_date` field is no longer requested or returned. Date filters use `pickup_date`; `Completed` is a native Shipment status. Update consumers that assumed a delivery date was available.                                                                            |

These changes preserve the documented legacy aliases where a corresponding
standard field exists. They do not establish compatibility with every custom
DocType extension or installed ERPNext/HRMS app.

`erpnext_asset_create` keeps its `gross_purchase_amount` input for the Net
Purchase Amount before depreciation. It supplies both versioned field names;
Frappe persists the field declared by the installed Asset DocType. Pass a fixed
asset `item_code` and `location` as required by ERPNext. The server does not
create those prerequisites automatically.

## Select tools at startup

The source changes add exclusion filters while retaining category selection:

```bash
deno run -A server.ts --categories=sales,inventory,operations --exclude-tools=erpnext_file_upload,erpnext_doc_delete
```

Environment equivalents are `ERPNEXT_CATEGORIES`, `ERPNEXT_EXCLUDE_CATEGORIES`,
and `ERPNEXT_EXCLUDE_TOOLS`. CLI values override the corresponding variable
individually. Exclusions apply after category selection, remove tools from calls
and viewer actions, and prevent cache warm-up from invoking them. Restart the
process to change its selection.

Use `--flag=value` syntax. Unknown excluded names, empty flag values, malformed
exclusion flags, and a final empty server selection fail startup with
`INVALID_TOOL_FILTER`. Unknown included category names are ignored with a
warning if valid categories remain. A bare or space-separated `--categories`
keeps its historical behaviour: it is ignored with a warning. Duplicate category
flags use the first value with a warning; duplicate exclusion flags are errors.
See
[selection rules and category names](environment-variables.md#tool-selection).

Library users can pass `categories`, `excludeCategories`, and `excludeTools` to
`ErpNextToolsClient`, inspect `client.selection`, and catch `ToolFilterError`.
`assertNonEmptySelection()` is available when the caller requires at least one
tool, as the server does.

## Verify lifecycle actions and refresh

Submit appears for an eligible draft; Cancel appears for an eligible submitted
document. `docstatus: 0` alone is insufficient: master data and ordinary records
such as Customer, Item, Project, and Task are not submittable. The server
maintains an explicit allowlist from ERPNext/HRMS DocType definitions:

| Domain              | Allowed DocTypes                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales               | Quotation, Sales Order, Delivery Note, Sales Invoice, POS Invoice, Installation Note                                                              |
| Purchasing          | Request for Quotation, Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice                                                     |
| Accounting          | Journal Entry, Payment Entry, Payment Request, Period Closing Voucher                                                                             |
| Stock               | Material Request, Stock Entry, Stock Reconciliation, Pick List, Delivery Trip, Landed Cost Voucher, Quality Inspection, Shipment                  |
| Manufacturing       | BOM, Work Order, Job Card, Blanket Order                                                                                                          |
| Projects and assets | Timesheet, Asset, Asset Movement                                                                                                                  |
| HRMS                | Attendance, Leave Application, Leave Allocation, Leave Encashment, Expense Claim, Employee Advance, Payroll Entry, Salary Slip, Additional Salary |

This is the viewer allowlist in
[`src/tools/ui-refresh.ts`](../src/tools/ui-refresh.ts), not a dynamic probe of
custom DocTypes. A custom submittable DocType can still use the generic tools
explicitly; its viewer does not automatically acquire lifecycle actions. ERPNext
remains responsible for permissions, validation, dependencies, and configured
Workflow rules. A button is not proof that the operation will pass those server
checks.

An open confirmation closes when a newly read document changes identity,
`modified`, effective amount, or currency, even if it remains submittable.
Changing the host locale keeps the confirmation open and retranslates it. This
only compares received snapshots; it cannot detect an ERP change the viewer has
not read yet.

Submit first reads fresh state to obtain Frappe's `modified` timestamp.
Successful mutations invalidate the read cache and refresh through a read-only
tool. Confirmation identifies both the DocType and document. Feedback
distinguishes a confirmed operation from a committed change whose re-read is
still pending; retry the read before considering another write.

A confirmed change marks related snapshots stale within the current viewer's
navigation stack. It does not automatically synchronize separate viewers,
conversations, or external ERPNext edits. Return to a stale level or refresh it
to obtain canonical state.

## Verify analytics and context

Click or Space toggles available context selection; double-click or Enter opens
detail while preserving selections. Scalar KPIs without a displayed trend do not
add redundant context and open a local target on a single click when available.
Pie, donut, and treemap charts do the same when context selection is
unavailable. Conversation-only targets retain their explicit detail gesture.

KPI main values, deltas, and secondary invoice counts or amounts follow the host
locale. Older results retain their supplied caption. Context contains the
selected values and their units, with up to eight compact selections. Delta
badges use the server's percentage directly: `2.8` means `2.8%`, rather than a
ratio to multiply by 100.

Revenue uses Sales Order `currency`; outstanding and overdue amounts use Sales
Invoice `party_account_currency`, which can differ from the invoice currency.
These three KPIs require one known currency across their matching records. A
`MIXED_CURRENCIES` error asks for a `currency` filter rather than adding unlike
amounts; missing currency or invalid source amounts fail explicitly. Empty
results carry no guessed currency unless the call selected one. No currency
conversion is performed.

`erpnext_kpi_revenue`, `erpnext_kpi_outstanding`, `erpnext_kpi_overdue`, and
`erpnext_kpi_orders` accept optional `company` and `currency` filters. They read
all matching records fresh. Monthly revenue and order counts stop at today and
use local calendar dates. Their document-list jumps preserve the same scope;
invoice lists expose the party account currency beside the outstanding amount.

Other monetary charts retain legacy currency assumptions and record limits. They
have not received these aggregation corrections. The three financial KPIs
therefore omit links to those charts; their own monthly sparkline remains
available for context selection. Revenue labels retain their aligned calendar
months.

## Keep Buy evidence separate from live ERP operations

`erpnext_buy_capture` remains read-only and limited to its closed commercial
DocTypes. Two cache-bypassing reads must agree before returning canonical JSON,
its digest, and byte count. The Buy Evidence viewer accepts only a validated
recorded session; it has no live refresh or mutation controls.

Its App version is `3.1.0`, independent of the package version (3.2.0 keeps it).
Hosts that pin an App manifest identity must update that binding when adopting
these changes. Recorded-result `/1.0` and `/2.0` remain accepted; `/2.0` retains
bounded unpriced-line metadata without assigning a monetary value. Showing
sealed evidence does not purchase goods or qualify a live ERP instance.

## Check the host journey before replacing a deployment

With your actual host, open a document list, inspect one record, follow one
related target, and refresh it. Check context selection where the host supports
it and download a test attachment through its preview/download controls. Use a
disposable ERP draft to verify lifecycle actions: a visible confirmation, a
confirmed operation, and the canonical refreshed state are distinct steps. Keep
the previous package pin available until these checks pass for your deployment.
