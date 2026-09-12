/**
 * Closed JSON kernel for the Buy evidence contract.
 *
 * Canonical JSON: UTF-8, recursively sorted object keys, significant array
 * order, no undefined / non-finite / non-JSON values. Fingerprints are
 * SHA-256 of those bytes. This module is dual-runtime (Deno and Node) via
 * `crypto.subtle` and `TextEncoder` only.
 */

const DIGEST = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const ISO_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const CALENDAR_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const FRAPPE_DATETIME =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?$/;

const FORBIDDEN_KEYS = new Set([
  "api_key",
  "api_secret",
  "authorization",
  "baseUrl",
  "command",
  "commands",
  "cookie",
  "credentials",
  "endpoint",
  "password",
  "source_path",
  "sourcePath",
  "stagedPath",
]);

export function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  name: string,
): void {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${name} contains missing or unsupported fields.`);
  }
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name} contains missing or unsupported fields.`);
    }
  }
  const actual = (ownKeys as string[]).toSorted();
  const expected = [...keys].toSorted();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${name} contains missing or unsupported fields.`);
  }
}

export function exactRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
): Record<string, unknown> {
  const root = record(value, name);
  exactKeys(root, keys, name);
  rejectForbiddenKeys(root, name);
  return root;
}

export function denseArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  const allowed = new Set<string>(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    allowed.add(String(index));
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== allowed.size ||
    ownKeys.some((key) => typeof key !== "string" || !allowed.has(key))
  ) {
    throw new TypeError(`${name} must be a dense, unadorned array.`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name} must be a dense, unadorned array.`);
    }
  }
  return value;
}

export function literal<T extends string>(
  value: unknown,
  expected: T,
  name: string,
): T {
  if (value !== expected) throw new TypeError(`${name} must be ${expected}.`);
  return expected;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`${name} must be one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function nonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  if (value.trim() !== value) {
    throw new TypeError(`${name} must not contain whitespace padding.`);
  }
  return value;
}

export function pattern(
  value: unknown,
  expected: RegExp,
  name: string,
): string {
  if (typeof value !== "string" || !expected.test(value)) {
    throw new TypeError(`${name} has an invalid format.`);
  }
  return value;
}

export function digest(value: unknown, name: string): string {
  return pattern(value, DIGEST, name);
}

export function fingerprint(value: unknown, name: string): string {
  return pattern(value, FINGERPRINT, name);
}

export function canonicalTimestamp(value: unknown, name: string): string {
  const timestamp = pattern(value, ISO_MILLISECONDS, name);
  try {
    if (new Date(timestamp).toISOString() !== timestamp) {
      throw new TypeError(`${name} is not canonical UTC.`);
    }
  } catch {
    throw new TypeError(`${name} is not canonical UTC.`);
  }
  return timestamp;
}

export function calendarDate(value: unknown, name: string): string {
  const date = pattern(value, CALENDAR_DATE, name);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new TypeError(`${name} is not a real calendar date.`);
  }
  return date;
}

export function frappeDatetime(value: unknown, name: string): string {
  const datetime = pattern(value, FRAPPE_DATETIME, name);
  calendarDate(datetime.slice(0, 10), name);
  const [hour, minute, second] = datetime.slice(11, 19).split(":").map(Number);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError(`${name} is not a real Frappe datetime.`);
  }
  return datetime;
}

export function currencyCode(value: unknown, name: string): string {
  return pattern(value, CURRENCY, name);
}

export function decimalString(value: unknown, name: string): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new TypeError(`${name} must be a canonical decimal string.`);
  }
  return value;
}

export function integerAtLeast(
  value: unknown,
  minimum: number,
  name: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${name} must be an integer at least ${minimum}.`);
  }
  return value as number;
}

export function nonNegativeInteger(value: unknown, name: string): number {
  return integerAtLeast(value, 0, name);
}

export function positiveInteger(value: unknown, name: string): number {
  return integerAtLeast(value, 1, name);
}

export function boundedArray(
  value: unknown,
  max: number,
  name: string,
): unknown[] {
  const items = denseArray(value, name);
  if (items.length > max) {
    throw new TypeError(`${name} exceeds the ${max}-entry bound.`);
  }
  return items;
}

export function rejectForbiddenKeys(value: unknown, name: string): void {
  if (Array.isArray(value)) {
    const items = denseArray(value, name);
    for (let index = 0; index < items.length; index += 1) {
      rejectForbiddenKeys(items[index], `${name}[${index}]`);
    }
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const root = record(value, name);
  for (const key of Object.keys(root)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new TypeError(
        `${name}.${key} is a private credential, path, or command field and must not appear in the Buy contract.`,
      );
    }
    rejectForbiddenKeys(root[key], `${name}.${key}`);
  }
}

/**
 * Canonical serialized JSON used as `canonicalText`.
 *
 * Object keys are sorted recursively. Array order is significant. Non-finite
 * numbers, `undefined`, and non-plain objects are refused. This string is the
 * exact preimage of `fingerprint` and `byteCount`.
 */
export function canonicalJson(value: unknown, name: string): string {
  if (
    value === null || typeof value === "boolean" || typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${name} must contain only finite JSON numbers.`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = denseArray(value, name);
    return `[${
      items.map((item, index) => canonicalJson(item, `${name}[${index}]`))
        .join(",")
    }]`;
  }
  const root = record(value, name);
  const prototype = Object.getPrototypeOf(root);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${name} must contain only plain JSON objects.`);
  }
  const ownKeys = Reflect.ownKeys(root);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${name} must contain only string-keyed JSON objects.`);
  }
  const keys = (ownKeys as string[]).toSorted();
  const fields = keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(root, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${name}.${key} must be an enumerable JSON value.`);
    }
    if (descriptor.value === undefined) {
      throw new TypeError(`${name}.${key} must not be undefined.`);
    }
    return `${JSON.stringify(key)}:${
      canonicalJson(descriptor.value, `${name}.${key}`)
    }`;
  });
  return `{${fields.join(",")}}`;
}

export function utf8ByteCount(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export async function sha256HexOfUtf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digestBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256FingerprintOfUtf8(text: string): Promise<string> {
  return `sha256:${await sha256HexOfUtf8(text)}`;
}

export async function sha256Fingerprint(
  value: unknown,
  name: string,
): Promise<string> {
  return await sha256FingerprintOfUtf8(canonicalJson(value, name));
}

export function assertDigestAddress(
  uri: string,
  artifactFingerprint: string,
  expected: RegExp,
  name: string,
): void {
  const match = expected.exec(uri);
  if (!match || artifactFingerprint !== `sha256:${match[1]}`) {
    throw new TypeError(
      `${name} URI and fingerprint must identify the same bytes.`,
    );
  }
}

export function optionalOmitted<T>(
  present: boolean,
  parse: () => T,
): T | undefined {
  return present ? parse() : undefined;
}
