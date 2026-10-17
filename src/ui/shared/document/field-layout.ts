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
 * Répartit les champs d'une fiche selon la mise en page : l'aperçu dans
 * l'ordre de `preview`, puis le reste par section. Un champ sans valeur n'est
 * affiché nulle part. Un champ long d'aperçu reste un champ long à part
 * entière (`longFields`) ; les autres se replient dans leur section. Un champ
 * que la mise en page ignore (champ personnalisé arrivé depuis) clôt la liste
 * dans un groupe sans titre.
 */
export function layoutDocumentFields(
  candidates: {
    scalars: readonly DocumentFieldModel[];
    longFields?: readonly DocumentFieldModel[];
  },
  layout: DocumentFieldLayout,
): {
  fields: DocumentFieldModel[];
  longFields: DocumentFieldModel[];
  sections: DocumentSectionModel[];
} {
  const withValue = (fields: readonly DocumentFieldModel[] = []) =>
    new Map(
      fields.filter((field) => field.kind !== "empty").map((
        field,
      ) => [field.key, field]),
    );
  const scalars = withValue(candidates.scalars);
  const longs = withValue(candidates.longFields);
  const placed = new Set<string>();
  const take = (
    from: Map<string, DocumentFieldModel>,
    keys: readonly string[],
  ): DocumentFieldModel[] =>
    keys.flatMap((key) => {
      const field = from.get(key);
      if (!field || placed.has(key)) return [];
      placed.add(key);
      return [field];
    });

  const fields = take(scalars, layout.preview);
  const longFields = take(longs, layout.preview);
  const sections: DocumentSectionModel[] = [];
  layout.sections.forEach((section, index) => {
    const members = take(scalars, section.fields);
    const longMembers = take(longs, section.fields);
    if (members.length > 0 || longMembers.length > 0) {
      sections.push({
        key: `section-${index}`,
        label: section.label,
        fields: members,
        longFields: longMembers,
      });
    }
  });
  const rest = [...scalars.values()].filter((field) => !placed.has(field.key));
  const longRest = [...longs.values()].filter((field) =>
    !placed.has(field.key)
  );
  if (rest.length > 0 || longRest.length > 0) {
    sections.push({
      key: "section-other",
      label: null,
      fields: rest,
      longFields: longRest,
    });
  }
  return { fields, longFields, sections };
}
