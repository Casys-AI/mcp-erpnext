import { useEffect, useRef, useState, type CSSProperties } from "react";
import { colors, fonts, styles } from "~/shared/theme";
import type { KanbanBoardData, KanbanCardData } from "~/shared/kanban/types";
import type { CardDetailState } from "~/shared/kanban/state";
import { badgeToneColors, getAvailableTargets } from "./KanbanViewer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DETAIL_SKIP_FIELDS = new Set([
  "doctype", "docstatus", "idx", "modified_by", "owner",
  "creation", "modified", "_user_tags", "_comments", "_assign",
  "_liked_by", "_seen", "__last_sync_on",
  "lft", "rgt", "old_parent", "is_group", "is_template",
  "depends_on_tasks", "depends_on",
]);

const READONLY_FIELDS = new Set([
  "name", "status", "workflow_state",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "ID", subject: "Subject", status: "Status", priority: "Priority",
  project: "Project", progress: "Progress (%)", description: "Description",
  exp_start_date: "Start date", exp_end_date: "Due date",
  expected_time: "Estimated (h)", actual_time: "Actual time (h)",
  is_milestone: "Milestone", task_weight: "Weight",
  total_costing_amount: "Cost", total_billing_amount: "Billing",
  start: "Start", duration: "Duration", title: "Title",
  opportunity_from: "Source type", party_name: "Party",
  opportunity_amount: "Amount", currency: "Currency",
  probability: "Probability (%)", opportunity_owner: "Owner",
  expected_closing: "Expected closing", transaction_date: "Created",
  contact_person: "Contact", source: "Source", customer: "Customer",
  raised_by: "Raised by", resolution_by: "SLA deadline",
  opening_date: "Opened", resolution_date: "Resolved",
  first_responded_on: "First response",
};

const BOOLEAN_FIELDS = new Set(["is_milestone", "is_group", "is_template"]);

const DATE_FIELDS = new Set([
  "exp_start_date", "exp_end_date", "expected_closing", "transaction_date",
  "opening_date", "resolution_date", "resolution_by", "first_responded_on",
]);

const SELECT_OPTIONS: Record<string, string[]> = {
  priority: ["Low", "Medium", "High", "Urgent"],
  opportunity_from: ["Lead", "Customer"],
};

const HEADER_FIELDS = new Set(["name", "status", "priority", "subject", "title", "project"]);
const SPECIAL_FIELDS = new Set(["progress", "is_milestone"]);
const DESCRIPTION_FIELD_NAMES = new Set(["description", "resolution_details", "notes"]);

const FIELD_SECTIONS: Array<{ id: string; label: string; fields: string[] }> = [
  { id: "dates", label: "Dates", fields: ["exp_start_date", "exp_end_date", "expected_closing", "transaction_date", "opening_date", "resolution_date", "resolution_by", "first_responded_on", "start"] },
  { id: "time", label: "Time Tracking", fields: ["expected_time", "actual_time", "duration"] },
  { id: "financial", label: "Financial", fields: ["opportunity_amount", "currency", "probability", "total_costing_amount", "total_billing_amount", "task_weight"] },
  { id: "people", label: "People", fields: ["project", "opportunity_owner", "customer", "party_name", "contact_person", "raised_by", "source", "opportunity_from"] },
];

const PRIORITY_TONE: Record<string, string> = {
  Urgent: "error",
  High: "error",
  Medium: "warning",
  Low: "success",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isDescriptionField(key: string): boolean {
  return DESCRIPTION_FIELD_NAMES.has(key);
}

function getFieldType(key: string, value: unknown): "boolean" | "date" | "select" | "number" | "textarea" | "text" {
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
  const statusValue = entryMap.has("status") ? String(entryMap.get("status")) : null;
  const priorityValue = entryMap.has("priority") ? String(entryMap.get("priority")) : null;
  const projectValue = entryMap.has("project") ? String(entryMap.get("project")) : null;
  const progressValue = entryMap.has("progress") ? Number(entryMap.get("progress")) : null;
  const milestoneValue = entryMap.has("is_milestone") ? Number(entryMap.get("is_milestone")) : null;

  for (const k of HEADER_FIELDS) classified.add(k);
  for (const k of SPECIAL_FIELDS) classified.add(k);

  const descEntry = entries.find(([k]) => DESCRIPTION_FIELD_NAMES.has(k));
  const descriptionField = descEntry ? { key: descEntry[0], value: descEntry[1] } : null;
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
    titleField: titleField ? { key: titleField[0], value: titleField[1] } : null,
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InlinePriorityBadge({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const tone = badgeToneColors(PRIORITY_TONE[value]);

  if (editing) {
    return (
      <select
        value={value}
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        autoFocus
        style={{
          ...styles.input,
          padding: "2px 8px",
          fontSize: 10,
          fontWeight: 700,
          width: "auto",
          cursor: "pointer",
        }}
      >
        {SELECT_OPTIONS.priority.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
      style={{
        ...styles.badge(tone.color, tone.bg),
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 3,
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase" as const,
        cursor: "pointer",
      }}
      title="Click to change priority"
    >
      {value}
    </span>
  );
}

function ProgressBar({
  progressValue,
  editedFields,
  onFieldChange,
}: {
  progressValue: number | null;
  editedFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}) {
  if (progressValue === null) return null;

  const currentProgress = editedFields.progress !== undefined
    ? Number(editedFields.progress)
    : (progressValue ?? 0);

  return (
    <div style={{ padding: "6px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: colors.text.faint, textTransform: "uppercase" as const, letterSpacing: "0.06em", flexShrink: 0 }}>
            Progress
          </span>
          <div style={{ flex: 1, position: "relative" as const, height: 18, display: "flex", alignItems: "center" }}>
            <div style={{
              position: "absolute" as const,
              left: 0,
              right: 0,
              height: 4,
              background: colors.bg.elevated,
              borderRadius: 2,
            }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, currentProgress))}%`,
                background: currentProgress >= 100 ? colors.success : colors.accent,
                borderRadius: 2,
                transition: "width 0.2s",
              }} />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={currentProgress}
              onChange={(e) => onFieldChange("progress", e.target.value)}
              style={{
                position: "absolute" as const,
                left: 0,
                right: 0,
                width: "100%",
                height: 18,
                opacity: 0,
                cursor: "pointer",
                margin: 0,
              }}
            />
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: fonts.mono,
            color: currentProgress >= 100 ? colors.success : colors.text.primary,
            flexShrink: 0,
            minWidth: 32,
            textAlign: "right" as const,
          }}>
            {currentProgress}%
          </span>
        </div>

    </div>
  );
}

function DetailDescription({
  field,
  editedFields,
  onFieldChange,
}: {
  field: ClassifiedField;
  editedFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}) {
  const isEdited = field.key in editedFields;
  const displayValue = isEdited ? editedFields[field.key] : String(field.value);

  return (
    <div style={{ padding: "8px 16px" }}>
      <div style={{
        fontSize: 9,
        fontWeight: 600,
        color: colors.text.faint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        marginBottom: 4,
      }}>
        {fieldLabel(field.key)}
      </div>
      <textarea
        value={displayValue}
        onChange={(e) => onFieldChange(field.key, e.target.value)}
        rows={3}
        style={{
          ...styles.input,
          resize: "vertical" as const,
          borderColor: isEdited ? colors.accent : colors.border,
          background: isEdited ? colors.accentDim : colors.bg.elevated,
          lineHeight: 1.5,
          fontSize: 13,
        }}
      />
    </div>
  );
}

function DetailFieldCell({
  fieldKey,
  value,
  editedFields,
  onFieldChange,
}: {
  fieldKey: string;
  value: unknown;
  editedFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}) {
  const isReadonly = READONLY_FIELDS.has(fieldKey);
  const isEdited = fieldKey in editedFields;
  const displayValue = isEdited ? editedFields[fieldKey] : String(value);
  const type = getFieldType(fieldKey, value);

  const inputBase: CSSProperties = {
    ...styles.input,
    padding: "5px 8px",
    fontSize: 13,
  };

  function inputStyle(edited: boolean): CSSProperties {
    return {
      ...inputBase,
      borderColor: edited ? colors.accent : "transparent",
      background: edited ? colors.accentDim : "transparent",
    };
  }

  function renderControl() {
    if (isReadonly) {
      return (
        <span style={{
          fontSize: 13,
          color: colors.text.primary,
          fontFamily: typeof value === "number" ? fonts.mono : fonts.sans,
          fontWeight: fieldKey === "name" ? 500 : 400,
        }}>
          {String(value)}
        </span>
      );
    }

    switch (type) {
      case "boolean":
        return (
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isEdited ? displayValue === "1" : value === 1}
              onChange={(e) => onFieldChange(fieldKey, e.target.checked ? "1" : "0")}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 12, color: colors.text.secondary }}>
              {(isEdited ? displayValue === "1" : value === 1) ? "Yes" : "No"}
            </span>
          </label>
        );
      case "select":
        return (
          <select
            value={displayValue}
            onChange={(e) => onFieldChange(fieldKey, e.target.value)}
            style={{
              ...inputBase,
              borderColor: isEdited ? colors.accent : "transparent",
              background: isEdited ? colors.accentDim : "transparent",
              cursor: "pointer",
            }}
          >
            {SELECT_OPTIONS[fieldKey]?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "date":
        return (
          <input
            type="date"
            value={displayValue}
            onChange={(e) => onFieldChange(fieldKey, e.target.value)}
            style={inputStyle(isEdited)}
          />
        );
      case "number":
        return (
          <input
            type="number"
            value={displayValue}
            onChange={(e) => onFieldChange(fieldKey, e.target.value)}
            style={{ ...inputStyle(isEdited), fontFamily: fonts.mono }}
          />
        );
      default:
        return (
          <input
            type="text"
            value={displayValue}
            onChange={(e) => onFieldChange(fieldKey, e.target.value)}
            style={inputStyle(isEdited)}
          />
        );
    }
  }

  return (
    <div className="detail-field-cell" style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px" }}>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: isEdited ? colors.accent : colors.text.faint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
      }}>
        {fieldLabel(fieldKey)}
      </span>
      {renderControl()}
    </div>
  );
}

function DetailMetadataGrid({
  sections,
  editedFields,
  onFieldChange,
}: {
  sections: ClassifiedSection[];
  editedFields: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sections.map((section) => (
        <div key={section.id} style={{ padding: "2px 16px 0" }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: colors.text.faint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            padding: "4px 0 2px",
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}>
            {section.label}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: section.fields.length >= 3 ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: "0 12px",
          }}>
            {section.fields.map((field, idx) => {
              const cols = section.fields.length >= 3 ? 3 : 2;
              const isLast = idx === section.fields.length - 1;
              const isOdd = section.fields.length % cols === 1;
              return (
              <div
                key={field.key}
                style={isLast && isOdd
                  ? { gridColumn: "1 / -1" }
                  : undefined}
              >
                <DetailFieldCell
                  fieldKey={field.key}
                  value={field.value}
                  editedFields={editedFields}
                  onFieldChange={onFieldChange}
                />
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal component
// ---------------------------------------------------------------------------

export function CardDetailModal({
  detail,
  board,
  onClose,
  onMove,
  onSave,
  onAction,
}: {
  detail: CardDetailState;
  board: KanbanBoardData;
  onClose: () => void;
  onMove: (card: KanbanCardData, toColumn: string, label: string) => void;
  onSave?: (doctype: string, name: string, data: Record<string, string>) => void;
  onAction?: (toolName: string, args: Record<string, unknown>) => void;
}) {
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!detail.selectedCardId) return;
    closeButtonRef.current?.focus();
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [detail.selectedCardId, onClose]);

  useEffect(() => {
    setEditedFields({});
    setSaveMessage(null);
  }, [detail.selectedCardId]);

  if (!detail.selectedCardId) return null;

  const card = board.cards.find((c) => c.id === detail.selectedCardId);
  const cardTitle = card?.title ?? detail.selectedCardId;
  const availableTargets = card ? getAvailableTargets(board, card.columnId) : [];
  const hasEdits = Object.keys(editedFields).length > 0;

  function handleFieldChange(key: string, value: string) {
    setEditedFields((prev) => {
      const original = detail.cardDetail ? String(detail.cardDetail[key] ?? "") : "";
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
      setSaveMessage({ text: "Saved", isError: false });
      setEditedFields({});
    } catch (error) {
      setSaveMessage({
        text: error instanceof Error ? error.message : "Save failed",
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  const columnColor = card
    ? board.columns.find((c) => c.id === card.columnId)?.color
    : undefined;
  const classified = detail.cardDetail ? classifyFields(detail.cardDetail) : null;

  return (
    <div
      className="kanban-detail-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="kanban-detail-panel" role="dialog" aria-modal="true" aria-label={`Detail: ${cardTitle}`}>
        {/* Color accent bar */}
        {columnColor && (
          <div aria-hidden="true" style={{ height: 3, background: columnColor, borderRadius: "12px 12px 0 0", flexShrink: 0 }} />
        )}

        {/* Header */}
        <div style={{ padding: "10px 16px 8px", display: "flex", alignItems: "flex-start", gap: 10, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {classified?.titleField ? (
              <input
                type="text"
                aria-label={fieldLabel(classified.titleField.key)}
                value={editedFields[classified.titleField.key] ?? String(classified.titleField.value)}
                onChange={(e) => handleFieldChange(classified.titleField!.key, e.target.value)}
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.text.primary,
                  lineHeight: 1.3,
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 4,
                  padding: "2px 4px",
                  margin: "-2px -4px",
                  width: "calc(100% + 8px)",
                  fontFamily: fonts.sans,
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
              />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.text.primary, lineHeight: 1.3 }}>
                {cardTitle}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.text.faint }}>
                {detail.selectedCardId}
              </span>
              {classified?.statusValue && (
                <span style={{
                  ...styles.badge(columnColor ?? colors.text.muted, `${columnColor ?? colors.text.muted}20`),
                  fontSize: 10,
                }}>
                  {classified.statusValue}
                </span>
              )}
              {classified?.priorityValue && (
                <InlinePriorityBadge
                  value={editedFields.priority ?? classified.priorityValue}
                  onChange={(v) => handleFieldChange("priority", v)}
                />
              )}
              {classified?.projectValue && (
                <span style={{ fontSize: 11, color: colors.text.muted }}>
                  {classified.projectValue}
                </span>
              )}
              {classified?.milestoneValue !== null && classified?.milestoneValue !== undefined && (() => {
                const cm = editedFields.is_milestone !== undefined
                  ? editedFields.is_milestone === "1"
                  : (classified.milestoneValue === 1);
                return (
                  <span
                    role="switch"
                    aria-checked={cm}
                    aria-label="Milestone"
                    tabIndex={0}
                    onClick={() => handleFieldChange("is_milestone", cm ? "0" : "1")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleFieldChange("is_milestone", cm ? "0" : "1"); } }}
                    title={cm ? "Milestone (click to unset)" : "Set as milestone"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      cursor: "pointer",
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: cm ? colors.accentDim : "transparent",
                      border: `1px solid ${cm ? colors.accent : "transparent"}`,
                      transition: "all 0.2s",
                    }}
                  >
                    <span style={{ fontSize: 10, color: cm ? colors.accent : colors.text.faint, transition: "color 0.2s", lineHeight: 1 }}>
                      {"\u25C6"}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: cm ? colors.accent : colors.text.faint, textTransform: "uppercase" as const, letterSpacing: "0.04em", transition: "color 0.2s" }}>
                      Milestone
                    </span>
                  </span>
                );
              })()}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              color: colors.text.faint,
              fontSize: 18,
              lineHeight: 1,
              transition: "color 0.1s",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Content */}
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {detail.detailLoading && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="skeleton" style={{ width: 120, height: 14 }} />
                  <div className="skeleton" style={{ flex: 1, height: 14 }} />
                </div>
              ))}
            </div>
          )}

          {detail.detailError && (
            <div style={{ margin: 16, padding: "10px 14px", background: colors.errorDim, borderRadius: 6, color: colors.error, fontSize: 12 }}>
              {detail.detailError}
            </div>
          )}

          {classified?.descriptionField && (
            <div style={{ borderBottom: `1px solid ${colors.borderSubtle}` }}>
              <DetailDescription
                field={classified.descriptionField}
                editedFields={editedFields}
                onFieldChange={handleFieldChange}
              />
            </div>
          )}

          {classified && classified.sections.length > 0 && (
            <DetailMetadataGrid
              sections={classified.sections}
              editedFields={editedFields}
              onFieldChange={handleFieldChange}
            />
          )}

          {classified && (
            <ProgressBar
              progressValue={classified.progressValue}
              editedFields={editedFields}
              onFieldChange={handleFieldChange}
            />
          )}
        </div>

        {/* Sticky footer */}
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: "8px 16px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flexShrink: 0 }}>

          {/* Save */}
          {onSave && detail.cardDetail && (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasEdits || saving}
                style={{
                  ...styles.button,
                  padding: "4px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: hasEdits ? colors.accent : colors.bg.elevated,
                  color: hasEdits ? "#fff" : colors.text.faint,
                  borderColor: hasEdits ? colors.accent : colors.border,
                  opacity: saving ? 0.6 : 1,
                  borderRadius: 5,
                }}
              >
                {saving ? "Saving\u2026" : "Save"}
              </button>
              {hasEdits && (
                <button
                  type="button"
                  onClick={() => { setEditedFields({}); setSaveMessage(null); }}
                  style={{ ...styles.button, padding: "4px 10px", fontSize: 11 }}
                >
                  Discard
                </button>
              )}
              {saveMessage && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: saveMessage.isError ? colors.error : colors.success,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: saveMessage.isError ? colors.errorDim : colors.successDim,
                }}>
                  {saveMessage.text}
                </span>
              )}
              <span style={{ width: 1, height: 14, background: colors.border, flexShrink: 0 }} />
            </>
          )}
            {card && availableTargets.length > 0 && (
              <>
                <span style={{ fontSize: 10, fontWeight: 600, color: colors.text.faint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                  Move to
                </span>
                {availableTargets.map((target) => (
                  <button
                    key={target.columnId}
                    type="button"
                    onClick={() => { onMove(card, target.columnId, target.label); onClose(); }}
                    style={{
                      ...styles.button,
                      padding: "4px 8px",
                      fontSize: 11,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {target.color && (
                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: target.color, flexShrink: 0 }} />
                    )}
                    {target.label}
                  </button>
                ))}
              </>
            )}

            {onAction && card && availableTargets.length > 0 && (
              <span style={{ width: 1, height: 14, background: colors.border, flexShrink: 0 }} />
            )}

            {onAction && (
              <>
                <button
                  type="button"
                  onClick={() => onAction("erpnext_doc_list", { doctype: board.doctype, filters: [["name", "=", detail.selectedCardId]] })}
                  style={{ ...styles.button, padding: "4px 8px", fontSize: 11, color: colors.accent }}
                >
                  Doclist
                </button>
                {board.doctype === "Task" && (
                  <button
                    type="button"
                    onClick={() => onAction("erpnext_doc_list", { doctype: "Timesheet Detail", filters: [["task", "=", detail.selectedCardId]] })}
                    style={{ ...styles.button, padding: "4px 8px", fontSize: 11, color: colors.accent }}
                  >
                    Timesheets
                  </button>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
