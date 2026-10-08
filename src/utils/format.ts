/** `24` → `₾ 24`, `14.5` → `₾ 14.50`; `spaced: false` gives `₾24`. */
export function formatPrice(amount: number, { spaced = true }: { spaced?: boolean } = {}): string {
  return `₾${spaced ? " " : ""}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/** `128` → `2h 8m`, `45` → `45m` */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const SHORT_LANGUAGE_NAMES: Record<string, string> = {
  "georgian-subtitles": "Georgian Sub",
  "original-subtitles": "Original + Subtitles",
};

/** Compact language label used on filters and session cards. */
export function formatLanguage(language: { slug: string; name: string }): string {
  return SHORT_LANGUAGE_NAMES[language.slug] ?? language.name;
}

/** `Morning (before 12:00)` → `{ name: "Morning", hint: "before 12:00" }` */
export function splitTimeBandLabel(label: string): { name: string; hint: string | null } {
  const match = /^(.*?)\s*\((.*)\)$/.exec(label);
  return match ? { name: match[1], hint: match[2].replace(/\s*-\s*/, "–") } : { name: label, hint: null };
}

/** `("Thriller", 102)` → `Thriller · 102 min` */
export function formatGenreRuntime(genre: string | null | undefined, minutes: number): string {
  return genre ? `${genre} · ${minutes} min` : `${minutes} min`;
}
