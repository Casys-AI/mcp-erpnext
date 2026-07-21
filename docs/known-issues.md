# ERPNext MCP — Known Issues & TODO

## Fixed bugs

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

**Applied fix**: `withRoundedTotalFallback()` sets `disable_rounded_total: 1`
on the pre-submit doc whenever `base_rounded_total` or `rounded_total` is
`null` and it isn't already set:

- `src/tools/submit-helpers.ts` — `withRoundedTotalFallback()`
- `src/tools/operations.ts` — `erpnext_doc_submit`
- `src/tools/sales.ts` — `erpnext_sales_order_submit`,
  `erpnext_sales_invoice_submit`

---

## Open bugs

### ~~RuntimeError: `Deno is not defined` on Node.js~~ — fixed in 2.4.0

**Status**: ✅ **Fixed in 2.4.0** (`@casys/mcp-server` ≥ 0.21.1). The npm bundle
now consumes `@casys/mcp-server`'s own Node-clean npm build, and both packages
select their runtime adapter at load time (`runtime.ts` selector) instead of a
build-time file swap. `build-node.sh` fails fast if the resolved
`@casys/mcp-server` predates 0.21.1. Reported by
[@dennypradipta](https://github.com/dennypradipta) in
[#4](https://github.com/Casys-AI/mcp-erpnext/pull/4).

**Symptom** (≤ 2.3.1): Running the npm bundle (`npx @casys/mcp-erpnext
--http`)
crashes with `ReferenceError: Deno is not defined` at `loadYamlAuth`.

**Cause**: The transitive dependency `@casys/mcp-server` (≤ 0.21.0 as bundled
from JSR source) contained `Deno.readTextFile` calls that esbuild inlined into
the bundle. The project's own runtime adapter handled the swap correctly, but
`@casys/mcp-server`'s internal auth-config loader bypassed it.

**Workaround on old versions**: upgrade to ≥ 2.4.0, or run with the Deno runtime
instead:

```bash
deno run -A npm:@casys/mcp-erpnext --http --port=3012
```

---

## Desired improvements

### Setup wizard automation

A fresh ERPNext instance requires master data before being able to create
transactional documents. The tools `erpnext_company_create` and
`erpnext_doc_create` now exist, but the full workflow is:

1. Create Company
2. Create Price Lists (Standard Selling, Standard Buying)
3. Create Warehouses (or use the ones auto-created by Company)
4. Create Item Groups if needed
5. Create UOMs if non-standard (Nos, Kg, etc. exist by default)

**Idea**: A tool `erpnext_setup_check` that checks that the prerequisites exist
and returns what is missing.

### Retry / error context enrichment

When an operation fails (e.g.: MandatoryError), the handler could:

1. Parse the Frappe error
2. Return a structured message with the missing field
3. Suggest the fix (e.g.: "Add selling_price_list field")

### Rate limits / throttling

No rate limiting on the client side. An agent that loops can bombard the ERPNext
API. `FrappeClient` retries reads on 429/5xx, but does not yet perform global
throttling or per-session request budgeting.

### Integration tests

Current tests are all mocked. Integration tests running against a real ERPNext
(Docker) instance would be needed to validate end-to-end workflows. Suggested
Deno pattern:

```typescript
const runIntegration = Deno.env.get("ERPNEXT_INTEGRATION") === "1";
Deno.test({
  name: "integration: sales order create validates ERPNext defaults",
  ignore: !runIntegration,
  fn: async () => {
    /* requires ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET */
  },
});
```
