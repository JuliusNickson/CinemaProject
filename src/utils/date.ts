/** Parses `YYYY-MM-DD` as a local date, avoiding the UTC shift of `new Date(iso)`. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** `2026-09-15` → `15 SEPT` (short) or `15 SEPTEMBER` (long). */
export function formatDayMonth(iso: string, month: "short" | "long" = "short"): string {
  const date = parseIsoDate(iso);
  const monthName = new Intl.DateTimeFormat("en-GB", { month }).format(date);
  return `${date.getDate()} ${monthName}`.toUpperCase();
}
