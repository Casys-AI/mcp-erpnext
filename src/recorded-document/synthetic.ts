/**
 * Synthetic labelled recorded-document fixtures for the six operational
 * profiles.
 *
 * Every document is shaped like the existing operational fixtures but
 * renamed and labelled synthetic. None of these values is a real ERP
 * document, run, or qualification.
 */

import {
  RECORDED_DOCUMENT_SCHEMA,
  RECORDED_DOCUMENT_SESSION_SCHEMA,
  RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
  RECORDED_DOCUMENT_URI_PREFIX,
  RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
  RECORDED_THREAD_DOCUMENT_KIND,
  SYNTHETIC_RECORDED_NOTICE,
} from "./identities.ts";
import { type RecordedDocument, sealRecordedDocument } from "./record.ts";
import {
  type RecordedViewerSession,
  withRecordedSessionFingerprint,
} from "./session.ts";
import { sha256FingerprintOfUtf8 } from "../shared/json.ts";

export const SYNTHETIC_RECORDED_SITE_URL =
  "https://erp.test.example/site-recorded";
export const SYNTHETIC_RECORDED_OBSERVED_AT = "2026-09-13T09:45:00.000Z";
export const SYNTHETIC_RECORDED_MODIFIED = "2026-09-13 09:42:18";
export const SYNTHETIC_RECORDED_THREAD_DIGEST = "e".repeat(64);
export const SYNTHETIC_RECORDED_UNAVAILABLE_REASON =
  "unavailable recorded document bytes";
export const SYNTHETIC_RECORDED_UNRESOLVED_REASON =
  "unresolved recorded document binding";
export const SYNTHETIC_RECORDED_HISTORICAL_REASON =
  "superseded by a later observation; shown for history only";

export type RecordedFixtureKind =
  | "project"
  | "task"
  | "timesheet"
  | "bom"
  | "work-order"
  | "job-card";

export const RECORDED_FIXTURE_KINDS: readonly RecordedFixtureKind[] = [
  "project",
  "task",
  "timesheet",
  "bom",
  "work-order",
  "job-card",
];

const COMMON = {
  company: "SYNTH · Recorded Atelier",
  modified: SYNTHETIC_RECORDED_MODIFIED,
  owner: "synthetic@example.invalid",
};

const FIXTURES: Record<RecordedFixtureKind, Record<string, unknown>> = {
  project: {
    ...COMMON,
    doctype: "Project",
    name: "SYNTH-PROJ-0042",
    project_name: "Modular assembly cell · Synth 04",
    status: "Open",
    percent_complete: 42,
    percent_complete_method: "Task Progress",
    actual_time: 118.5,
    priority: "High",
    project_type: "External",
    customer: "SYNTH-CUSTOMER-008",
    expected_start_date: "2026-09-01",
    expected_end_date: "2026-10-16",
    actual_start_date: "2026-09-02",
    actual_end_date: null,
    estimated_costing: 28500,
    total_costing_amount: 9480,
    total_purchase_cost: 13640,
    total_consumed_material_cost: 0,
    notes:
      `${SYNTHETIC_RECORDED_NOTICE}. Mechanical assembly, controls integration and commissioning of a modular production cell. Costs are fictional; the document does not supply a company currency.`,
    users: [{
      user: "lead@example.invalid",
      full_name: "Camille Martin",
      view_attachments: 1,
    }, {
      user: "controls@example.invalid",
      full_name: "Lin Chen",
      view_attachments: 1,
    }],
  },
  task: {
    ...COMMON,
    doctype: "Task",
    name: "SYNTH-TASK-0142",
    subject: "Validate the assembly sequence",
    status: "Working",
    project: "SYNTH-PROJ-0042",
    parent_task: "SYNTH-TASK-0100",
    priority: "High",
    is_milestone: 0,
    progress: 62,
    expected_time: 24,
    actual_time: 14.5,
    exp_start_date: "2026-09-08",
    exp_end_date: "2026-09-16",
    act_start_date: "2026-09-09",
    act_end_date: null,
    total_costing_amount: 1160,
    total_billing_amount: 1740,
    description:
      `${SYNTHETIC_RECORDED_NOTICE}. Check the supplied assembly sequence and document unresolved interfaces before commissioning.`,
    depends_on: [{
      task: "SYNTH-TASK-0128",
      subject: "Complete mechanical interfaces",
      project: "SYNTH-PROJ-0042",
    }, {
      task: "SYNTH-TASK-0134",
      subject: "Review controls I/O list",
      project: "SYNTH-PROJ-0042",
    }],
  },
  timesheet: {
    ...COMMON,
    doctype: "Timesheet",
    name: "SYNTH-TS-0084",
    title: "Controls engineering · week 37",
    status: "Draft",
    docstatus: 0,
    employee: "SYNTH-EMP-0008",
    employee_name: "Lin Chen",
    parent_project: "SYNTH-PROJ-0042",
    start_date: "2026-09-08",
    end_date: "2026-09-10",
    total_hours: 14.5,
    total_billable_hours: 12,
    total_billed_hours: 0,
    currency: "EUR",
    total_costing_amount: 1160,
    total_billable_amount: 1740,
    total_billed_amount: 0,
    note: `${SYNTHETIC_RECORDED_NOTICE}. All hours and costs are fictional.`,
    time_logs: [{
      name: "synth-log-1",
      activity_type: "Controls engineering",
      project: "SYNTH-PROJ-0042",
      task: "SYNTH-TASK-0142",
      hours: 8,
      from_time: "2026-09-08 09:00:00",
      to_time: "2026-09-08 17:00:00",
      is_billable: 1,
      costing_amount: 640,
      billing_amount: 960,
    }, {
      name: "synth-log-2",
      activity_type: "Sequence review",
      project: "SYNTH-PROJ-0042",
      task: "SYNTH-TASK-0142",
      hours: 6.5,
      from_time: "2026-09-10 09:00:00",
      to_time: "2026-09-10 15:30:00",
      is_billable: 1,
      costing_amount: 520,
      billing_amount: 780,
    }],
  },
  bom: {
    ...COMMON,
    doctype: "BOM",
    name: "SYNTH-BOM-BASE-001",
    item: "SYNTH-BASE-001",
    item_name: "Synth 04 · base assembly",
    docstatus: 1,
    quantity: 1,
    uom: "Nos",
    is_active: 1,
    is_default: 1,
    currency: "EUR",
    routing: "SYNTH-ROUTE-ASSEMBLY",
    raw_material_cost: 685,
    operating_cost: 135,
    secondary_items_cost: 0,
    total_cost: 820,
    rm_cost_as_per: "Valuation Rate",
    description:
      `${SYNTHETIC_RECORDED_NOTICE}. A fictional manufacturing bill of materials; amounts are explicit synthetic values.`,
    items: [{
      name: "synth-bom-row-1",
      item_code: "SYNTH-PLATE-420",
      item_name: "Machined base plate · 420 × 280 mm",
      qty: 1,
      uom: "Nos",
      rate: 420,
      amount: 420,
      source_warehouse: "SYNTH-Raw Materials",
    }, {
      name: "synth-bom-row-2",
      item_code: "SYNTH-RAIL-240",
      item_name: "Linear guide rail · 240 mm",
      qty: 2,
      uom: "Nos",
      rate: 110,
      amount: 220,
    }, {
      name: "synth-bom-row-3",
      item_code: "SYNTH-FASTENER-M8",
      item_name: "M8 assembly fasteners",
      qty: 1,
      uom: "Set",
      rate: 45,
      amount: 45,
    }],
    operations: [{
      operation: "Mechanical assembly",
      workstation: "SYNTH-BENCH-02",
      time_in_mins: 90,
      hour_rate: 60,
      operating_cost: 90,
      sequence_id: 10,
    }, {
      operation: "Dimensional inspection",
      workstation: "SYNTH-METROLOGY-01",
      time_in_mins: 30,
      hour_rate: 90,
      operating_cost: 45,
      sequence_id: 20,
    }],
  },
  "work-order": {
    ...COMMON,
    doctype: "Work Order",
    name: "SYNTH-MFG-WO-0026",
    production_item: "SYNTH-BASE-001",
    item_name: "Synth 04 · production batch",
    status: "In Process",
    docstatus: 1,
    bom_no: "SYNTH-BOM-BASE-001",
    project: "SYNTH-PROJ-0042",
    qty: 12,
    produced_qty: 4,
    material_transferred_for_manufacturing: 8,
    stock_uom: "Nos",
    fg_warehouse: "SYNTH-Finished Goods",
    planned_start_date: "2026-09-10 08:00:00",
    planned_end_date: "2026-09-16 17:00:00",
    actual_start_date: "2026-09-10 08:24:00",
    actual_end_date: null,
    planned_operating_cost: 1620,
    actual_operating_cost: 586,
    additional_operating_cost: 0,
    total_operating_cost: 1620,
    description:
      `${SYNTHETIC_RECORDED_NOTICE}. Quantities, durations and costs are fictional ERP-shaped values. No progress ratio or total is calculated by this viewer.`,
    required_items: [{
      name: "synth-wo-row-1",
      item_code: "SYNTH-PLATE-420",
      item_name: "Machined base plate",
      required_qty: 12,
      transferred_qty: 8,
      consumed_qty: 4,
      source_warehouse: "SYNTH-Raw Materials",
      stock_uom: "Nos",
    }, {
      name: "synth-wo-row-2",
      item_code: "SYNTH-RAIL-240",
      item_name: "Linear guide rail",
      required_qty: 24,
      transferred_qty: 16,
      consumed_qty: 8,
      stock_uom: "Nos",
    }],
    operations: [{
      operation: "Mechanical assembly",
      status: "Work in Progress",
      workstation: "SYNTH-BENCH-02",
      time_in_mins: 1080,
      actual_operation_time: 406,
      completed_qty: 4,
      planned_operating_cost: 1080,
      actual_operating_cost: 406,
      sequence_id: 10,
    }, {
      operation: "Dimensional inspection",
      status: "Work in Progress",
      workstation: "SYNTH-METROLOGY-01",
      time_in_mins: 360,
      actual_operation_time: 120,
      completed_qty: 4,
      planned_operating_cost: 540,
      actual_operating_cost: 180,
      sequence_id: 20,
    }],
  },
  "job-card": {
    ...COMMON,
    doctype: "Job Card",
    name: "SYNTH-JOB-0068",
    item_name: "Mechanical assembly · batch 26",
    status: "Work In Progress",
    docstatus: 0,
    work_order: "SYNTH-MFG-WO-0026",
    bom_no: "SYNTH-BOM-BASE-001",
    operation: "Mechanical assembly",
    workstation: "SYNTH-BENCH-02",
    production_item: "SYNTH-BASE-001",
    for_quantity: 12,
    total_completed_qty: 4,
    total_time_in_mins: 406,
    time_required: 1080,
    expected_start_date: "2026-09-10 08:00:00",
    expected_end_date: "2026-09-15 16:00:00",
    actual_start_date: "2026-09-10 08:24:00",
    actual_end_date: null,
    remarks:
      `${SYNTHETIC_RECORDED_NOTICE}. This Job Card does not supply a quantity UOM. No unit is inferred from its item or Work Order.`,
    time_logs: [{
      name: "synth-job-log-1",
      employee: "SYNTH-EMP-0012",
      from_time: "2026-09-10 08:24:00",
      to_time: "2026-09-10 11:50:00",
      time_in_mins: 206,
      completed_qty: 2,
    }, {
      name: "synth-job-log-2",
      employee: "SYNTH-EMP-0012",
      from_time: "2026-09-11 08:00:00",
      to_time: "2026-09-11 11:20:00",
      time_in_mins: 200,
      completed_qty: 2,
    }],
  },
};

export async function syntheticRecordedSiteId(
  siteUrl = SYNTHETIC_RECORDED_SITE_URL,
): Promise<string> {
  return await sha256FingerprintOfUtf8(siteUrl);
}

/** Fresh deep copy of one synthetic document; callers may override fields. */
export function syntheticRecordedDocument(
  kind: RecordedFixtureKind,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(FIXTURES[kind])) as Record<string, unknown>;
}

export async function syntheticSealedRecord(
  kind: RecordedFixtureKind,
  overrides: Record<string, unknown> = {},
): Promise<RecordedDocument> {
  return await sealRecordedDocument({
    schemaVersion: RECORDED_DOCUMENT_SCHEMA,
    doctype: FIXTURES[kind].doctype,
    name: FIXTURES[kind].name,
    modified: SYNTHETIC_RECORDED_MODIFIED,
    observedAt: SYNTHETIC_RECORDED_OBSERVED_AT,
    sourceInstance: {
      kind: RECORDED_DOCUMENT_SOURCE_INSTANCE_KIND,
      siteId: await syntheticRecordedSiteId(),
    },
    document: {
      ...syntheticRecordedDocument(kind),
      ...overrides,
    },
  });
}

export function syntheticRecordedRecordRef(record: RecordedDocument): {
  readonly uri: string;
  readonly fingerprint: string;
} {
  return {
    uri: `${RECORDED_DOCUMENT_URI_PREFIX}${
      record.fingerprint.slice("sha256:".length)
    }`,
    fingerprint: record.fingerprint,
  };
}

export function syntheticRecordedThreadAnchor(): {
  readonly kind: typeof RECORDED_THREAD_DOCUMENT_KIND;
  readonly id: string;
  readonly uri: string;
  readonly fingerprint: string;
} {
  return {
    kind: RECORDED_THREAD_DOCUMENT_KIND,
    id: `recorded-document-thread-${SYNTHETIC_RECORDED_THREAD_DIGEST}`,
    uri:
      `casys://synthetic-thread/document/${SYNTHETIC_RECORDED_THREAD_DIGEST}`,
    fingerprint: `sha256:${SYNTHETIC_RECORDED_THREAD_DIGEST}`,
  };
}

function syntheticProvenance(record: RecordedDocument) {
  return {
    recordRef: syntheticRecordedRecordRef(record),
    threadDocumentRef: syntheticRecordedThreadAnchor(),
    erp: {
      doctype: record.doctype,
      name: record.name,
      modified: record.modified,
    },
    sourceInstance: { ...record.sourceInstance },
    observedAt: record.observedAt,
  };
}

function syntheticBasis(record: RecordedDocument) {
  const slug = record.doctype.toLowerCase().replace(/[^a-z]+/g, "-");
  return {
    projectId: "proj-synthetic-recorded",
    projectRevision: 3,
    subjectId: `subj-synthetic-recorded-${slug}`,
    thread: { id: "thread-synthetic-recorded", revision: 2 },
  };
}

export async function syntheticAvailableRecordedSession(
  record: RecordedDocument,
  options: { historicalReason?: string } = {},
): Promise<RecordedViewerSession> {
  return await withRecordedSessionFingerprint({
    schemaVersion: RECORDED_DOCUMENT_SESSION_SCHEMA,
    kind: RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
    basis: syntheticBasis(record),
    anchor: syntheticRecordedThreadAnchor(),
    provenance: syntheticProvenance(record),
    projection: {
      status: "available",
      record,
      ...(options.historicalReason === undefined ? {} : {
        applicability: {
          status: "historical" as const,
          reason: options.historicalReason,
        },
      }),
    },
  });
}

export async function syntheticUnavailableRecordedSession(
  record: RecordedDocument,
): Promise<RecordedViewerSession> {
  return await withRecordedSessionFingerprint({
    schemaVersion: RECORDED_DOCUMENT_SESSION_SCHEMA,
    kind: RECORDED_DOCUMENT_VIEWER_SESSION_KIND,
    basis: syntheticBasis(record),
    anchor: syntheticRecordedThreadAnchor(),
    provenance: syntheticProvenance(record),
    projection: {
      status: "unavailable",
      reason: SYNTHETIC_RECORDED_UNAVAILABLE_REASON,
    },
  });
}

export async function syntheticUnresolvedRecordedSession(
  record: RecordedDocument,
): Promise<RecordedViewerSession> {
  const session = await syntheticUnavailableRecordedSession(record);
  return await withRecordedSessionFingerprint({
    ...session,
    basis: syntheticBasis(record),
    projection: {
      status: "unresolved",
      reason: SYNTHETIC_RECORDED_UNRESOLVED_REASON,
    },
  });
}
