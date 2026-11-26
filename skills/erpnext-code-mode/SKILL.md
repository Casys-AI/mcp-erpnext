---
name: erpnext-code-mode
description: Use ERPNext Code Mode to read and update records, find available operations, open sales invoices, and calculate answers from ERP data.
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

When reporting totals, prefer the corresponding ERP aggregate. A page of rows
may be only part of the result. Check currencies before adding amounts and use
the currency returned by the operation.

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
