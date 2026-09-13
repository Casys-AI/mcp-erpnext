import { documentFieldOf } from "./model.ts";
import type {
  ChildTableModel,
  DocumentFieldModel,
  DocumentModel,
} from "./types.ts";

type Unit = "hours" | "minutes" | "percent" | "quantity" | "currency";
export interface OperationalField {
  key: string;
  label: string;
  unit?: Unit;
  unitField?: string;
}
export interface OperationalGroup {
  title: string;
  fields: readonly OperationalField[];
}
export interface OperationalProfile {
  module: "project" | "manufacturing";
  title: string;
  metrics: readonly OperationalField[];
  groups: readonly OperationalGroup[];
  tables: Readonly<Record<string, readonly string[]>>;
}
const f = (
  key: string,
  label = key,
  unit?: Unit,
  unitField?: string,
): OperationalField => ({ key, label, unit, unitField });
const cost = (key: string, label = key, unitField = "company_currency") =>
  f(key, label, "currency", unitField);
const schedule = (
  start: string,
  end: string,
  actualStart: string,
  actualEnd: string,
): OperationalGroup => ({
  title: "schedule",
  fields: [
    f(start, "planned_start"),
    f(actualStart, "actual_start"),
    f(end, "planned_end"),
    f(actualEnd, "actual_end"),
  ],
});

// Presentation only. Field identities/units follow ERPNext version-16 DocType
// schemas; no linked reads, cost rollups, progress ratios or currency inference.
const PROFILES: Readonly<Record<string, OperationalProfile>> = {
  Project: {
    module: "project",
    title: "project",
    metrics: [
      f("percent_complete", "progress", "percent"),
      f("actual_time", "logged_time", "hours"),
      f("priority"),
    ],
    groups: [
      {
        title: "scope",
        fields: [
          f("customer"),
          f("project_type"),
          f("company"),
          f("percent_complete_method", "progress_method"),
        ],
      },
      schedule(
        "expected_start_date",
        "expected_end_date",
        "actual_start_date",
        "actual_end_date",
      ),
      {
        title: "costing",
        fields: [
          cost("estimated_costing", "estimated_cost"),
          cost("total_costing_amount", "timesheet_cost"),
          cost("total_purchase_cost", "purchase_cost"),
          cost("total_consumed_material_cost", "material_cost"),
        ],
      },
    ],
    tables: {
      tasks: ["subject", "status", "progress", "task"],
      users: ["user", "full_name", "email"],
    },
  },
  Task: {
    module: "project",
    title: "task",
    metrics: [
      f("progress", "progress", "percent"),
      f("expected_time", "planned_time", "hours"),
      f("actual_time", "logged_time", "hours"),
    ],
    groups: [
      {
        title: "relationships",
        fields: [
          f("project"),
          f("parent_task"),
          f("priority"),
          f("is_milestone"),
        ],
      },
      schedule(
        "exp_start_date",
        "exp_end_date",
        "act_start_date",
        "act_end_date",
      ),
      {
        title: "costing",
        fields: [
          cost("total_costing_amount", "timesheet_cost"),
          cost("total_billing_amount", "billable_amount"),
        ],
      },
    ],
    tables: {
      depends_on: ["task", "subject", "project"],
      time_logs: ["activity_type", "hours", "from_time", "to_time"],
    },
  },
  Timesheet: {
    module: "project",
    title: "timesheet",
    metrics: [
      f("total_hours", "logged_time", "hours"),
      f("total_billable_hours", "billable_time", "hours"),
      f("total_billed_hours", "billed_time", "hours"),
    ],
    groups: [
      {
        title: "relationships",
        fields: [
          f("employee"),
          f("parent_project", "project"),
          f("start_date", "period_start"),
          f("end_date", "period_end"),
        ],
      },
      {
        title: "costing",
        fields: [
          cost("total_costing_amount", "timesheet_cost", "currency"),
          cost("total_billable_amount", "billable_amount", "currency"),
          cost("total_billed_amount", "billed_amount", "currency"),
        ],
      },
    ],
    tables: { time_logs: ["activity_type", "task", "hours", "project"] },
  },
  BOM: {
    module: "manufacturing",
    title: "bom",
    metrics: [
      f("quantity", "output_quantity", "quantity", "uom"),
      cost("total_cost", "bom_cost", "currency"),
      f("is_active"),
    ],
    groups: [
      {
        title: "scope",
        fields: [f("item"), f("routing"), f("company"), f("is_default")],
      },
      {
        title: "costing",
        fields: [
          cost("raw_material_cost", "material_cost", "currency"),
          cost("operating_cost", "operating_cost", "currency"),
          cost("secondary_items_cost", "secondary_items_cost", "currency"),
          f("rm_cost_as_per", "material_rate_basis"),
        ],
      },
    ],
    tables: {
      items: ["item_code", "qty", "uom", "amount"],
      operations: [
        "operation",
        "workstation",
        "time_in_mins",
        "operating_cost",
      ],
      secondary_items: ["item_code", "qty", "uom", "amount"],
      exploded_items: ["item_code", "stock_qty", "stock_uom", "amount"],
    },
  },
  "Work Order": {
    module: "manufacturing",
    title: "work_order",
    metrics: [
      f("qty", "planned_quantity", "quantity", "stock_uom"),
      f("produced_qty", "produced_quantity", "quantity", "stock_uom"),
      f(
        "material_transferred_for_manufacturing",
        "transferred_quantity",
        "quantity",
        "stock_uom",
      ),
    ],
    groups: [
      {
        title: "scope",
        fields: [
          f("production_item", "item"),
          f("bom_no", "bom"),
          f("project"),
          f("fg_warehouse", "target_warehouse"),
        ],
      },
      schedule(
        "planned_start_date",
        "planned_end_date",
        "actual_start_date",
        "actual_end_date",
      ),
      {
        title: "costing",
        fields: [
          cost("planned_operating_cost", "planned_cost"),
          cost("actual_operating_cost", "actual_cost"),
          cost("additional_operating_cost", "additional_cost"),
          cost("total_operating_cost", "operating_cost"),
        ],
      },
    ],
    tables: {
      required_items: [
        "item_code",
        "required_qty",
        "transferred_qty",
        "consumed_qty",
      ],
      operations: [
        "operation",
        "status",
        "time_in_mins",
        "actual_operation_time",
      ],
    },
  },
  "Job Card": {
    module: "manufacturing",
    title: "job_card",
    metrics: [
      f("for_quantity", "planned_quantity", "quantity", "stock_uom"),
      f("total_completed_qty", "completed_quantity", "quantity", "stock_uom"),
      f("total_time_in_mins", "logged_time", "minutes"),
    ],
    groups: [
      {
        title: "scope",
        fields: [
          f("operation"),
          f("workstation"),
          f("work_order"),
          f("production_item", "item"),
        ],
      },
      schedule(
        "expected_start_date",
        "expected_end_date",
        "actual_start_date",
        "actual_end_date",
      ),
      {
        title: "operation_time",
        fields: [
          f("time_required", "planned_time", "minutes"),
          f("total_time_in_mins", "logged_time", "minutes"),
        ],
      },
    ],
    tables: {
      time_logs: ["employee", "from_time", "to_time", "completed_qty"],
      scheduled_time_logs: ["from_time", "to_time", "time_in_mins"],
      items: ["item_code", "required_qty", "uom", "transferred_qty"],
      sub_operations: ["sub_operation", "status", "completed_qty"],
    },
  },
};
export function operationalProfile(
  doctype: string,
): OperationalProfile | undefined {
  return Object.hasOwn(PROFILES, doctype) ? PROFILES[doctype] : undefined;
}
export function operationalField(
  model: DocumentModel,
  spec: OperationalField,
): DocumentFieldModel {
  const value = model.envelope.document[spec.key] ?? null;
  const flag = ["is_active", "is_default", "is_milestone"].includes(spec.key);
  return documentFieldOf(
    spec.key,
    flag && (value === 0 || value === 1) ? value === 1 : value,
  );
}
export function operationalUnit(
  model: DocumentModel,
  spec: OperationalField,
): string | null {
  if (!spec.unitField) return null;
  const value = model.envelope.document[spec.unitField];
  return typeof value === "string" && value.trim() ? value : null;
}
export function operationalProgress(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (
    typeof value === "string" &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())
  ) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}
export function operationalRemainder(
  model: DocumentModel,
  profile: OperationalProfile,
): DocumentModel {
  const keys = new Set(
    [...profile.metrics, ...profile.groups.flatMap((group) => group.fields)]
      .map((field) => field.key),
  );
  return {
    ...model,
    fields: model.fields.filter((field) => !keys.has(field.key)),
    progressFields: model.progressFields.filter((field) =>
      !keys.has(field.key)
    ),
  };
}
export function operationalTable(
  table: ChildTableModel,
  profile: OperationalProfile,
  t: (key: string) => string,
): ChildTableModel {
  const priority = profile.tables[table.key] ?? [];
  const label = (key: string, fallback: string) => {
    const labelKey = key === "time_in_mins" && table.key === "time_logs"
      ? "logged_minutes"
      : key;
    const id = `dossier.field.${labelKey}`;
    const value = t(id);
    return value === id ? fallback : value;
  };
  return {
    ...table,
    label: label(table.key, table.label),
    // These dossiers expose ERP totals above, never local sums of child rows.
    total: undefined,
    columns: [...table.columns].sort((a, b) => {
      const rank = (key: string) =>
        priority.includes(key) ? priority.indexOf(key) : priority.length;
      return rank(a.key) - rank(b.key);
    }).map((column) => ({ ...column, label: label(column.key, column.label) })),
  };
}

export function operationalDocstatusKey(
  docstatus: number | undefined,
): string | undefined {
  if (docstatus === 0) return "dossier.docstatus.draft";
  if (docstatus === 1) return "dossier.docstatus.submitted";
  if (docstatus === 2) return "dossier.docstatus.cancelled";
  return undefined;
}
