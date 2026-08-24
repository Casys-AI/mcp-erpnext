import type { DocumentAttachment } from "~/shared/document/attachment-results.ts";

export const DOC_FIXTURE = {
  data: {
    doctype: "Task",
    name: "TASK-2026-0142",
    subject: "Commission the Taichung packaging line",
    status: "Open",
    docstatus: 0,
    project: "PLANT-TAICHUNG",
    company: "Casys Taiwan",
    priority: "High",
    progress: 62,
    exp_start_date: "2026-08-18",
    exp_end_date: "2026-09-04",
    description:
      "Coordinate controls validation, safety sign-off and operator handover before production ramp-up.",
    depends_on: [
      {
        task: "TASK-2026-0128",
        subject: "Validate PLC interlocks",
        status: "Completed",
      },
      {
        task: "TASK-2026-0134",
        subject: "Complete guarding inspection",
        status: "Working",
      },
    ],
    time_logs: [
      {
        activity_type: "Engineering",
        hours: 4.5,
        from_time: "2026-08-22 09:00:00",
        to_time: "2026-08-22 13:30:00",
      },
      {
        activity_type: "Commissioning",
        hours: 3,
        from_time: "2026-08-23 14:00:00",
        to_time: "2026-08-23 17:00:00",
      },
    ],
    owner: "erwan@casys.ai",
    modified: "2026-08-24 16:42:00",
  },
  refreshRequest: {
    toolName: "erpnext_task_get",
    arguments: { name: "TASK-2026-0142" },
  },
  _availableTools: [
    "erpnext_task_get",
    "erpnext_file_list",
    "erpnext_file_upload",
    "erpnext_file_download",
    "erpnext_doc_submit",
    "erpnext_doc_cancel",
    "erpnext_doc_list",
    "erpnext_timesheet_list",
  ],
  _sendMessageHints: [{
    key: "timesheets",
    label: "Timesheets",
    message: "Show timesheets for task {id}",
    tool: "erpnext_doc_list",
    args: {
      doctype: "Timesheet",
      filters: [["Timesheet Detail", "task", "=", "{id}"]],
      limit: 20,
    },
    kind: "list",
  }],
};

export const DOC_FIXTURE_FILES: readonly DocumentAttachment[] = [
  {
    id: "FILE-001",
    fileName: "commissioning-checklist.pdf",
    fileSize: 482_304,
    isPrivate: true,
    owner: "erwan@casys.ai",
    createdAt: "2026-08-24 15:10:00",
  },
  {
    id: "FILE-002",
    fileName: "line-layout-rev-c.png",
    fileSize: 1_842_176,
    isPrivate: false,
    owner: "engineer@casys.ai",
    createdAt: "2026-08-23 11:20:00",
  },
];

export function isFixtureMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(globalThis.location.search).has("fixture");
}
