import type { DocumentFieldModel } from "./types.ts";

export interface NativeDocTypeField {
  fieldname: string;
  fieldtype: string;
  label?: string;
}

export interface CompanyFieldSection {
  key: string;
  label: string;
  fields: readonly DocumentFieldModel[];
}

export interface CompanySections {
  general: readonly DocumentFieldModel[];
  sections: readonly CompanyFieldSection[];
  schemaAvailable: boolean;
}

const GENERAL_FIELDS = new Set([
  "company_name",
  "abbr",
  "default_currency",
  "country",
  "domain",
  "is_group",
]);
const BREAK_TYPES = new Set(["Section Break", "Tab Break", "Column Break"]);

export function nativeDocTypeFieldsOf(
  value: unknown,
): readonly NativeDocTypeField[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const fields: NativeDocTypeField[] = [];
  const names = new Set<string>();
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    const field = raw as Record<string, unknown>;
    if (
      typeof field.fieldname !== "string" || !field.fieldname.trim() ||
      typeof field.fieldtype !== "string" || !field.fieldtype.trim() ||
      names.has(field.fieldname) ||
      (field.label !== undefined && field.label !== null &&
        typeof field.label !== "string")
    ) return undefined;
    names.add(field.fieldname);
    fields.push({
      fieldname: field.fieldname,
      fieldtype: field.fieldtype,
      ...(typeof field.label === "string" ? { label: field.label } : {}),
    });
  }
  return fields.some((field) => !BREAK_TYPES.has(field.fieldtype))
    ? fields
    : undefined;
}

export function companySectionsOf(
  fields: readonly DocumentFieldModel[],
  schemaFields?: readonly NativeDocTypeField[],
): CompanySections {
  const schema = nativeDocTypeFieldsOf(schemaFields);
  if (!schema) {
    const general = fields.filter((field) => GENERAL_FIELDS.has(field.key));
    const other = fields.filter((field) => !GENERAL_FIELDS.has(field.key));
    return {
      general,
      sections: other.length
        ? [{ key: "other", label: "", fields: other }]
        : [],
      schemaAvailable: false,
    };
  }

  const sections: CompanyFieldSection[] = [];
  const assignments = new Map<string, { section: number; order: number }>();
  let section = -1;
  let seenDataField = false;
  let tabLabel = "";

  for (const [order, field] of schema.entries()) {
    if (field.fieldtype === "Column Break") continue;
    if (
      field.fieldtype === "Section Break" || field.fieldtype === "Tab Break"
    ) {
      if (field.fieldtype === "Tab Break") tabLabel = field.label ?? "";
      if (!seenDataField) continue;
      const label = field.label ??
        (field.fieldtype === "Section Break" ? tabLabel : "");
      section = sections.length;
      sections.push({ key: `native:${field.fieldname}`, label, fields: [] });
      continue;
    }
    seenDataField = true;
    assignments.set(field.fieldname, { section, order });
  }

  const general: DocumentFieldModel[] = [];
  const grouped = sections.map(() => [] as DocumentFieldModel[]);
  const other: DocumentFieldModel[] = [];
  for (const field of fields) {
    const assignment = assignments.get(field.key);
    if (GENERAL_FIELDS.has(field.key)) general.push(field);
    else if (!assignment || assignment.section === -1) other.push(field);
    else grouped[assignment.section].push(field);
  }
  const nativeOrder = (left: DocumentFieldModel, right: DocumentFieldModel) =>
    (assignments.get(left.key)?.order ?? Number.MAX_SAFE_INTEGER) -
    (assignments.get(right.key)?.order ?? Number.MAX_SAFE_INTEGER);
  general.sort(nativeOrder);

  return {
    general,
    sections: [
      ...sections.flatMap((group, index) =>
        grouped[index].length
          ? [{ ...group, fields: grouped[index].sort(nativeOrder) }]
          : []
      ),
      ...(other.length ? [{ key: "other", label: "", fields: other }] : []),
    ],
    schemaAvailable: true,
  };
}
