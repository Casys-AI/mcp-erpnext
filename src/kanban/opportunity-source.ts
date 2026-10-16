import { FrappeAPIError } from "../api/frappe-client.ts";

function isSourceFieldMessage(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Frappe translates the prefix, then appends the untranslated field name.
  return /^[^:\r\n]+: source$/.test(value.trim());
}

export function isOpportunitySourceFieldError(error: unknown): boolean {
  if (
    !(error instanceof FrappeAPIError) || error.status !== 417 ||
    typeof error.body !== "object" || error.body === null
  ) return false;

  const body = error.body as Record<string, unknown>;
  if (body.exc_type !== "DataError") return false;
  if (isSourceFieldMessage(body.message)) return true;
  if (typeof body._server_messages !== "string") return false;

  let messages: unknown;
  try {
    messages = JSON.parse(body._server_messages);
  } catch {
    return false;
  }
  if (!Array.isArray(messages) || messages.length !== 1) return false;

  let entry: unknown = messages[0];
  if (typeof entry === "string") {
    try {
      entry = JSON.parse(entry);
    } catch {
      return isSourceFieldMessage(entry);
    }
  }
  if (typeof entry === "object" && entry !== null) {
    return isSourceFieldMessage((entry as Record<string, unknown>).message);
  }
  return isSourceFieldMessage(entry);
}
