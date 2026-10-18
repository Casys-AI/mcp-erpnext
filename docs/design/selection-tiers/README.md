# Design: graduated selection and query items (3.3.0-beta)

Status: proposed, 2026-10-18, revised after a Codex design review. Implements
the core rule of mcpview view ADR 0006 ("graduated selection, compact by
default") in the ERPNext pilot.

## Goal

What the model receives depends on how much the user selected:

| Selection                    | Sent to the model                                     | Intent             |
| ---------------------------- | ----------------------------------------------------- | ------------------ |
| 1 item                       | its compact record (and its derived resource, if any) | "look at this one" |
| 2 or 3 items                 | their compact records, side by side                   | comparison         |
| 4 to 8 items                 | references only (`id`, `label`, short `value`)        | "these ones"       |
| more than 8 rows of one list | one query item (summary + `erpnext_doc_list` call)    | "this set"         |

The model can always fetch more with `*_get` or the list tool. Thresholds are
parameters (defaults 3 and 8).

## What exists today (main, 3.2.3)

- Items are references. `documentContextItem`
  (`src/ui/shared/document/context-items.ts:16`) builds
  `{ id: "record:<doctype>:<name>", view, label: <name>, value?: "<doctype> · <title> ·
  <status>" }`,
  with title and status only when present. Child rows with an `item_code` add
  `:row:<table>:<row>` (`context-items.ts:66`). The stock viewer has its own
  builder (`src/ui/stock-viewer/src/stock-interactions.ts:14`).
- Snapshot `casys.erpnext/active-context` version 2, at most 8 items, bounds in
  `ACTIVE_CONTEXT_LIMITS` (`src/ui/shared/active-context.ts:97-107`). Today `id`
  is trimmed and cut at 180 code points (`active-context.ts:556`).
- The basket is FIFO: every add cuts to 8 at once (`active-context.ts:323`), so
  it never holds a ninth item.
- Refresh reconciles by `reconcileKey` and drops any id missing from the
  candidates (`active-context.ts:501`). Equality (`sameActiveContextItem`,
  `active-context.ts:221`) compares `id`, `view`, `label` and `value` only.
- Compact record sources:
  - a list row holds the fields the list tool returned. The doclist shows at
    most six of them, chosen by local priorities
    (`src/ui/shared/doclist/helpers.ts:53`, `useDoclist.ts:67`);
  - the doc-viewer receives `_fieldLayout.preview` and `labels` (3.2.0). The
    preview is built from `in_preview` or `bold` fields plus `title_field`,
    falling back to `in_list_view` (`src/tools/doctype-layout.ts:112`). The
    layout can be absent (`doctype-layout.ts:262`).
- In the doclist, search, chip filters, sort and pagination are local to the
  loaded rows (`useDoclist.ts:78-106`). The server query that loaded the list
  does not describe what the user sees.
- Chart and KPI-trend selections already attach a derived JSON resource
  (`src/ui/chart-viewer/src/chart-interactions.ts:575`,
  `src/ui/kpi-viewer/src/KpiViewer.tsx:111`), sent independently of the snapshot
  items (`active-context.ts:683`).
- Some charts carry `_pointJumps` and `_seriesPointJumps`, built on the server
  and tested against the tool schemas (`src/tools/ui-refresh.ts:1517`,
  `ui-refresh_test.ts:405`).
- `erpnext_doc_list` accepts `["name", "in", [...]]`: schema at
  `src/tools/doc-list-query.ts:64`, parser at `:96`, test at
  `doc-list-query_test.ts:38`. Dedicated list tools
  (`erpnext_sales_invoice_list` and others) rebuild their own filters and would
  drop a `name in` filter (`src/tools/sales.ts:625-646`).

## Core change: members versus projection

A FIFO basket of items cannot express "9 selected rows". The controller
therefore splits two things.

**Selection state (members)**, the source of truth:

- **singles**: items selected one by one (document, chart point, KPI, child row,
  stock line);
- **groups**: the rows selected in one list. A group is keyed by the list's
  `reconcileKey` and holds an ordered set of row members
  `{ name, label, fields? }`.

**Projection**, a pure function of the members that produces the snapshot items:

```ts
function projectSelection(
  state: SelectionState,
  policy = {
    compactUpTo: 3,
    groupCollapseAbove: 8,
    maxEntries: 8,
    budgetBytes: 8192,
  },
): ContextSelectionItem[];
```

1. A group projects to one reference per row only when it has at most
   `groupCollapseAbove` rows **and** those rows fit in the entry budget left by
   the other entries. Otherwise it projects to **one query item**. Collapse is
   decided by fit, so removing a row can never unfold a group into more entries
   than the budget allows.
2. Entries = singles + projected rows + query items. **Only additions evict.**
   When the user adds an entry beyond `maxEntries`, the oldest entries are
   dropped (FIFO over entries), and their members are removed from the state in
   the same mutation, so their checkboxes clear. A removal never evicts
   anything.
3. If entries ≤ `compactUpTo`, records keep their `fields`. Otherwise `fields`
   are stripped.
4. Budget: if the serialized items exceed `budgetBytes` of UTF-8 (resources
   excluded), `fields` are stripped from the newest entries first, then the
   oldest entries are dropped. The function is deterministic.

Every user action is **one atomic mutation of the members** (add, remove, range,
select-all, clear), recorded in the existing mutation journal. Collapse and
expand are derived, never stored, so undo and replay stay exact: 8 → 9 → undo
goes back to 8 individual rows, because the ninth row was never part of the
replayed state.

## Contract: snapshot version 3

`casys.erpnext/active-context`, version 3. Only the model reads the snapshot;
hosts do not parse it. The server instructions describe v3. The legacy reader
planned in `@mcpview/contracts` (ADR 0006) will accept v2 and v3.

```ts
interface ContextSelectionItem {
  id: string; // exact: never trimmed or cut; longer than 512 code points: rejected (ID_TOO_LONG)
  view: string;
  label: string;
  value?: string;
  /** Compact record; serialized only when entries ≤ compactUpTo. */
  fields?: { label: string; value: string }[]; // ≤ 8 entries; label ≤ 40, value ≤ 80 code points
  /** Query items only. */
  query?: {
    tool: "erpnext_doc_list";
    args: {
      doctype: string;
      filters: [["name", "in", string[]]];
      fields: string[];
      limit: number;
    };
    selectedCount: number; // rows the user selected
    includedCount: number; // names actually in args (≤ 100)
    truncated: boolean; // includedCount < selectedCount
  };
}
```

- The 512 limit fits every Frappe-built identity: names and warehouses are
  `varchar(140)` and DocType names are 61 characters at most, so the longest
  child-row or stock identity stays under it. `ID_TOO_LONG` only guards against
  malformed input.
- A query item's id is `query:<doctype>:<hash>`, where the hash is computed over
  the canonical JSON of the sorted member names.
- Its `label` is the summary, for example « 30 Sales Invoices · Jan–Mar 2026 ·
  1,000–5,000 EUR ». When `truncated`, it reads « first 100 of 230 selected
  Sales Invoices ».
- `fields`, `label` and `value` go through the #84 sanitization; `id` never
  does.
- `fields` order: the doc-viewer preview order, or the doclist's visible column
  order. The first 8 are kept.

## Sources of compact records (per surface)

| Surface                         | Kind         | `fields` source                                         | Derived resource |
| ------------------------------- | ------------ | ------------------------------------------------------- | ---------------- |
| Doc-viewer record               | single       | `_fieldLayout.preview` + `labels` (none without layout) | none             |
| Doclist row                     | group member | the row's visible columns (≤ 6)                         | none             |
| Child row (`item_code`)         | single       | item code, name, qty, warehouse, amount                 | none             |
| Stock line                      | single       | its existing builder, plus warehouse and qty            | none             |
| Chart point, KPI value or trend | single       | none (the `value` is the information)                   | series JSON      |
| Explicit attachment             | single       | none                                                    | the file         |

**Resource rule.** A derived resource (chart or KPI series JSON) is sent only
when the projection has exactly 1 entry. An explicitly attached file is always
sent, as today, and stays disclosed in the chip (#84). At most one resource goes
out: the explicit attachment wins, then the newest derived resource.

**Field freshness.** Equality extends to `fields` and `query`. Each member
records its fields source (`"record"` or `"row"`) and the document's `modified`
timestamp when known. On refresh:

- a candidate with a newer `modified` replaces the member's fields entirely,
  even from a poorer source;
- with the same `modified` (or none), the richer source wins: a record beats a
  row;
- an older candidate is ignored.

A stale record summary is therefore corrected by any newer row, and a list
refresh never downgrades fresh record fields.

## Refresh and reconciliation

- **Singles**: unchanged, reconciled by `reconcileKey`.
- **Groups**: on a list refresh, a member is removed only when its absence is
  **confirmed**, that is when the refreshed list is complete (no pagination
  limit reached) and the name is missing. Members outside the loaded window are
  kept. Labels and fields of present members refresh under the freshness rule.
  The projection then recomputes collapse, summary and counts.
- A group whose list view is closed (navigation root changed) is cleared, like
  singles today (existing generation fencing).

## Query items: rules

1. Tool: **only `erpnext_doc_list`**, the only tool that keeps an exact
   `name in` filter. The doclist viewer's manifest must list it: add it to
   `VIEWER_TOOL_CANDIDATES` (`src/tools/ui-refresh.ts:1122`) for the doclist
   when the tool is registered.
2. If `erpnext_doc_list` is unavailable (excluded by `ERPNEXT_*` filters), there
   is no collapse. The group keeps all its members in the state but projects
   only the newest rows that fit the entry budget. The chip shows « selection
   partly shared (k of N) ». Members are not evicted, and nothing is cut
   silently.
3. Cap: 100 names in `args`. `selectedCount`, `includedCount` and `truncated`
   make any cut explicit.
4. `args.fields` are the list's visible columns; `args.limit` is
   `includedCount`.

## Gestures

### Phase A: doclist

- **Leading checkbox column**, visible only when the host supports the active
  context. The header checkbox selects or clears every row matching the current
  local filters, all loaded pages included. A row checkbox toggles that row.
- **Shift + click on a row checkbox** selects the range from the last anchor, in
  the current local sort order.
- **Unchanged**: a row click toggles context, double-click, `›` and Enter open
  the detail, and Space toggles the row.
- **Chip**:
  - a group shows « 30 rows · Sales Invoice » with its summary and a remove
    button;
  - « details shared » appears when compact records are being sent;
  - « partly shared » appears when rule 2 applies.

### Phase B: charts (separate design, with mockups)

- **Lasso**: Shift + drag, or a « select » toggle button. A plain drag stays
  reserved for scrolling, which matters inline on mobile.
- **Merging points** only when the union is exactly expressible: same DocType,
  same scope, one canonical identity.
  - Income and Expenses points produce separate query items.
  - Disjoint months produce one item per range, or a `name in` list.
  - `erpnext_price_vs_qty` points are Bins (item + warehouse): their identity is
    the Bin, not `item_code`.

## Model-facing description

The server instructions (#83) gain, within the existing 900-character test:

- items may carry `fields`, a compact record;
- an item with `query` stands for a set of rows, which the model can read by
  calling `query.tool` with `query.args`;
- `truncated: true` means only the first `includedCount` rows are listed.

## Phase A tests (3.3.0-beta.1)

- `projectSelection`:
  - the tier table for 1, 2, 3, 4 and 8 entries, and a group of 8 versus 9 rows;
  - FIFO over entries, with dropped members cleared;
  - budget stripping order;
  - determinism.
- Removal safety: a group of 9 rows (collapsed) plus 7 singles, then one row
  unchecked: no other entry is lost, and the group stays one query item.
- Journal: 8 → 9 → undo restores 8 rows; removing a query item and then a late
  undo; refresh during undo; the host refusing the ACK.
- Reconciliation: confirmed absence versus outside the window; the
  field-freshness rule.
- Contract:
  - `id` exact at every tier, and the `ID_TOO_LONG` rejection;
  - query hash stability, and the 100-name cap with its counts;
  - query args valid against the `erpnext_doc_list` schema (reuse the
    `SchemaValidator` test of `ui-refresh_test.ts:432`);
  - the UTF-8 budget measured with `TextEncoder`.
- Resources: a derived resource only at 1 entry; an explicit attachment always.
- Doclist: select-all with local filters, Shift-range in the local sort order,
  and the fallback without `erpnext_doc_list`. One dev-host check.

## Out of scope

View-provided tools (draft MCP Apps), multi-iframe supersession and the
`@mcpview/view/context` extraction. They follow the ADR 0002 sequence.

## Open questions

1. Should a 2-to-3-item comparison also open a side-by-side panel in the view,
   not only send the compact records to the model? Proposal: decide on the
   mockups.
2. Is the 8 KiB UTF-8 budget right? Measure what Claude and ChatGPT keep across
   turns (host matrix) before freezing it.
