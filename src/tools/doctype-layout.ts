/**
 * Mise en page des fiches, lue dans les métadonnées ERPNext.
 *
 * Chaque DocType marque déjà ses champs importants (`in_preview`, `bold`,
 * `in_list_view`, `title_field`) et ordonne ses champs par sections ou onglets.
 * `getdoctype` renvoie ces métadonnées avec les champs personnalisés. Le
 * résultat voyage vers la vue dans `_meta["io.casys/viewer"]._fieldLayout`,
 * jamais dans le texte lu par le modèle.
 */

import type { FrappeClient } from "../api/frappe-client.ts";
import type { Cache } from "../cache/types.ts";
import { getCache } from "../cache/cache.ts";

export interface DocTypeFieldLayoutSection {
  /** `null` : rupture de section sans libellé dans le DocType. */
  label: string | null;
  fields: string[];
}

export interface DocTypeFieldLayout {
  version: 1;
  /** Champs à montrer d'abord, dans l'ordre d'affichage. */
  preview: string[];
  /** Tous les champs de données, groupés par section ou onglet. */
  sections: DocTypeFieldLayoutSection[];
  /** `fieldname` vers libellé ERPNext. */
  labels: Record<string, string>;
}

export const DOCTYPE_LAYOUT_TTL_MS = 60 * 60 * 1000;
/** Un échec est mémorisé brièvement : pas d'aller-retour raté à chaque fiche. */
const FAILURE_TTL_MS = 60 * 1000;

const GETDOCTYPE_METHOD = "frappe.desk.form.load.getdoctype";

/** Pur affichage : aucune valeur propre. */
const VISUAL_TYPES = new Set([
  "Section Break",
  "Tab Break",
  "Column Break",
  "HTML",
  "Button",
  "Heading",
  "Fold",
  "Image",
]);
/** Lignes enfants : la vue les rend en tableaux, jamais en champs scalaires. */
const TABLE_TYPES = new Set(["Table", "Table MultiSelect"]);

interface MetaField {
  fieldname: string;
  fieldtype: string;
  label: string | null;
  preview: boolean;
  bold: boolean;
  inListView: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Frappe sérialise les cases à cocher en 0/1 ; une valeur personnalisée peut être "1". */
function isFlag(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

function metaFieldOf(value: unknown): MetaField | null {
  if (!isRecord(value)) return null;
  const fieldname = nonEmptyString(value.fieldname);
  const fieldtype = nonEmptyString(value.fieldtype);
  if (!fieldname || !fieldtype) return null;
  return {
    fieldname,
    fieldtype,
    label: nonEmptyString(value.label),
    preview: isFlag(value.in_preview),
    bold: isFlag(value.bold),
    inListView: isFlag(value.in_list_view),
  };
}

function isDataField(field: MetaField): boolean {
  return !VISUAL_TYPES.has(field.fieldtype) &&
    !TABLE_TYPES.has(field.fieldtype);
}

function previewOf(
  dataFields: readonly MetaField[],
  titleField: string | null,
): string[] {
  const flagged = dataFields.filter((field) => field.preview || field.bold);
  // Sans aucun indicateur, la vue liste du DocType est le meilleur résumé.
  const chosen = flagged.length > 0
    ? flagged
    : dataFields.filter((field) => field.inListView);
  return [
    ...new Set([
      ...(titleField ? [titleField] : []),
      ...chosen.map((field) => field.fieldname),
    ]),
  ];
}

function sectionsOf(
  fields: readonly MetaField[],
): DocTypeFieldLayoutSection[] {
  const sections: DocTypeFieldLayoutSection[] = [];
  let current: DocTypeFieldLayoutSection = { label: null, fields: [] };
  // Un onglet suivi d'une rupture de section sans libellé prête son nom au groupe.
  let tabOpen = false;
  const flush = () => {
    if (current.fields.length > 0) sections.push(current);
  };

  for (const field of fields) {
    if (field.fieldtype === "Tab Break") {
      flush();
      current = { label: field.label, fields: [] };
      tabOpen = true;
    } else if (field.fieldtype === "Section Break") {
      if (!(tabOpen && field.label === null)) {
        flush();
        current = { label: field.label, fields: [] };
      }
      tabOpen = false;
    } else if (isDataField(field)) {
      current.fields.push(field.fieldname);
      tabOpen = false;
    }
  }
  flush();
  return sections;
}

/**
 * Extrait la mise en page de la réponse `getdoctype`. `docs[0]` est le DocType
 * demandé ; Frappe y joint ses DocTypes enfants, ignorés ici.
 */
export function docTypeLayoutOf(response: unknown): DocTypeFieldLayout | null {
  if (!isRecord(response) || !Array.isArray(response.docs)) return null;
  const doctype = response.docs[0];
  if (!isRecord(doctype) || !Array.isArray(doctype.fields)) return null;

  const fields = doctype.fields.flatMap((raw) => {
    const field = metaFieldOf(raw);
    return field ? [field] : [];
  });
  const dataFields = fields.filter(isDataField);
  const labels: Record<string, string> = {};
  for (const field of dataFields) {
    if (field.label) labels[field.fieldname] = field.label;
  }

  return {
    version: 1,
    preview: previewOf(dataFields, nonEmptyString(doctype.title_field)),
    sections: sectionsOf(fields),
    labels,
  };
}

export interface FetchDocTypeLayoutOptions {
  cache?: Cache;
  /** Trace d'un échec non fatal (stderr par défaut : stdout est le canal MCP). */
  log?: (message: string) => void;
}

function logToStderr(message: string): void {
  console.error(`[mcp-erpnext] ${message}`);
}

/**
 * Lit la mise en page d'un DocType (cache d'une heure par DocType).
 *
 * Fail-soft par contrat : la mise en page est un confort de lecture. Une
 * erreur (permission, 404, réseau) renvoie `null` et ne fait jamais échouer
 * l'outil qui l'attache.
 */
export async function fetchDocTypeLayout(
  client: FrappeClient,
  doctype: string,
  options: FetchDocTypeLayoutOptions = {},
): Promise<DocTypeFieldLayout | null> {
  const cache = options.cache ?? getCache();
  const key = `doctype-layout:${doctype}`;
  const cached = cache.get<DocTypeFieldLayout | null>(key);
  if (cached !== undefined) return cached;

  try {
    const response = await client.callMethodRaw(
      GETDOCTYPE_METHOD,
      { doctype },
      "GET",
    );
    const layout = docTypeLayoutOf(response);
    if (!layout) throw new Error("unreadable getdoctype response");
    cache.set(key, layout, DOCTYPE_LAYOUT_TTL_MS);
    return layout;
  } catch (error) {
    (options.log ?? logToStderr)(
      `DocType layout unavailable for "${doctype}" (non-fatal): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    cache.set(key, null, FAILURE_TTL_MS);
    return null;
  }
}
