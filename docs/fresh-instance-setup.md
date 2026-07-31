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
