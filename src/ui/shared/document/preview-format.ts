import { currentLocale } from "../format.ts";

const FRAPPE_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?)?$/;

export function formatDocumentPreviewText(value: string): string {
  const match = FRAPPE_DATE.exec(value);
  if (!match) return value;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText ?? 0);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second
  ) return value;

  // Frappe dates have no timezone; UTC here preserves their civil date/time.
  return new Intl.DateTimeFormat(currentLocale(), {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(hourText !== undefined
      ? {
        hour: "2-digit" as const,
        minute: "2-digit" as const,
        ...(secondText !== undefined ? { second: "2-digit" as const } : {}),
      }
      : {}),
  }).format(date);
}
