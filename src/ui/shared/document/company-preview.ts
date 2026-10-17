import type { DocumentPreviewField } from "./preview-fields.ts";

const COMPANY_IDENTITY_FIELDS = [
  "abbr",
  "country",
  "default_currency",
  "domain",
] as const;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function groupValueOf(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === "0") return false;
  if (value === 1 || value === "1") return true;
  return undefined;
}

export function companyPreviewFieldsOf(
  document: Readonly<Record<string, unknown>>,
): DocumentPreviewField[] {
  const fields: DocumentPreviewField[] = [];
  const name = nonEmptyString(document.company_name) ??
    nonEmptyString(document.name);
  if (name !== undefined) fields.push({ key: "company_name", value: name });

  for (const key of COMPANY_IDENTITY_FIELDS) {
    const value = nonEmptyString(document[key]);
    if (value !== undefined) fields.push({ key, value });
  }

  const isGroup = groupValueOf(document.is_group);
  if (isGroup !== undefined) fields.push({ key: "is_group", value: isGroup });
  return fields;
}
