/** `24` → `₾ 24`, `14.5` → `₾ 14.50` */
export function formatPrice(amount: number): string {
  return `₾ ${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/** `128` → `2h 8m`, `45` → `45m` */
export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** `("Thriller", 102)` → `Thriller · 102 min` */
export function formatGenreRuntime(genre: string | null | undefined, minutes: number): string {
  return genre ? `${genre} · ${minutes} min` : `${minutes} min`;
}
