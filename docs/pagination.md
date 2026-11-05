# Pagination and complete reads

## Reading a page

All dedicated document list tools, including user and file lists, and
`erpnext_stock_balance` accept `limit` and `offset`. Existing default page sizes
and response shapes are preserved. `offset` defaults to zero; both inputs must
be non-negative integers. The file list keeps its existing limit of 1–500.

To read a whole result through these tools:

1. Keep the same filters and ordering on every call.
2. Start at `offset: 0` with a positive `limit`.
3. Increase the offset by the number of rows actually returned.
4. Continue until a page is empty. A short page can reflect an ERPNext server
   limit and does not prove that the result is complete.

Dedicated tools preserve their primary business order and add document `name` as
a unique tie-breaker. Generic `erpnext_doc_list` also stabilizes its default and
simple field orders. Advanced ordering expressions remain supported; callers
using them must ensure a deterministic order themselves.

Where already supported, `limit: 0` retains Frappe's unbounded-request
semantics. It cannot be combined with a positive offset because Frappe ignores
that offset. For controlled request sizes and continuation, use positive limits
instead.

List `count` values describe the returned page. Doclist viewer pagination sorts
and pages the rows currently loaded; it does not fetch the rest of ERPNext. A
nonempty refresh never proves that an omitted selected document has disappeared;
its selection is retained until absence is established. Kanban board responses
expose `hasMore` and accept an offset. The server probes after the last row
actually received before claiming that no cards remain.

## Reading a complete population

Calculations must not treat a display page as their full input. Analytics
aggregates and leave allocations use the shared server reader in
`src/api/list-pages.ts`: `listPages` streams pages and `listAll` collects them.
Reads use fresh data, order by `name`, and request up to 200 rows at a time with
`name > lastName` continuation. Only an empty page proves exhaustion.

Analytics queries share a 60-second read budget per handler. The reader checks
the budget before and after each request; an in-flight request still follows the
HTTP client's timeout. Repeated or missing identities, malformed pages, expiry
and request failures reject the result. There is no fixed total-row cutoff and
no partial aggregate is returned. Chart Top N limits are applied after reading
and aggregating the filtered population.

Name resolution uses the same iterator with small candidate limits. It stops
once ambiguity is established or the query is exhausted. Assignment validation
reads the complete set of requested users before any mutation.

Viewer collections share `src/ui/shared/tool-pages.ts`. Attachment metadata,
assignable users and related-timesheet counts follow offsets until an empty page
and publish the collection only when the read completes. Stale requests are
discarded when the document or viewer generation changes. File contents are not
downloaded while listing attachments. Related-timesheet reads retain their
explicit 50-page safety bound and show an error if it is reached.

## Intentional bounds and consistency

Single-document reads, ambiguity probes, chart candidate selection and recent
activity previews remain intentionally bounded. Explicit selections and Buy
workflow limits keep their existing contracts. These are not aggregate totals.

Neither offset pagination nor keyset pagination creates a database transaction
snapshot across HTTP requests. Concurrent inserts, deletes or edits can change
the population during a read. For reproducible reporting, avoid concurrent bulk
updates or use an ERPNext report that provides the required snapshot semantics.
The gross-margin KPI uses current warehouse valuation even for historical order
dates; its financial scope and limitations are documented in the
[tools reference](tools.md#gross-margin-kpi).
