export interface DocumentPreviewField {
  key: string;
  value: string | number | boolean;
  arrayCount?: number;
}

// Keep the stable inline preview's order, flattening, and 12-value limit.
export function documentPreviewFieldsOf(
  document: Record<string, unknown>,
): DocumentPreviewField[] {
  if (document.doctype === "Company") return companyPreviewFieldsOf(document);
  const fields: DocumentPreviewField[] = [];
  for (const [key, value] of Object.entries(document)) {
    if (
      key.startsWith("_") || key === "refreshRequest" || key === "doctype" ||
      value == null
    ) continue;
    if (Array.isArray(value)) {
      fields.push({ key, value: value.length, arrayCount: value.length });
    } else if (typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (nestedValue != null && typeof nestedValue !== "object") {
          fields.push({
            key: `${key}.${nestedKey}`,
            value: String(nestedValue),
          });
        }
      }
    } else {
      fields.push({
        key,
        value: typeof value === "number" || typeof value === "boolean"
          ? value
          : String(value),
      });
    }
  }
  return fields.slice(0, 12);
}
import { companyPreviewFieldsOf } from "./company-preview.ts";
