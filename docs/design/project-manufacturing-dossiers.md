# Project and Manufacturing document dossiers

Six presentation profiles enrich the existing `ui://mcp-erpnext/doc-viewer`:
Project, Task, Timesheet, BOM, Work Order and Job Card. `DocumentSurface`
selects an exact DocType profile. Other DocTypes keep their generic
presentation.

`OperationalFields` uses the shared typography, tokens and primitives. It shows
key quantities/time/progress, relationships, planned/actual dates and ERP costs.
Other source fields and system metadata remain in a disclosure. Child tables
retain their row objects, navigation callbacks, context selection and single-row
disclosure; operational columns are ordered, localized and wrap long values. The
host continues to own refresh, navigation, attachments and command gating.

## Evidence and absence

Only document fields are displayed. No linked document is fetched by the
presentation and no amount, duration, progress ratio or completion state is
calculated. Local child-table totals are suppressed for these six DocTypes.
Missing values read “Not provided”; supplied zero remains zero. The meter is
shown only for a supplied finite percentage between 0 and 100. Other values
remain text rather than being clamped into a valid progress state.

BOM and Timesheet transaction costs use the document's `currency`. Project, Task
and Work Order company-currency costs remain explicitly unspecified unless the
document provides `company_currency`; transaction currency never substitutes for
it. Quantity units likewise require the named source field. A Job Card uses its
own `stock_uom` when supplied; when absent, the view does not borrow a unit from
its Work Order. Child-row values remain raw; there is no unit conversion.

Field identities were checked against the official ERPNext version-16 schemas:
[Project](https://github.com/frappe/erpnext/blob/version-16/erpnext/projects/doctype/project/project.json),
[Task](https://github.com/frappe/erpnext/blob/version-16/erpnext/projects/doctype/task/task.json),
[Timesheet](https://github.com/frappe/erpnext/blob/version-16/erpnext/projects/doctype/timesheet/timesheet.json),
[BOM](https://github.com/frappe/erpnext/blob/version-16/erpnext/manufacturing/doctype/bom/bom.json),
[Work Order](https://github.com/frappe/erpnext/blob/version-16/erpnext/manufacturing/doctype/work_order/work_order.json),
[Job Card](https://github.com/frappe/erpnext/blob/version-16/erpnext/manufacturing/doctype/job_card/job_card.json).
Work Order operation minute semantics also follow the
[server's operating-cost calculation](https://github.com/frappe/erpnext/blob/version-16/erpnext/manufacturing/doctype/work_order/work_order.py)
(`time_in_mins` and `actual_operation_time` divided by 60 for hourly rates).

## Local preview

From `src/ui`, run
`npm run dev:doc -- --host 127.0.0.1 --port 5188 --strictPort`. Use the
displayed origin and these query parameters:

- `?fixture=project`, `task`, `timesheet`, `bom`, `work-order` or `job-card`.
- `&layout=panel` for a 380 px desktop panel; `&layout=mobile` for touch tabs;
  `&layout=wide` for a 1000 px viewer.
- `&theme=dark` or `light`, and `&locale=en`, `fr` or `zh`.

The fixture selector reloads the chosen synthetic document. Every fixture is
marked as demo, every cost is fictional, and its tool manifest is empty. Preview
mode does not connect to an ERP host. Existing `?fixture=1` remains available.

## Integration boundary

No new resource, tool, API or build entry is needed for standalone documents.
Existing Project→Tasks/Timesheets and Task→Timesheets hints are preserved. New
root/row relation GET hints belong to the server's canonical
`documentNavigationHints`/`invoiceNavigationHints` registry; this UI does not
invent them.

Source readiness does not establish DT whiteboard availability. The recorded
read-only document envelope/binding remains tracked in
[owner issue #48](https://github.com/Casys-AI/mcp-erpnext/issues/48). A recorded
embed must supply no commands and retain immutable document identity; the
existing Buy recorded-session viewer is unchanged. Publication and runtime
adoption are separate from this source change.
