---
name: erpnext-code-mode
description: Use ERPNext Code Mode to query or update records, open interactive invoices, and save, find, inspect or rerun ERPNext programs across chats.
---

Use the ERPNext connection's `execute` tool. Its `code` argument is the body of
an asynchronous JavaScript function. Inside that function, `erp.catalog` lists
the currently available business operations, with their names, descriptions and
input schemas. Use it when choosing an operation or checking accepted arguments.
The catalogue reflects this server's enabled categories and exclusions.

For example, find the sales invoice operations and their parameters:

```js
return erp.catalog.filter((op) => op.name.includes("sales_invoice"));
```

Use `await erp.call(name, args)` to work with the connected ERP. To open the
business result for the user, return the original result. For a calculation,
return the computed value and its units. A programme may make several reads. Use
the document's exact ERPNext identifier for a detail request. If the server
reports an ambiguous name, ask the user to choose from the candidates.

List the first page of overdue sales invoices:

```js
return await erp.call("erpnext_sales_invoice_list", {
  status: "Overdue",
  limit: 20,
});
```

Open an invoice, substituting the identifier supplied by the user or a preceding
read:

```js
return await erp.call("erpnext_sales_invoice_get", { name: "SINV-00042" });
```

To show several existing business views in one response, select each original
result with `erp.panel(result, title)` in the requested display order. A
programme can use the output of an operation without displaying it. Return a
short summary after selecting the panels. For example, show a customer's overdue
list alongside the invoice whose exact name the user supplied in
`execute.params.invoice`:

```js
const rows = await erp.call("erpnext_sales_invoice_list", {
  status: "Overdue",
  customer: erp.params.customer,
  limit: 20,
});
const invoice = await erp.call("erpnext_sales_invoice_get", {
  name: erp.params.invoice,
});
erp.panel(rows, "Overdue invoices");
erp.panel(invoice, "Invoice details");
return { invoice: erp.params.invoice };
```

If the user wants the invoice detail to follow selections in the list, add this
line after both `erp.panel` calls and before the return:

```js
erp.sync({
  from: rows,
  event: "invoice.selected",
  to: invoice,
  action: "invoice.focus",
});
```

The source is a Sales Invoice list from `erpnext_sales_invoice_list` or
`erpnext_doc_list` with `doctype: "Sales Invoice"` and the `name` field. The
target is an original result from `erpnext_sales_invoice_get`. Use the exact
requested invoice as the initial detail, or the first row when the user asks to
start with the first invoice. Clicking a row opens that invoice in the linked
panel. The pin beside the row attaches it to the conversation. The header pin
acts on all loaded invoices matching the filter, including other local pages.
When answering questions about pinned records, use the host's current context
and respect any reported limit on the number of records it contains.
Show just the list if there is no invoice to open.

To let the user recalculate gross margin for a month in the Sales Order revenue
series, link the cards as shown below. Clicking a monthly bar updates the margin
for that month. The two-month control covers a longer period. The pin on the
active point adds that month to the conversation independently.
Start the margin at the current month to date and keep any requested
company or valuation options in the original margin call.

```js
const revenue = await erp.call("erpnext_kpi_revenue", {});
const margin = await erp.call("erpnext_kpi_gross_margin", {
  ...revenue.sparklinePeriods.at(-1),
});
erp.panel(revenue, "Sales Order revenue");
erp.panel(margin, "Estimated gross margin");
erp.sync({
  from: revenue,
  event: "kpi.period.selected",
  to: margin,
  action: "kpi.period.apply",
});
return { shown: 2 };
```

When reporting totals, prefer the corresponding ERP aggregate. A page of rows
may be only part of the result. Check currencies before adding amounts and use
the currency returned by the operation.

When a request includes a threshold, date, or other value the user may change,
pass it in `execute.params` and read it from `erp.params` in the program. For
example, to show overdue invoices with at least EUR 1000 outstanding, pass
`{"minimum":1000}` as `params` and return the filtered ERP list directly:

```js
return await erp.call("erpnext_doc_list", {
  doctype: "Sales Invoice",
  fields: ["name", "customer", "due_date", "outstanding_amount", "currency"],
  filters: [["status", "=", "Overdue"], ["currency", "=", "EUR"], [
    "outstanding_amount",
    ">=",
    erp.params.minimum,
  ]],
  order_by: "outstanding_amount desc",
  limit: 20,
});
```

For an interactive list, send the filters in the ERP operation. Filtering the
returned rows in JavaScript produces a new value without the list's actions.

When the user asks to keep a program, such as “save this for Monday”, use the
execution reference from that successful result. Call `execute` with
`{"save":{"runId":"<execution reference>","name":"monday-invoices","description":"Overdue EUR invoices by minimum outstanding balance"}}`.
The save command displays a receipt with the saved name. The ordinary ERP result displays the business view. Scheduling is a separate request. To run
it again at EUR 3000, call the same tool with
`{"snippet":"monday-invoices","params":{"minimum":3000}}`. In a new
conversation, when the user refers to a saved procedure, first call `execute`
with `{"snippets":true}` to find its actual name, description, and parameter
keys. If several match, ask which one to use. Call the selected snippet with the
new values. Save only on request.

When the user asks to browse their saved programs, call `execute` with
`{"snippets":true}`. The library supports searching by name or description. When
the user asks to see one script, use `{"inspectSnippet":"monday-invoices"}` with
its actual name. This returns its saved JavaScript in a read-only view. Run a
saved program only when the user asks to execute it.

For changes, use the document’s exact ERPNext ID and the operation from the
catalogue and the record and values the user requested. The server presents the
proposed change and its arguments for approval. Wait for the user to approve or
cancel. Report success only when ERPNext returns the completed result. If a
response is interrupted, check the record's state before starting a fresh
program that would repeat the change.

When a caller already has a large argument object such as an attachment, the
optional `input` field on `execute` can carry that object. The JavaScript
program calls `return await erp.callWithInput("erpnext_file_upload")`. ERPNext
receives the original input through the usual validation and approval flow. The
confirmation shows the filename, destination, byte length and SHA-256 digest.
