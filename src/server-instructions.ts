export const ACTIVE_CONTEXT_INSTRUCTIONS =
  'User selections in ERPNext viewers are shared as model context on compatible hosts with schema "casys.erpnext/active-context", version 3, and an items array of {id, view, label, value?, fields?, query?}. ' +
  "This context identifies the documents and values the user is referring to. " +
  "Document selections have IDs of the form record:<doctype>:<name>. " +
  "Their <name> component is accepted as the name argument by the matching *_get tool; erpnext_doc_get accepts <doctype> and <name> as separate arguments. " +
  "Child-row selections add :row:<table>:<row> to the document ID. " +
  "fields holds a compact record. A query item represents selected rows: call query.tool with query.args to read them. " +
  "truncated: true means only the first includedCount of selectedCount rows are listed.";
