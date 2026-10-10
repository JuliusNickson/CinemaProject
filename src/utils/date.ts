/** Parses `YYYY-MM-DD` as a local date, avoiding the UTC shift of `new Date(iso)`. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Local `YYYY-MM-DD` for a date. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Today and the following days, as `YYYY-MM-DD`. */
export function upcomingIsoDates(count: number): string[] {
  const start = new Date();
  return Array.from({ length: count }, (_, offset) =>
    toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)),
  );
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(parseIsoDate(value)) === value;
}

/** `2026-09-15` → `15 SEPT` (short) or `15 SEPTEMBER` (long). */
export function formatDayMonth(iso: string, month: "short" | "long" = "short"): string {
  const date = parseIsoDate(iso);
  const monthName = new Intl.DateTimeFormat("en-GB", { month }).format(date);
  return `${date.getDate()} ${monthName}`.toUpperCase();
}

/** `2026-09-04` → `4 September 2026` */
export function formatFullDate(iso: string): string {
  const date = parseIsoDate(iso);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(date);
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** `2026-09-15` → `Tuesday 15 September` */
export function formatSessionDate(iso: string): string {
  const date = parseIsoDate(iso);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(date);
  return `${weekday} ${date.getDate()} ${month}`;
}

/** `2026-09-15` → `Tue 15 Sep` */
export function formatShortSessionDate(iso: string): string {
  const date = parseIsoDate(iso);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
  return `${weekday} ${date.getDate()} ${month}`;
}

/** `2026-09-15` → `Tue` */
export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(parseIsoDate(iso));
}
