# Demo catalogue preparation runbook — inspection-drone-id01

Offline preparation only: preparation JSON (`demo-catalogue/1.0`) becomes an
inspectable ordered list of proposed `erpnext_item_create` /
`erpnext_doc_create` calls. Nothing is created, read, or checked against a site
here. Real ID01 source packets are supplied separately and validated against
this schema.

## 1. Behavior and limitations

- The planner (`src/buy/demo-catalogue.ts`) is pure: no HTTP, no secret, no site
  selected. Output (`demo-catalogue-plan/1.0`) is marked `demo: true`,
  `stage: "preparatory"`, `grants: "none"`.
- Public listings become `Item Price` catalogue rows only. Never proposed:
  `Supplier Quotation`, `BOM`, purchase quantities, validity dates, supplier
  links, tax/shipping inference, or copied print/labor estimates.
- Lines with unknown price are explicitly unpriced (`"amount": null`) and plan
  an `Item` only — never a zero rate.
- Source mapping stays `unknown` / `candidate`: no technical compatibility is
  granted and no drone parts are chosen.
- Source URL/date/hash entries are operator-declared until source ingress
  verifies them; the plan never reads or hash-verifies files and carries no
  `modified`, `siteId`, or qualification evidence.

## 2. Input shape — `demo-catalogue/1.0` (frozen)

Closed object; unknown keys (including any validity date) are refused.

```json
{
  "schema": "demo-catalogue/1.0",
  "scenario": "DEMO-ID01 <demo scenario>",
  "priceList": { "name": "DEMO-ID01-BUYING", "currency": "EUR" },
  "sources": [
    {
      "id": "src-001",
      "path": "<immutable manifest path>",
      "category": "public-catalogue",
      "url": "https://<public catalogue page>",
      "retrievedAt": "2026-09-13T08:00:00.000Z",
      "sha256": "sha256:<64 hex>"
    }
  ],
  "lines": [
    {
      "itemCode": "DEMO-ID01-001",
      "itemName": "<name>",
      "itemGroup": "<existing group>",
      "stockUom": "Nos",
      "sourceRef": "src-001",
      "sourceMapping": "candidate",
      "observation": {
        "amount": "12.50",
        "currency": "EUR",
        "uom": "Nos",
        "pack": "1 pc",
        "taxShipping": "unknown"
      }
    }
  ],
  "unresolved": ["<open metadata items>"]
}
```

Rules:

- `scenario` starts with `DEMO-ID01` followed by a space, a hyphen or the end of
  the name; `itemCode` and `priceList.name` start with `DEMO-ID01-`. UOM names
  are preserved as-is (e.g. `Nos`).
- `priceList` is buying only (plan emits `buying: 1, selling: 0`). Line currency
  must match it; line `uom` must match `stockUom`. No conversions, no inferred
  quantities.
- `sourceRef` must match exactly one `sources[].id`.
- `amount` is explicit: positive decimal string or `null` (unpriced). Omission,
  zero, and negatives are refused.
- **Priced lines** require source `category: "public-catalogue"`, `url`
  (absolute `http(s)`), `retrievedAt` (canonical UTC), and `sha256` (`sha256:…`)
  on the referenced source. Hashes are linked when authoritatively known — never
  manufactured. URL validation checks absolute HTTP(S) syntax; it does not
  verify public reachability, DNS, or catalogue authenticity. URLs refuse
  credentials, query strings and fragments. Source categories are declared
  preparation metadata, not verified admission; `documentary` sources and
  unclassified sources cannot supply an Item Price. Unpriced lines may reference
  sources with missing metadata; the parser adds each referenced source's
  missing fields to `unresolved`.
- Duplicate `itemCode` / source `id` values are refused.

Plan output preserves the `sources` entries and optional per-line `note`
alongside observations (`priced` flag) and the ordered `calls`, plus UOM / Item
Group `prerequisites` that must already exist on the site.

## 3. CLI

```bash
deno run --allow-read scripts/buy-plan-demo-catalogue.ts --input <preparation.json>
# or: deno task buy:plan-demo --input <preparation.json>
```

Exactly `--input <path>`; `--help` prints usage. Any other flag (including
`--apply`) or extra argument fails with a structured
`{"error": code, message, context, recovery}` object on stderr and a non-zero
exit. The CLI never applies anything.

Unpriced example (no real prices inside):

```bash
deno run --allow-read scripts/buy-plan-demo-catalogue.ts \
  --input docs/demo-catalogue.unpriced-example.json
```

## 4. Operator apply path (later, not this step)

1. Select the demo site and credentials in the owner context (see §5).
2. Before each proposed call, compare the current site document: reuse an equal
   document and **refuse divergent overwrite**. A generic `erpnext_doc_get` may
   use the owner's cache; it does not guarantee a fresh read. In the owner
   execution path, use `FrappeClient.get(..., { skipCache: true })` for a known
   document name. For an Item Price whose generated name is unknown, use a
   filtered `FrappeClient.list(..., { skipCache: true })` and refuse ambiguous
   matches before comparing the document. No apply path is implemented here.
3. Create missing docs through `erpnext_item_create` / `erpnext_doc_create`
   only.
4. Record the real IDs and server timestamps **after** actual creation; never
   back-fill them into the plan.

## 5. Known missing slots (placeholders only, none active)

- Demo site installed and selected; normalized URL / real site identity.
- Pinned runnable image digest and topology.
- Secret slots (API key/secret) — opaque, never in preparation JSON
  (credential-like keys are refused by the planner).
- Closed installation profile and qualification fixture — shapes below are
  illustrative only; do not place them under `state/local`:

```text
installation-profile: { siteUrl: "<demo-site-url>", imageDigest: "<sha256:…>",
  topology: "<operator network note>", secrets: "<opaque slot refs only>" }
qualification-fixture: { profile: "<above>", checks: ["fresh GET round-trip"],
  status: "draft — not qualified" }
```

- Real ID01 source manifest entries and item-to-part mapping decisions.
