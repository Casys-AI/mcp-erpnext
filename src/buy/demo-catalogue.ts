/**
 * Offline demo catalogue import planner for inspection-drone-id01.
 *
 * Preparation only: `--input` preparation JSON (schema
 * `demo-catalogue/1.0`) becomes an inspectable ordered list of proposed
 * `erpnext_item_create` / `erpnext_doc_create` calls. No HTTP, no secret, no
 * site selected, no document applied here. The future operator applies the
 * plan through the existing owner tool path with GET/pre-existence
 * comparisons first.
 *
 * Public listings become `Item Price` (`catalogue`) rows only. The planner
 * never proposes `Supplier Quotation`, `BOM`, quantities, `valid_upto`, or
 * copied print/labor estimates. Lines with unknown price are explicitly
 * unpriced (`amount: null`) and plan an `Item` only — never a zero rate.
 * Source mapping stays `unknown` / `candidate`: the planner grants no
 * technical compatibility and chooses no drone parts.
 */

import {
  boundedArray,
  canonicalTimestamp,
  currencyCode,
  decimalString,
  fingerprint,
  nonEmpty,
  oneOf,
  record,
  rejectForbiddenKeys,
} from "./json.ts";

export const DEMO_CATALOGUE_SCHEMA = "demo-catalogue/1.0" as const;
export const DEMO_CATALOGUE_PLAN_SCHEMA = "demo-catalogue-plan/1.0" as const;
export const DEMO_CATALOGUE_PREFIX = "DEMO-ID01" as const;
export const DEMO_CATALOGUE_MAX_SOURCES = 64;
export const DEMO_CATALOGUE_MAX_LINES = 64;

export const DEMO_CATALOGUE_ERROR_CODES = [
  "DEMO_CATALOGUE_INVALID_INPUT",
  "DEMO_CATALOGUE_AMBIGUOUS_SOURCE",
  "DEMO_CATALOGUE_DUPLICATE_CONFLICT",
  "DEMO_CATALOGUE_INVALID_ARGS",
] as const;

export type DemoCatalogueErrorCode = typeof DEMO_CATALOGUE_ERROR_CODES[number];

export class DemoCatalogueError extends Error {
  readonly code: DemoCatalogueErrorCode;
  readonly context: Readonly<Record<string, unknown>>;
  readonly recovery: string;

  constructor(
    code: DemoCatalogueErrorCode,
    message: string,
    options: {
      context?: Record<string, unknown>;
      recovery: string;
    },
  ) {
    super(message);
    this.name = "DemoCatalogueError";
    this.code = code;
    this.context = Object.freeze({ ...(options.context ?? {}) });
    this.recovery = options.recovery;
  }
}

export function isDemoCatalogueError(
  error: unknown,
): error is DemoCatalogueError {
  return error instanceof DemoCatalogueError;
}

export type DemoSourceMapping = "unknown" | "candidate";

export interface DemoCatalogueSource {
  readonly id: string;
  readonly path: string;
  readonly sha256?: string;
  readonly url?: string;
  readonly retrievedAt?: string;
}

export interface DemoCatalogueObservation {
  readonly amount: string | null;
  readonly currency: string;
  readonly uom: string;
  readonly pack?: string;
  readonly taxShipping?: string;
}

export interface DemoCatalogueLine {
  readonly itemCode: string;
  readonly itemName: string;
  readonly itemGroup: string;
  readonly stockUom: string;
  readonly sourceRef: string;
  readonly sourceMapping: DemoSourceMapping;
  readonly observation: DemoCatalogueObservation;
  readonly note?: string;
}

export interface DemoCatalogueInput {
  readonly scenario: string;
  readonly priceList: { readonly name: string; readonly currency: string };
  readonly sources: readonly DemoCatalogueSource[];
  readonly lines: readonly DemoCatalogueLine[];
  readonly unresolved: readonly string[];
}

export interface DemoCataloguePlanCall {
  readonly tool: "erpnext_item_create" | "erpnext_doc_create";
  readonly input: Record<string, unknown>;
}

export interface DemoCataloguePlanObservation {
  readonly itemCode: string;
  readonly sourceRef: string;
  readonly sourceMapping: DemoSourceMapping;
  readonly priced: boolean;
  readonly amount: string | null;
  readonly currency: string;
  readonly uom: string;
  readonly pack?: string;
  readonly taxShipping: string;
}

export interface DemoCataloguePlan {
  readonly schema: typeof DEMO_CATALOGUE_PLAN_SCHEMA;
  readonly demo: true;
  readonly stage: "preparatory";
  readonly grants: "none";
  readonly scenario: string;
  readonly priceList: { readonly name: string; readonly currency: string };
  readonly sources: readonly DemoCatalogueSource[];
  readonly prerequisites: {
    readonly uoms: readonly string[];
    readonly itemGroups: readonly string[];
  };
  readonly observations: readonly DemoCataloguePlanObservation[];
  readonly calls: readonly DemoCataloguePlanCall[];
  readonly unresolved: readonly string[];
  readonly notes: readonly string[];
}

function fail(
  code: DemoCatalogueErrorCode,
  message: string,
  context: Record<string, unknown>,
  recovery: string,
): never {
  throw new DemoCatalogueError(code, message, { context, recovery });
}

function closedKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  name: string,
): Record<string, unknown> {
  const root = record(value, name);
  const ownKeys = Reflect.ownKeys(root);
  if (ownKeys.some((key) => typeof key !== "string")) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name} must contain only string keys.`,
      {},
      `Remove non-string keys from ${name}.`,
    );
  }
  const keys = new Set(ownKeys as string[]);
  const allowed = new Set([...required, ...optional]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail(
        "DEMO_CATALOGUE_INVALID_INPUT",
        `${name}.${key} is not part of ${DEMO_CATALOGUE_SCHEMA}.`,
        { key },
        `Remove ${name}.${key}; dates such as valid_upto are operator decisions, never plan fields.`,
      );
    }
  }
  for (const key of required) {
    if (!keys.has(key) || root[key] === undefined) {
      fail(
        "DEMO_CATALOGUE_INVALID_INPUT",
        `${name}.${key} is required and must be explicit.`,
        { key },
        `Set ${name}.${key} explicitly; unknown prices use null, never omission or zero.`,
      );
    }
  }
  return root;
}

function prefixedDemo(value: string, name: string): string {
  if (!value.startsWith(`${DEMO_CATALOGUE_PREFIX}-`)) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name} must carry the ${DEMO_CATALOGUE_PREFIX}- prefix.`,
      { name },
      `Rename ${name} with the ${DEMO_CATALOGUE_PREFIX}- prefix so demo data stays identifiable.`,
    );
  }
  return value;
}

function assertPositiveDecimal(value: string, name: string): void {
  if (value.startsWith("-")) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name} must be a positive amount.`,
      {},
      `Use an explicit null amount for unpriced lines; never zero or negative.`,
    );
  }
  if (/^0*(\.0*)?$/.test(value)) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name} must be a positive amount; zero is not a price.`,
      {},
      `Use an explicit null amount for unpriced lines; never a zero fallback.`,
    );
  }
}

function assertPublicUrl(value: string, name: string): string {
  if (!/^https?:\/\/.+/.test(value)) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name} must be a public http(s) URL.`,
      {},
      `Set ${name} to the public catalogue page the observation was read from.`,
    );
  }
  return value;
}

function parseSource(value: unknown, index: number): DemoCatalogueSource {
  const name = `sources[${index}]`;
  const root = closedKeys(
    value,
    ["id", "path"],
    ["sha256", "url", "retrievedAt"],
    name,
  );
  const id = nonEmpty(root.id, `${name}.id`);
  const path = nonEmpty(root.path, `${name}.path`);
  return {
    id,
    path,
    sha256: root.sha256 === undefined
      ? undefined
      : fingerprint(root.sha256, `${name}.sha256`),
    url: root.url === undefined
      ? undefined
      : assertPublicUrl(nonEmpty(root.url, `${name}.url`), `${name}.url`),
    retrievedAt: root.retrievedAt === undefined
      ? undefined
      : canonicalTimestamp(root.retrievedAt, `${name}.retrievedAt`),
  };
}

function assertPricedSource(
  source: DemoCatalogueSource,
  line: DemoCatalogueLine,
): void {
  const missing = (["url", "retrievedAt", "sha256"] as const).filter(
    (key) => source[key] === undefined,
  );
  if (missing.length > 0) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `Priced line ${line.itemCode} needs declared source metadata (url, retrievedAt, sha256) on ${source.id}.`,
      { itemCode: line.itemCode, sourceRef: line.sourceRef, missing },
      `Record the public URL, actual retrieval timestamp, and manifest hash on sources entry ${source.id}, or leave the line unpriced with the gap in unresolved.`,
    );
  }
}

function parseObservation(
  value: unknown,
  name: string,
  priceCurrency: string,
  stockUom: string,
): DemoCatalogueObservation {
  const root = closedKeys(
    value,
    ["amount", "currency", "uom"],
    ["pack", "taxShipping"],
    name,
  );
  let amount: string | null = null;
  if (root.amount !== null) {
    amount = decimalString(root.amount, `${name}.amount`);
    assertPositiveDecimal(amount, `${name}.amount`);
  }
  const currency = currencyCode(root.currency, `${name}.currency`);
  if (currency !== priceCurrency) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name}.currency must match the demo Price List currency.`,
      { currency, priceCurrency },
      `Fix ${name}.currency to ${priceCurrency}; the planner never converts currencies.`,
    );
  }
  const uom = nonEmpty(root.uom, `${name}.uom`);
  if (uom !== stockUom) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `${name}.uom must match the line stock_uom.`,
      { uom, stockUom },
      `Fix ${name}.uom to ${stockUom}; pack sizes stay in the pack note, never as a second UOM.`,
    );
  }
  return {
    amount,
    currency,
    uom,
    pack: root.pack === undefined
      ? undefined
      : nonEmpty(root.pack, `${name}.pack`),
    taxShipping: root.taxShipping === undefined
      ? undefined
      : nonEmpty(root.taxShipping, `${name}.taxShipping`),
  };
}

function parseLine(
  value: unknown,
  index: number,
  priceCurrency: string,
): DemoCatalogueLine {
  const name = `lines[${index}]`;
  const root = closedKeys(
    value,
    [
      "itemCode",
      "itemName",
      "itemGroup",
      "stockUom",
      "sourceRef",
      "sourceMapping",
      "observation",
    ],
    ["note"],
    name,
  );
  const itemCode = prefixedDemo(
    nonEmpty(root.itemCode, `${name}.itemCode`),
    `${name}.itemCode`,
  );
  const itemName = nonEmpty(root.itemName, `${name}.itemName`);
  const itemGroup = nonEmpty(root.itemGroup, `${name}.itemGroup`);
  const stockUom = nonEmpty(root.stockUom, `${name}.stockUom`);
  const sourceRef = nonEmpty(root.sourceRef, `${name}.sourceRef`);
  const sourceMapping = oneOf(
    root.sourceMapping,
    ["unknown", "candidate"] as const,
    `${name}.sourceMapping`,
  );
  const observation = parseObservation(
    root.observation,
    `${name}.observation`,
    priceCurrency,
    stockUom,
  );
  return {
    itemCode,
    itemName,
    itemGroup,
    stockUom,
    sourceRef,
    sourceMapping,
    observation,
    note: root.note === undefined
      ? undefined
      : nonEmpty(root.note, `${name}.note`),
  };
}

export function parseDemoCatalogueInput(value: unknown): DemoCatalogueInput {
  try {
    return parseDemoCatalogueInputInner(value);
  } catch (error) {
    if (isDemoCatalogueError(error) || !(error instanceof TypeError)) {
      throw error;
    }
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      error.message,
      {},
      "Fix the flagged field to match the demo-catalogue/1.0 preparation shape.",
    );
  }
}

function parseDemoCatalogueInputInner(value: unknown): DemoCatalogueInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `input must be a ${DEMO_CATALOGUE_SCHEMA} object.`,
      {},
      "Pass the preparation JSON object with schema, scenario, priceList, sources, and lines.",
    );
  }
  rejectForbiddenKeys(value, "input");
  const root = closedKeys(
    value,
    ["schema", "scenario", "priceList", "sources", "lines"],
    ["unresolved"],
    "input",
  );
  if (root.schema !== DEMO_CATALOGUE_SCHEMA) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `input.schema must be ${DEMO_CATALOGUE_SCHEMA}.`,
      {},
      "This planner accepts only the local demo-catalogue schema, never provider or DT admission schemas.",
    );
  }
  const scenario = nonEmpty(root.scenario, "input.scenario");
  if (!scenario.includes(DEMO_CATALOGUE_PREFIX)) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      `input.scenario must name the ${DEMO_CATALOGUE_PREFIX} demo scenario.`,
      {},
      `Name the demo scenario explicitly with the ${DEMO_CATALOGUE_PREFIX} prefix.`,
    );
  }
  const priceListRoot = closedKeys(
    root.priceList,
    ["name", "currency"],
    [],
    "input.priceList",
  );
  const priceListName = prefixedDemo(
    nonEmpty(priceListRoot.name, "input.priceList.name"),
    "input.priceList.name",
  );
  const priceListCurrency = currencyCode(
    priceListRoot.currency,
    "input.priceList.currency",
  );

  const sources = boundedArray(
    root.sources,
    DEMO_CATALOGUE_MAX_SOURCES,
    "input.sources",
  ).map((entry, index) => parseSource(entry, index));
  if (sources.length === 0) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      "input.sources must list at least one immutable source manifest entry.",
      {},
      "Add the local source manifest entries (path/hash/URL/retrievedAt) every line references.",
    );
  }
  const sourcesById = new Map<string, DemoCatalogueSource>();
  for (const source of sources) {
    if (sourcesById.has(source.id)) {
      fail(
        "DEMO_CATALOGUE_DUPLICATE_CONFLICT",
        `input.sources duplicates id ${source.id}.`,
        { id: source.id },
        "Give each source manifest entry a unique id so line references stay unambiguous.",
      );
    }
    sourcesById.set(source.id, source);
  }

  const lines = boundedArray(
    root.lines,
    DEMO_CATALOGUE_MAX_LINES,
    "input.lines",
  )
    .map((entry, index) => parseLine(entry, index, priceListCurrency));
  if (lines.length === 0) {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      "input.lines must list at least one demo item.",
      {},
      "Add at least one line with item identity, source reference, and an explicit observation (null when unpriced).",
    );
  }
  const itemCodes = new Set<string>();
  for (const line of lines) {
    if (itemCodes.has(line.itemCode)) {
      fail(
        "DEMO_CATALOGUE_DUPLICATE_CONFLICT",
        `input.lines duplicates itemCode ${line.itemCode}.`,
        { itemCode: line.itemCode },
        "Merge the duplicate into a single line or disambiguate the item codes before planning.",
      );
    }
    itemCodes.add(line.itemCode);
    const source = sourcesById.get(line.sourceRef);
    if (source === undefined) {
      fail(
        "DEMO_CATALOGUE_AMBIGUOUS_SOURCE",
        `lines item ${line.itemCode} references unknown source ${line.sourceRef}.`,
        { itemCode: line.itemCode, sourceRef: line.sourceRef },
        "Point sourceRef at exactly one input.sources id; the planner never guesses a source.",
      );
    }
    if (line.observation.amount !== null) {
      assertPricedSource(source, line);
    }
  }

  const unresolved = root.unresolved === undefined ? [] : boundedArray(
    root.unresolved,
    DEMO_CATALOGUE_MAX_SOURCES,
    "input.unresolved",
  )
    .map((entry, index) => nonEmpty(entry, `input.unresolved[${index}]`));

  return {
    scenario,
    priceList: { name: priceListName, currency: priceListCurrency },
    sources,
    lines,
    unresolved,
  };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted();
}

export function planDemoCatalogue(input: unknown): DemoCataloguePlan {
  const parsed = parseDemoCatalogueInput(input);
  const calls: DemoCataloguePlanCall[] = [
    {
      tool: "erpnext_doc_create",
      input: {
        doctype: "Price List",
        data: {
          price_list_name: parsed.priceList.name,
          currency: parsed.priceList.currency,
          buying: 1,
          selling: 0,
        },
      },
    },
  ];
  const observations: DemoCataloguePlanObservation[] = [];
  for (const line of parsed.lines) {
    calls.push({
      tool: "erpnext_item_create",
      input: {
        item_code: line.itemCode,
        item_name: line.itemName,
        item_group: line.itemGroup,
        uom: line.stockUom,
        description:
          `${DEMO_CATALOGUE_PREFIX} preparatory demo item; public catalogue observation only; source ${line.sourceRef}; grants none.`,
      },
    });
    const priced = line.observation.amount !== null;
    observations.push({
      itemCode: line.itemCode,
      sourceRef: line.sourceRef,
      sourceMapping: line.sourceMapping,
      priced,
      amount: line.observation.amount,
      currency: line.observation.currency,
      uom: line.observation.uom,
      ...(line.observation.pack === undefined
        ? {}
        : { pack: line.observation.pack }),
      taxShipping: line.observation.taxShipping ?? "unknown",
    });
    if (priced) {
      calls.push({
        tool: "erpnext_doc_create",
        input: {
          doctype: "Item Price",
          data: {
            item_code: line.itemCode,
            item_name: line.itemName,
            price_list: parsed.priceList.name,
            price_list_rate: line.observation.amount,
            currency: line.observation.currency,
            uom: line.observation.uom,
            buying: 1,
            selling: 0,
          },
        },
      });
    }
  }
  return {
    schema: DEMO_CATALOGUE_PLAN_SCHEMA,
    demo: true,
    stage: "preparatory",
    grants: "none",
    scenario: parsed.scenario,
    priceList: { ...parsed.priceList },
    sources: parsed.sources.map((source) => ({ ...source })),
    prerequisites: {
      uoms: sortedUnique(parsed.lines.map((line) => line.stockUom)),
      itemGroups: sortedUnique(parsed.lines.map((line) => line.itemGroup)),
    },
    observations,
    calls,
    unresolved: [...parsed.unresolved],
    notes: [
      "Preparatory plan only: nothing was created, read, or checked against a site.",
      "Source URL/date/hash entries are operator-declared until source ingress verifies them; the plan never reads or hash-verifies files.",
      "Source mapping unknown/candidate grants no technical compatibility; the operator chooses drone parts.",
      "Apply later through the existing owner tool path with GET/pre-existence comparisons first; reuse equal docs, refuse divergent overwrite, record the real IDs and server timestamps only after actual creation.",
      "Validity dates, taxes, and shipping are operator decisions; the planner never derives commercial validity from a retrieval date.",
    ],
  };
}

export function planDemoCatalogueFromJson(text: string): DemoCataloguePlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(
      "DEMO_CATALOGUE_INVALID_INPUT",
      "input is not valid JSON.",
      {},
      "Pass a valid JSON file matching the demo-catalogue/1.0 preparation shape.",
    );
  }
  return planDemoCatalogue(parsed);
}

export type DemoCatalogueCliArgs =
  | { readonly help: true }
  | { readonly help: false; readonly inputPath: string };

export function parseDemoCatalogueCliArgs(
  args: readonly string[],
): DemoCatalogueCliArgs {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    return { help: true };
  }
  if (
    args.length === 2 && args[0] === "--input" && args[1] !== "" &&
    !args[1].startsWith("--")
  ) {
    return { help: false, inputPath: args[1] };
  }
  fail(
    "DEMO_CATALOGUE_INVALID_ARGS",
    `Usage: buy-plan-demo-catalogue.ts --input <preparation-json-path>.`,
    { args: [...args] },
    "Pass exactly --input <path>; --help shows usage. No other flags are accepted.",
  );
}
