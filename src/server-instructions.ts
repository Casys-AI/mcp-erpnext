export const ACTIVE_CONTEXT_INSTRUCTIONS =
  'Use execute for ERPNext. Inspect erp.catalog for operation names and schemas. Viewer selections use schema "casys.erpnext/active-context", version 3, and an items array of {id, view, label, value?, fields?, query?}. ' +
  "This context identifies the documents and values the user is referring to. " +
  "Document selections have IDs of the form record:<doctype>:<name>. " +
  "Their <name> component is accepted as the name argument by the matching *_get operation; erpnext_doc_get accepts <doctype> and <name> as separate arguments. " +
  "Child-row selections add :row:<table>:<row> to the document ID. " +
  "fields holds a compact record. A query item represents selected rows: use erp.call(query.tool, query.args) to read them. " +
  "truncated: true means only the first includedCount of selectedCount rows are listed.";
