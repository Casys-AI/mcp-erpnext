import type {
  DocumentFieldLayout,
  DocumentFieldModel,
  DocumentSectionModel,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fieldNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((item): item is string =>
        typeof item === "string" && item.length > 0
      ),
    ),
  ];
}

/**
 * Lit `_fieldLayout` (version 1). Une charge d'une autre version ou sans
 * `preview` / `sections` est ignorée : la fiche garde alors son rendu actuel.
 */
export function fieldLayoutOf(value: unknown): DocumentFieldLayout | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (!Array.isArray(value.preview) || !Array.isArray(value.sections)) {
    return undefined;
  }

  const sections = value.sections.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const fields = fieldNames(entry.fields);
    if (fields.length === 0) return [];
    const label = typeof entry.label === "string" && entry.label.trim()
      ? entry.label
      : null;
    return [{ label, fields }];
  });
  const labels: Record<string, string> = {};
  if (isRecord(value.labels)) {
    for (const [key, label] of Object.entries(value.labels)) {
      if (typeof label === "string" && label.trim()) labels[key] = label;
    }
  }
  return { preview: fieldNames(value.preview), sections, labels };
}

/** Libellé ERPNext d'un champ, s'il en a un (clé propre : jamais le prototype). */
export function layoutLabelOf(
  layout: DocumentFieldLayout | undefined,
  key: string,
): string | undefined {
  return layout && Object.hasOwn(layout.labels, key)
    ? layout.labels[key]
    : undefined;
}

/**
 * Répartit les champs scalaires d'une fiche selon la mise en page : l'aperçu
 * dans l'ordre de `preview`, puis le reste par section. Un champ sans valeur
 * n'est affiché nulle part ; un champ que la mise en page ignore (champ
 * personnalisé arrivé depuis) clôt la liste dans un groupe sans titre.
 */
export function layoutScalarFields(
  scalars: readonly DocumentFieldModel[],
  layout: DocumentFieldLayout,
): { fields: DocumentFieldModel[]; sections: DocumentSectionModel[] } {
  const present = new Map(
    scalars.filter((field) => field.kind !== "empty").map((
      field,
    ) => [field.key, field]),
  );
  const placed = new Set<string>();
  const take = (keys: readonly string[]): DocumentFieldModel[] =>
    keys.flatMap((key) => {
      const field = present.get(key);
      if (!field || placed.has(key)) return [];
      placed.add(key);
      return [field];
    });

  const fields = take(layout.preview);
  const sections: DocumentSectionModel[] = [];
  layout.sections.forEach((section, index) => {
    const members = take(section.fields);
    if (members.length > 0) {
      sections.push({
        key: `section-${index}`,
        label: section.label,
        fields: members,
      });
    }
  });
  const rest = [...present.values()].filter((field) => !placed.has(field.key));
  if (rest.length > 0) {
    sections.push({ key: "section-other", label: null, fields: rest });
  }
  return { fields, sections };
}
