/** @jsxImportSource preact */
/**
 * Panneau de détail de carte kanban — Direction B v2.
 *
 * Aucun import de @casys/mcp-view : les primitives viennent de ~/shared/ui.
 */
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  Button,
  CONTROL_CLASS,
  CONTROL_MONO_CLASS,
  cx,
  DetailSection,
  DetailSheet,
  Field,
  RANGE_CLASS,
  SELECT_CLASS,
  SelectShell,
  SheetActions,
  StateMessage,
} from "~/shared/ui";
import type { KanbanBoardData, KanbanCardData } from "~/shared/kanban/types";
import type { CardDetailState } from "~/shared/kanban/state";
import { getAvailableTargets } from "./KanbanViewer";
import { LocalActionButton } from "./LocalActionButton";
import { useT } from "~/shared/i18n-hook";
import type { TFunction } from "~/shared/i18n-hook";
import { hintLabel, type NavHint } from "~/shared/jumps";

const DETAIL_SKIP_FIELDS = new Set([
  "doctype",
  "docstatus",
  "idx",
  "modified_by",
  "owner",
  "creation",
  "modified",
  "_user_tags",
  "_comments",
  "_assign",
  "_liked_by",
  "_seen",
  "__last_sync_on",
  "lft",
  "rgt",
  "old_parent",
  "is_group",
  "is_template",
  "depends_on_tasks",
  "depends_on",
]);

const READONLY_FIELDS = new Set([
  "name",
  "status",
  "workflow_state",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "ID",
  subject: "sujet",
  status: "statut",
  priority: "priorité",
  project: "projet",
  progress: "progression",
  description: "description",
  exp_start_date: "date de début",
  exp_end_date: "date d'échéance",
  expected_time: "estimé (h)",
  actual_time: "temps réel (h)",
  is_milestone: "jalon",
  task_weight: "poids",
  total_costing_amount: "coût",
  total_billing_amount: "facturation",
  start: "début",
  duration: "durée",
  title: "titre",
  opportunity_from: "type de source",
  party_name: "partie",
  opportunity_amount: "montant",
  currency: "devise",
  probability: "probabilité (%)",
  opportunity_owner: "responsable",
  expected_closing: "clôture prévue",
  transaction_date: "date de création",
  contact_person: "contact",
  source: "source",
  customer: "client",
  raised_by: "créé par",
  resolution_by: "délai SLA",
  opening_date: "ouverture",
  resolution_date: "résolution",
  first_responded_on: "première réponse",
};

const BOOLEAN_FIELDS = new Set(["is_milestone", "is_group", "is_template"]);

const DATE_FIELDS = new Set([
  "exp_start_date",
  "exp_end_date",
  "expected_closing",
  "transaction_date",
  "opening_date",
  "resolution_date",
  "resolution_by",
  "first_responded_on",
]);

/* Les valeurs restent les chaînes ERPNext ; seules les étiquettes sont traduites. */
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  priority: [
    { value: "Low", label: "Faible" },
    { value: "Medium", label: "Moyen" },
    { value: "High", label: "Élevé" },
    { value: "Urgent", label: "Urgent" },
  ],
  opportunity_from: [
    { value: "Lead", label: "Prospect" },
    { value: "Customer", label: "Client" },
  ],
};

const HEADER_FIELDS = new Set([
  "name",
  "status",
  "priority",
  "subject",
  "title",
  "project",
]);
const SPECIAL_FIELDS = new Set(["progress", "is_milestone"]);
const DESCRIPTION_FIELD_NAMES = new Set([
  "description",
  "resolution_details",
  "notes",
]);

const FIELD_SECTIONS: Array<{ id: string; label: string; fields: string[] }> = [
  {
    id: "dates",
    label: "Dates",
    fields: [
      "exp_start_date",
      "exp_end_date",
      "expected_closing",
      "transaction_date",
      "opening_date",
      "resolution_date",
      "resolution_by",
      "first_responded_on",
      "start",
    ],
  },
  {
    id: "time",
    label: "Time Tracking",
    fields: ["expected_time", "actual_time", "duration"],
  },
  {
    id: "financial",
    label: "Financial",
    fields: [
      "opportunity_amount",
      "currency",
      "probability",
      "total_costing_amount",
      "total_billing_amount",
      "task_weight",
    ],
  },
  {
    id: "people",
    label: "People",
    fields: [
      "project",
      "opportunity_owner",
      "customer",
      "party_name",
      "contact_person",
      "raised_by",
      "source",
      "opportunity_from",
    ],
  },
];

interface ClassifiedField {
  key: string;
  value: unknown;
}

interface ClassifiedSection {
  id: string;
  label: string;
  fields: ClassifiedField[];
}

interface ClassifiedFields {
  titleField: ClassifiedField | null;
  idValue: string | null;
  statusValue: string | null;
  priorityValue: string | null;
  projectValue: string | null;
  progressValue: number | null;
  milestoneValue: number | null;
  descriptionField: ClassifiedField | null;
  sections: ClassifiedSection[];
}

function fieldLabel(key: string, t: TFunction): string {
  /* Mono minuscule — pas de capitalisation automatique. */
  const catalogKey = `kanban.field.${key}`;
  const translated = t(catalogKey);
  return translated !== catalogKey
    ? translated
    : (FIELD_LABELS[key] ?? key.replace(/_/g, " "));
}

function isDescriptionField(key: string): boolean {
  return DESCRIPTION_FIELD_NAMES.has(key);
}

function getFieldType(
  key: string,
  value: unknown,
): "boolean" | "date" | "select" | "number" | "textarea" | "text" {
  if (BOOLEAN_FIELDS.has(key)) return "boolean";
  if (DATE_FIELDS.has(key)) return "date";
  if (key in SELECT_OPTIONS) return "select";
  if (isDescriptionField(key)) return "textarea";
  if (typeof value === "number") return "number";
  return "text";
}

function classifyFields(detail: Record<string, unknown>): ClassifiedFields {
  const entries = Object.entries(detail).filter(
    ([key, value]) =>
      !DETAIL_SKIP_FIELDS.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value !== "object",
  );

  const entryMap = new Map(entries);
  const classified = new Set<string>();

  const titleField = entries.find(([k]) => k === "subject" || k === "title");
  const idValue = entryMap.has("name") ? String(entryMap.get("name")) : null;
  const statusValue = entryMap.has("status")
    ? String(entryMap.get("status"))
    : null;
  const priorityValue = entryMap.has("priority")
    ? String(entryMap.get("priority"))
    : null;
  const projectValue = entryMap.has("project")
    ? String(entryMap.get("project"))
    : null;
  const progressValue = entryMap.has("progress")
    ? Number(entryMap.get("progress"))
    : null;
  const milestoneValue = entryMap.has("is_milestone")
    ? Number(entryMap.get("is_milestone"))
    : null;

  for (const k of HEADER_FIELDS) classified.add(k);
  for (const k of SPECIAL_FIELDS) classified.add(k);

  const descEntry = entries.find(([k]) => DESCRIPTION_FIELD_NAMES.has(k));
  const descriptionField = descEntry
    ? { key: descEntry[0], value: descEntry[1] }
    : null;
  if (descEntry) classified.add(descEntry[0]);

  const sections: ClassifiedSection[] = [];
  for (const section of FIELD_SECTIONS) {
    const fields: ClassifiedField[] = [];
    for (const fieldName of section.fields) {
      if (entryMap.has(fieldName) && !classified.has(fieldName)) {
        fields.push({ key: fieldName, value: entryMap.get(fieldName)! });
        classified.add(fieldName);
      }
    }
    if (fields.length > 0) {
      sections.push({ id: section.id, label: section.label, fields });
    }
  }

  const remaining: ClassifiedField[] = [];
  for (const [key, value] of entries) {
    if (!classified.has(key)) {
      remaining.push({ key, value });
    }
  }
  if (remaining.length > 0) {
    sections.push({ id: "details", label: "Details", fields: remaining });
  }

  return {
    titleField: titleField
      ? { key: titleField[0], value: titleField[1] }
      : null,
    idValue,
    statusValue,
    priorityValue,
    projectValue,
    progressValue,
    milestoneValue,
    descriptionField,
    sections,
  };
}

/* ── Primitives locales ──────────────────────────────────────────── */

/** Badge chip de métadonnée (identifiant, statut, feedback). */
function Badge(
  { children, tone }: {
    children: preact.ComponentChildren;
    tone?: string;
  },
) {
  const toneClass = tone === "danger"
    ? "bg-bad/10 dark:bg-bad/14 text-bad border-bad/20"
    : tone === "success"
    ? "bg-ok/10 dark:bg-ok/14 text-ok border-ok/20"
    : tone === "warning"
    ? "bg-warn/10 dark:bg-warn/14 text-warn-text border-warn/20"
    : tone === "info"
    ? "bg-accent/10 dark:bg-accent/14 text-accent border-accent-edge"
    : "bg-count border-line text-ink-muted";

  return (
    <span
      class={cx(
        "inline-flex items-center gap-1 rounded-badge border px-[7px] py-0.5",
        "font-mono text-chip",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

/* ── Contrôle de champ générique ─────────────────────────────────── */

function fieldControl(
  fieldKey: string,
  value: unknown,
  editedFields: Record<string, string>,
  onFieldChange: (key: string, value: string) => void,
  t: TFunction,
): JSX.Element {
  const isReadonly = READONLY_FIELDS.has(fieldKey);
  const isEdited = fieldKey in editedFields;
  const displayValue = isEdited ? editedFields[fieldKey] : String(value);
  const type = getFieldType(fieldKey, value);

  if (isReadonly) {
    return <span class="text-data text-ink-2">{String(value)}</span>;
  }

  switch (type) {
    case "boolean": {
      const checked = isEdited ? displayValue === "1" : value === 1;
      return (
        <button
          type="button"
          aria-pressed={checked}
          class={cx(
            "rounded-control border px-3 py-[5px] font-mono text-chip transition-colors",
            checked
              ? "bg-accent/14 border-accent-edge text-accent"
              : "bg-control border-line text-ink-muted hover:text-ink",
          )}
          onClick={() => {
            const current = isEdited ? displayValue === "1" : value === 1;
            onFieldChange(fieldKey, current ? "0" : "1");
          }}
        >
          {checked ? t("kanban.modal.bool.yes") : t("kanban.modal.bool.no")}
        </button>
      );
    }
    case "select":
      return (
        <SelectShell>
          <select
            class={SELECT_CLASS}
            value={displayValue}
            onChange={(e) =>
              onFieldChange(
                fieldKey,
                (e.currentTarget as HTMLSelectElement).value,
              )}
          >
            {SELECT_OPTIONS[fieldKey]?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(`kanban.select.${fieldKey}.${opt.value}`)}
              </option>
            ))}
          </select>
        </SelectShell>
      );
    case "date":
      return (
        <input
          class={CONTROL_MONO_CLASS}
          type="date"
          value={displayValue}
          onInput={(e) =>
            onFieldChange(
              fieldKey,
              (e.currentTarget as HTMLInputElement).value,
            )}
        />
      );
    case "number":
      return (
        <input
          class={CONTROL_MONO_CLASS}
          type="number"
          value={displayValue}
          onInput={(e) =>
            onFieldChange(
              fieldKey,
              (e.currentTarget as HTMLInputElement).value,
            )}
        />
      );
    default:
      return (
        <input
          class={CONTROL_CLASS}
          type="text"
          value={displayValue}
          onInput={(e) =>
            onFieldChange(
              fieldKey,
              (e.currentTarget as HTMLInputElement).value,
            )}
        />
      );
  }
}

/* ── Assignés ────────────────────────────────────────────────────── */

export type AssignableUser = { name: string; full_name?: string };

function parseAssignees(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch (error) {
    console.warn("[parseAssignees] Could not parse _assign:", error, value);
    return [];
  }
}

function AssigneesSection({
  assignees,
  onAssign,
  onUnassign,
  onLoadUsers,
}: {
  assignees: string[];
  onAssign: (assignTo: string) => Promise<void>;
  onUnassign?: (assignee: string) => Promise<void>;
  onLoadUsers: () => Promise<AssignableUser[]>;
}) {
  const t = useT();
  const [users, setUsers] = useState<AssignableUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    onLoadUsers()
      .then((loaded) => {
        if (!cancelled) setUsers(loaded);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : t("kanban.assignees.error.load_users"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = (users ?? []).filter(
    (user) => !assignees.includes(user.name),
  );

  async function handleAssign() {
    if (!selected || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await onAssign(selected);
      setSelected("");
    } catch (error) {
      setAssignError(
        error instanceof Error
          ? error.message
          : t("kanban.assignees.error.assign"),
      );
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(assignee: string) {
    if (!onUnassign || removing) return;
    setRemoving(assignee);
    setAssignError(null);
    try {
      await onUnassign(assignee);
    } catch (error) {
      setAssignError(
        error instanceof Error
          ? error.message
          : t("kanban.assignees.error.unassign"),
      );
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div class="flex flex-col gap-2.5">
      <div
        class="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("kanban.modal.section.assignees")}
      >
        {assignees.length === 0 && (
          <span class="text-data text-ink-muted italic">
            {t("common.no_assignee")}
          </span>
        )}
        {assignees.map((email) => (
          <Badge key={email} tone="info">
            {email}
            {onUnassign && (
              <button
                type="button"
                aria-label={t("kanban.assignees.remove_aria", { email })}
                title={t("kanban.assignees.remove_aria", { email })}
                disabled={removing !== null}
                class="ml-1 text-chip text-accent hover:text-bad transition-colors disabled:opacity-50"
                onClick={() => void handleUnassign(email)}
              >
                {removing === email ? "…" : "×"}
              </button>
            )}
          </Badge>
        ))}
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <SelectShell>
          <select
            aria-label={t("kanban.assignees.select_label")}
            class={cx(SELECT_CLASS, "w-auto")}
            value={selected}
            onChange={(e) =>
              setSelected((e.currentTarget as HTMLSelectElement).value)}
            disabled={assigning || (users === null && !loadError)}
          >
            <option value="">
              {users === null
                ? (loadError
                  ? t("kanban.assignees.placeholder_error")
                  : t("common.loading"))
                : t("kanban.assignees.placeholder_select")}
            </option>
            {options.map((user) => (
              <option key={user.name} value={user.name}>
                {user.full_name
                  ? `${user.full_name} (${user.name})`
                  : user.name}
              </option>
            ))}
          </select>
        </SelectShell>
        {selected && (
          <Button
            disabled={assigning}
            onClick={() => void handleAssign()}
          >
            {assigning
              ? t("kanban.assignees.assigning")
              : t("kanban.assignees.assign_btn")}
          </Button>
        )}
      </div>
      {(assignError ?? loadError) && (
        /* Erreur inline : des données sont déjà affichées — pas de StateMessage tone="bad". */
        <p class="border-l-2 border-bad pl-2.5 text-chip text-bad">
          {assignError ?? loadError}
        </p>
      )}
    </div>
  );
}

/* ── CardDetailModal ──────────────────────────────────────────────── */

export function CardDetailModal({
  detail,
  board,
  onClose,
  onMove,
  onSave,
  onAssign,
  onUnassign,
  onLoadUsers,
  onNavigate,
  hints,
  onJump,
}: {
  detail: CardDetailState;
  board: KanbanBoardData;
  onClose: () => void;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onSave?: (
    doctype: string,
    name: string,
    data: Record<string, string>,
  ) => void;
  onAssign?: (
    doctype: string,
    name: string,
    assignTo: string,
  ) => Promise<void>;
  onUnassign?: (
    doctype: string,
    name: string,
    assignee: string,
  ) => Promise<void>;
  onLoadUsers?: () => Promise<AssignableUser[]>;
  onNavigate?: (message: string) => void;
  /**
   * Hints de navigation du tableau (issus de `_sendMessageHints`).
   * Présents uniquement quand l'hôte relaie les outils serveur.
   */
  hints?: NavHint[];
  /**
   * Déclenche un saut de navigation dans la pile — disponible uniquement quand
   * `hints` est fourni. La popin reste dans l'état du niveau ; le saut empile un niveau plein cadre.
   */
  onJump?: (hint: NavHint, cardId: string) => void;
}) {
  const t = useT();
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<
    { text: string; isError: boolean } | null
  >(null);

  useEffect(() => {
    setEditedFields({});
    setSaveMessage(null);
  }, [detail.selectedCardId]);

  if (!detail.selectedCardId) return null;

  const selectedCardId = detail.selectedCardId;
  const card = board.cards.find((c) => c.id === detail.selectedCardId);
  const cardTitle = card?.title ?? detail.selectedCardId;
  const availableTargets = card
    ? getAvailableTargets(board, card.columnId)
    : [];
  const hasEdits = Object.keys(editedFields).length > 0;

  function handleFieldChange(key: string, value: string) {
    setEditedFields((prev) => {
      const original = detail.cardDetail
        ? String(detail.cardDetail[key] ?? "")
        : "";
      if (value === original) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
    setSaveMessage(null);
  }

  async function handleSave() {
    if (!hasEdits || !onSave || !detail.selectedCardId) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await onSave(board.doctype, detail.selectedCardId, editedFields);
      setSaveMessage({ text: t("kanban.modal.saved"), isError: false });
      setEditedFields({});
    } catch (error) {
      setSaveMessage({
        text: error instanceof Error
          ? error.message
          : t("kanban.modal.save_error"),
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  const classified = detail.cardDetail
    ? classifyFields(detail.cardDetail)
    : null;

  const milestoneOn = classified
    ? (editedFields.is_milestone !== undefined
      ? editedFields.is_milestone === "1"
      : classified.milestoneValue === 1)
    : false;

  /* Titre affiché dans l'en-tête : reflète la valeur en cours d'édition. */
  const titleKey = classified?.titleField?.key;
  const titleOriginal = classified?.titleField
    ? String(classified.titleField.value)
    : cardTitle;
  const sheetTitle = titleKey && editedFields[titleKey] !== undefined
    ? editedFields[titleKey]
    : titleOriginal;

  /* Progression actuelle (editée ou originale). */
  const currentProgress = classified?.progressValue !== null
    ? (editedFields.progress !== undefined
      ? Number(editedFields.progress)
      : (classified?.progressValue ?? 0))
    : 0;

  /*
   * Pied de modale en deux rangées SheetActions :
   * - Rangée 1 : Enregistrer / Annuler / badge feedback (action qui engage le document)
   * - Rangée 2 : Déplacer vers + boutons colonnes + liens de navigation
   * SheetActions gère le filet via first:border-t-0.
   */
  // Quand onJump est fourni (outils relayés) ET que le tableau a des hints,
  // les boutons de navigation deviennent des sauts dans la pile.
  // Sinon, on conserve les boutons sendMessage existants (fallback).
  const hasJumpNav = !!onJump && (hints?.length ?? 0) > 0 &&
    !!detail.selectedCardId;
  // Les boutons d'origine restent : un saut s'ajoute, il ne remplace pas
  // ce qui n'a pas d'équivalent dans les hints du serveur.
  const hasSendMessageNav = !!onNavigate && !!detail.selectedCardId;
  // Un bouton d'origine s'efface quand un saut porte la même clé : pas de doublon.
  const jumpKeys = new Set(
    (hasJumpNav ? hints! : []).map((hint) => hint.key).filter(Boolean),
  );
  const hasSecondaryRow = (!!card && availableTargets.length > 0) ||
    hasJumpNav || hasSendMessageNav;

  const footer = (
    <>
      {onSave && detail.cardDetail && (
        <SheetActions>
          <Button
            variant="accent"
            disabled={!hasEdits || saving}
            onClick={() => void handleSave()}
          >
            {saving ? t("kanban.modal.saving") : t("kanban.modal.save")}
          </Button>
          {hasEdits && (
            <Button
              variant="quiet"
              onClick={() => {
                setEditedFields({});
                setSaveMessage(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          )}
          {saveMessage && (
            <Badge tone={saveMessage.isError ? "danger" : "success"}>
              {saveMessage.text}
            </Badge>
          )}
        </SheetActions>
      )}

      {hasSecondaryRow && (
        <SheetActions
          label={card && availableTargets.length > 0
            ? t("kanban.modal.move_to")
            : undefined}
        >
          {card && availableTargets.length > 0 &&
            availableTargets.map((target) => (
              <Button
                key={target.columnId}
                variant="secondary"
                onClick={() => {
                  onMove(card, target.columnId, target.label);
                  onClose();
                }}
              >
                {target.color && (
                  <span
                    aria-hidden="true"
                    class="inline-block mr-1.5 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      /* Couleur de colonne issue des données — seul cas légitime de style inline pour une couleur. */
                      background: target.color,
                    }}
                  />
                )}
                {target.label}
              </Button>
            ))}
          {/* « Aller à » : les sauts, puis les phrases — sur leur propre ligne, distincts du déplacement */}
          {(hasJumpNav || hasSendMessageNav) && (
            <span class="mt-1 basis-full font-mono text-[10px] uppercase tracking-[0.09em] text-ink-faint">
              {t("nav.goto")}
            </span>
          )}
          {hasJumpNav && hints!.map((hint) => (
            <LocalActionButton
              key={hint.key ?? hint.label}
              label={`${hintLabel(hint)} ›`}
              variant="info"
              onClick={() => onJump!(hint, detail.selectedCardId!)}
            />
          ))}
          {/* Boutons sendMessage — comportement d'origine, sans outils */}
          {hasSendMessageNav && (
            <>
              <LocalActionButton
                label={t("kanban.modal.nav.view_list")}
                variant="info"
                onClick={() =>
                  onNavigate!(
                    t("kanban.nav.view_list.message", {
                      doctype: board.doctype,
                      id: detail.selectedCardId,
                    }),
                  )}
              />
              {board.doctype === "Task" && !jumpKeys.has("timesheets") && (
                <LocalActionButton
                  label={t("kanban.modal.nav.timesheets")}
                  variant="info"
                  onClick={() =>
                    onNavigate!(
                      t("kanban.nav.timesheets.message", {
                        id: detail.selectedCardId,
                      }),
                    )}
                />
              )}
              {board.doctype === "Opportunity" && !jumpKeys.has("quotations") &&
                (
                  <LocalActionButton
                    label={t("kanban.modal.nav.quotations")}
                    variant="info"
                    onClick={() =>
                      onNavigate!(
                        t("kanban.nav.quotations.message", {
                          id: detail.selectedCardId,
                        }),
                      )}
                  />
                )}
              {board.doctype === "Issue" && !jumpKeys.has("tasks") && (
                <LocalActionButton
                  label={t("kanban.modal.nav.related_tasks")}
                  variant="info"
                  onClick={() =>
                    onNavigate!(
                      t("kanban.nav.tasks.message", {
                        id: detail.selectedCardId,
                      }),
                    )}
                />
              )}
            </>
          )}
        </SheetActions>
      )}
    </>
  );

  return (
    <DetailSheet
      title={sheetTitle}
      eyebrow={classified?.idValue ?? selectedCardId}
      onClose={onClose}
      footer={footer}
    >
      {/* ── États de chargement / erreur ── */}
      {detail.detailLoading && (
        <StateMessage>{t("common.loading")}</StateMessage>
      )}
      {detail.detailError && (
        <StateMessage tone="bad">{detail.detailError}</StateMessage>
      )}

      {classified && (
        <>
          {/* ── Général : titre, statut, priorité, projet, jalon ── */}
          <DetailSection label={t("kanban.modal.section.general")}>
            {/* Titre éditable — l'identifiant est dans l'eyebrow de DetailSheet. */}
            {classified.titleField && (
              <Field label={fieldLabel(classified.titleField.key, t)}>
                <input
                  type="text"
                  class={CONTROL_CLASS}
                  value={editedFields[classified.titleField.key] ??
                    String(classified.titleField.value)}
                  onInput={(e) =>
                    handleFieldChange(
                      classified.titleField!.key,
                      (e.currentTarget as HTMLInputElement).value,
                    )}
                />
              </Field>
            )}

            {classified.statusValue && (
              <Field label={t("kanban.field.status")}>
                <span class="text-data text-ink-2">
                  {classified.statusValue}
                </span>
              </Field>
            )}

            {classified.priorityValue !== null &&
              classified.priorityValue !== undefined && (
              <Field label={t("kanban.field.priority")}>
                <SelectShell>
                  <select
                    class={SELECT_CLASS}
                    value={editedFields.priority ?? classified.priorityValue}
                    onChange={(e) =>
                      handleFieldChange(
                        "priority",
                        (e.currentTarget as HTMLSelectElement).value,
                      )}
                  >
                    {SELECT_OPTIONS.priority.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(`kanban.select.priority.${opt.value}`)}
                      </option>
                    ))}
                  </select>
                </SelectShell>
              </Field>
            )}

            {classified.projectValue !== null &&
              classified.projectValue !== undefined && (
              <Field label={t("kanban.field.project")}>
                <input
                  type="text"
                  class={CONTROL_CLASS}
                  value={editedFields.project ?? classified.projectValue}
                  onInput={(e) =>
                    handleFieldChange(
                      "project",
                      (e.currentTarget as HTMLInputElement).value,
                    )}
                />
              </Field>
            )}

            {classified.milestoneValue !== null &&
              classified.milestoneValue !== undefined && (
              <Field label={t("kanban.field.is_milestone")}>
                <button
                  type="button"
                  aria-pressed={milestoneOn}
                  title={milestoneOn
                    ? t("kanban.modal.milestone.remove_title")
                    : t("kanban.modal.milestone.set_title")}
                  class={cx(
                    "self-start rounded-control border px-3 py-[5px] font-mono text-chip transition-colors",
                    milestoneOn
                      ? "bg-brand/12 dark:bg-brand/16 border-accent-edge text-brand-text"
                      : "bg-control border-line text-ink-muted hover:text-ink",
                  )}
                  onClick={() =>
                    handleFieldChange("is_milestone", milestoneOn ? "0" : "1")}
                >
                  {milestoneOn
                    ? t("kanban.modal.bool.yes")
                    : t("kanban.modal.bool.no")}
                </button>
              </Field>
            )}
          </DetailSection>

          {/* ── Description ── */}
          {classified.descriptionField && (
            <DetailSection
              label={fieldLabel(classified.descriptionField.key, t)}
            >
              <textarea
                class={cx(CONTROL_CLASS, "resize-y")}
                value={editedFields[classified.descriptionField.key] !==
                    undefined
                  ? editedFields[classified.descriptionField.key]
                  : String(classified.descriptionField.value)}
                rows={3}
                onInput={(e) =>
                  handleFieldChange(
                    classified.descriptionField!.key,
                    (e.currentTarget as HTMLTextAreaElement).value,
                  )}
              />
            </DetailSection>
          )}

          {/* ── Progression ── */}
          {classified.progressValue !== null && (
            <DetailSection label={t("kanban.modal.section.progress")}>
              <div class="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={currentProgress}
                  class={cx(RANGE_CLASS, "flex-1")}
                  aria-label={t("common.progress.label")}
                  onInput={(e) =>
                    handleFieldChange(
                      "progress",
                      (e.currentTarget as HTMLInputElement).value,
                    )}
                />
                <strong class="w-10 shrink-0 text-right font-mono text-data tabular-nums text-ink">
                  {currentProgress}%
                </strong>
              </div>
            </DetailSection>
          )}

          {/* ── Responsables ── */}
          {onAssign && onLoadUsers && (
            <DetailSection label={t("kanban.modal.section.assignees")}>
              <AssigneesSection
                assignees={(() => {
                  const raw = detail.cardDetail?._assign;
                  const fromDetail = parseAssignees(raw);
                  if (fromDetail.length) {
                    return fromDetail;
                  }
                  if (typeof raw === "string" && raw) {
                    return [];
                  }
                  return card?.assignee ? [card.assignee] : [];
                })()}
                onAssign={(assignTo) =>
                  onAssign(board.doctype, selectedCardId, assignTo)}
                onUnassign={onUnassign
                  ? (assignee) =>
                    onUnassign(board.doctype, selectedCardId, assignee)
                  : undefined}
                onLoadUsers={onLoadUsers}
              />
            </DetailSection>
          )}

          {/* ── Sections dynamiques (dates, temps, finances, personnes, autres) ── */}
          {classified.sections.map((section) => (
            <DetailSection
              key={section.id}
              label={t(`kanban.section.${section.id}`)}
            >
              {section.fields.map((f) => (
                <Field key={f.key} label={fieldLabel(f.key, t)}>
                  {fieldControl(
                    f.key,
                    f.value,
                    editedFields,
                    handleFieldChange,
                    t,
                  )}
                </Field>
              ))}
            </DetailSection>
          ))}
        </>
      )}
    </DetailSheet>
  );
}
