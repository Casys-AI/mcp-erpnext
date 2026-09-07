# How to seed master data on a blank ERPNext instance

If your ERPNext instance already has master data (customers, items, warehouses),
skip this guide.

Each step is one `erpnext_doc_create` call. Both `doctype` and `data` are
required, and every field of the record goes inside `data`:

```json
{ "doctype": "Warehouse Type", "data": { "name": "Transit" } }
```

Create Warehouse Types before Company. Every other step is independent.

---

## 1. Warehouse Types

```json
{ "doctype": "Warehouse Type", "data": { "name": "Transit" } }
{ "doctype": "Warehouse Type", "data": { "name": "Default" } }
```

## 2. UOMs (Units of Measure)

```json
{ "doctype": "UOM", "data": { "uom_name": "Nos" } }
{ "doctype": "UOM", "data": { "uom_name": "Kg" } }
{ "doctype": "UOM", "data": { "uom_name": "Unit" } }
{ "doctype": "UOM", "data": { "uom_name": "Set" } }
{ "doctype": "UOM", "data": { "uom_name": "Meter" } }
```

## 3. Item Groups

```json
{ "doctype": "Item Group", "data": { "item_group_name": "All Item Groups", "is_group": 1 } }
{ "doctype": "Item Group", "data": { "item_group_name": "Products", "parent_item_group": "All Item Groups" } }
{ "doctype": "Item Group", "data": { "item_group_name": "Raw Material", "parent_item_group": "All Item Groups" } }
```

Create `All Item Groups` before the two that reference it as their parent.

## 4. Territories

```json
{ "doctype": "Territory", "data": { "territory_name": "All Territories", "is_group": 1 } }
{ "doctype": "Territory", "data": { "territory_name": "France", "parent_territory": "All Territories" } }
```

Replace `France` with your country.

## 5. Customer Groups

```json
{ "doctype": "Customer Group", "data": { "customer_group_name": "All Customer Groups", "is_group": 1 } }
{ "doctype": "Customer Group", "data": { "customer_group_name": "Commercial", "parent_customer_group": "All Customer Groups" } }
```

## 6. Supplier Groups

```json
{ "doctype": "Supplier Group", "data": { "supplier_group_name": "All Supplier Groups", "is_group": 1 } }
{ "doctype": "Supplier Group", "data": { "supplier_group_name": "Hardware", "parent_supplier_group": "All Supplier Groups" } }
```

## 7. Company

Requires step 1.

```json
{
  "doctype": "Company",
  "data": {
    "company_name": "My Company",
    "abbr": "MC",
    "default_currency": "EUR",
    "country": "France"
  }
}
```

## Purchase invoices

The generic document tools use standard ERPNext APIs. No app, server script, or
custom field needs to be installed in ERPNext.

### Check the accounting prerequisites

ERPNext resolves and validates invoice accounts. The MCP does not create
accounts or change Company or Currency settings automatically.

- A payable account must resolve from the invoice's `credit_to`, a Supplier or
  Supplier Group account for the company, or `Company.default_payable_account`.
- With perpetual inventory enabled, `Company.stock_received_but_not_billed` must
  also be configured. Setting `update_stock: 0` on a service invoice does not
  remove that requirement.

Recognized missing-payable and missing-Stock-Received-But-Not-Billed errors
remain blocking ERPNext errors, with an added indication of which field to
check. A named account with a currency mismatch remains a different error.

### Understand the rounding notice

ERPNext can calculate `grand_total: 3.6` and then apply a final rounding step to
produce `rounded_total: 4`. The invoice viewer displays the effective invoice
total and a compact notice showing the applied adjustment. Expand it to see the
calculated amount, rounding adjustment, final amount, and the setting that
controls final rounding. Opening or closing the notice does not change data.

The effective amount follows ERPNext's supplier-entry selection: with final
rounding disabled it uses `grand_total`; with rounding enabled it uses
`rounded_total` when both that value and `rounding_adjustment` are nonzero,
otherwise `grand_total`. It is the invoice total before payments and advances,
not `outstanding_amount`. The viewer does not classify adjustments using an
arbitrary percentage threshold.

### Keep the calculated total on one draft

Enable the checkbox **Disable Rounded Total** on the draft invoice, then save
and review its updated total. The same setting can be changed with
`erpnext_doc_update`:

```json
{
  "doctype": "Purchase Invoice",
  "name": "ACC-PINV-2026-00001",
  "data": { "disable_rounded_total": 1 }
}
```

This disables only final total rounding, preserving ERPNext's precision rules
for line amounts, taxes, and currency conversion. The field can also be supplied
when creating a draft with `erpnext_doc_create`; it is not a required MCP input.
Do not overwrite calculated total fields to correct an invoice.

Read the updated draft and compare it with the supplier's invoice before
submitting through the existing `erpnext_doc_submit` arguments:

```json
{
  "doctype": "Purchase Invoice",
  "name": "ACC-PINV-2026-00001"
}
```

### Review the currency configuration

If unexpected rounding affects multiple invoices, read the relevant Currency
with `erpnext_doc_get` and review `smallest_currency_fraction_value`. In the
Frappe version tested, a zero or missing value falls back to whole-unit final
rounding when rounded totals are enabled. A value of `0.01` corresponds to a
one-cent step. With suitable permissions, the existing generic update tool can
change that configuration:

```json
{
  "doctype": "Currency",
  "name": "EUR",
  "data": { "smallest_currency_fraction_value": 0.01 }
}
```

This is a shared currency setting, so review the intended policy before changing
it. Changing it does not automatically recalculate existing drafts or rewrite
submitted invoices. Save and review an affected draft again before submission.
See ERPNext's
[invoice rounding guidance](https://docs.frappe.io/erpnext/invoice-rounding-issue).

The rounding notice is informative. ERPNext still validates and can recalculate
inside native submission; no atomic expected-amount condition or rollback is
provided by this viewer. After a transport timeout, read the same document
before deciding whether to retry.
