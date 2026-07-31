# ERPNext quirks this server works around

Behaviours of Frappe/ERPNext that are surprising enough to have caused a bug
here, with the workaround the code now carries. Read this before removing
something that looks redundant — each of these exists because it was not.

The reader is a contributor. A user never hits these: the workarounds are
already in place.

### TimestampMismatchError on submit (2026-02-18)

**Symptom**: `frappe.client.submit` returns `TimestampMismatchError` when
passing `{doctype, name}` without the `modified` field.

**Cause**: Frappe uses optimistic locking based on `modified`. The `submit` API
expects the full doc with its `modified` timestamp to verify that it has not
been changed in the meantime.

**Applied fix**: All submit handlers now perform a `GET` of the doc before
passing it to `frappe.client.submit`:

```typescript
const doc = await ctx.client.get("Sales Order", input.name as string);
const result = await ctx.client.callMethod("frappe.client.submit", {
  doc: { ...doc, doctype: "Sales Order" },
});
```

**Fixed files**:

- `src/tools/operations.ts` — `erpnext_doc_submit`
- `src/tools/sales.ts` — `erpnext_sales_order_submit`,
  `erpnext_sales_invoice_submit`

**Note**: `frappe.client.cancel` does NOT have this problem — it accepts
`{doctype, name}`.

### Fix `uom` → `stock_uom` (inventory.ts)

The `uom` field in `erpnext_item_create` is called `stock_uom` in ERPNext.
Fixed.

### FrappeClient now parses `_server_messages`

**Historical symptom**: Frappe errors have 2 levels: `exc_type` (e.g.:
`MandatoryError`) and `_server_messages` (e.g.:
`["selling_price_list is required"]`). `FrappeClient.handleError()` only
extracted the first — cryptic messages on the agent side.

**Applied fix**: Dedicated parser `extractServerMessages()` that decodes
Frappe's double JSON encoding and concatenates the useful messages:

- `src/api/frappe-client.ts:80` — function `extractServerMessages()`
- `src/api/frappe-client.ts:181` — usage in the HTTP error path

### `erpnext_sales_order_create` accepts critical defaults

**Historical symptom**: Creating a Sales Order failed with
`MandatoryError: selling_price_list` on a fresh instance, because the field was
neither in the schema nor passed through.

**Applied fix**:

- `src/tools/sales.ts:324` — `selling_price_list` added to the schema
- `src/tools/sales.ts:381` — passed to the creation payload

### `FrappeClient` retries transient read errors

**Historical symptom**: A temporary 429/5xx or a network error would immediately
fail reads, even when a short retry would have sufficed.

**Applied fix**: `FrappeClient` now retries `GET`s on configured transient
statuses (`408`, `429`, `502`, `503`, `504`) and on network errors, with
exponential backoff and `Retry-After` support.

### `kanban-viewer` guards saves without `serverTools`

**Historical symptom**: In the kanban card detail modal, `handleSaveDetail`
called `app.callServerTool` without checking
`app.getHostCapabilities()?.serverTools`, unlike the other viewer mutations.

**Applied fix**: `handleSaveDetail` now fails explicitly with the same guard as
card moves when the host does not support proxied server calls.

### Fresh instance: `base_rounded_total = None` → TypeError

**Historical symptom**: On a fresh ERPNext instance (without setup wizard),
submitting a Sales Order/Invoice failed with `TypeError: abs(None)` in
`validate_grand_total()`, because `base_rounded_total`/`rounded_total` stay
`None` when the rounding configuration is not initialized.

**Applied fix**: `withRoundedTotalFallback()` sets `disable_rounded_total: 1` on
the pre-submit doc whenever `base_rounded_total` or `rounded_total` is `null`
and it isn't already set:

- `src/tools/submit-helpers.ts` — `withRoundedTotalFallback()`
- `src/tools/operations.ts` — `erpnext_doc_submit`
- `src/tools/sales.ts` — `erpnext_sales_order_submit`,
  `erpnext_sales_invoice_submit`

---
