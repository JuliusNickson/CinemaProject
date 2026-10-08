import type { FilterOptions, SessionFilters, SessionSort, TimeBand } from "../types/session";
import type { Format } from "../types/venue";
import { isIsoDate, todayIso } from "../utils/date";

export interface SessionsQuery {
  /** `YYYY-MM-DD` */
  date: string;
  venues: string[];
  formats: string[];
  languages: string[];
  bands: TimeBand[];
  sort: SessionSort;
  page: number;
}

export type SessionsFilterKey = "venues" | "formats" | "languages" | "bands";

export const DEFAULT_SORT: SessionSort = "time_asc";

/** URL parameter names, matching the spec: `?venue=a,b&date=…&format=…&sort=…&page=2`. */
const PARAMS = {
  venues: "venue",
  formats: "format",
  languages: "language",
  bands: "time",
  date: "date",
  sort: "sort",
  page: "page",
} as const;

function readList(params: URLSearchParams, key: string, allowed: readonly string[]): string[] {
  const values = (params.get(key) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].filter((value) => allowed.includes(value));
}

/** Formats offered by the selected venues, or every format when none is selected. */
export function availableFormats(options: FilterOptions, venues: string[]): Format[] {
  if (venues.length === 0) return options.formats;

  const slugs = new Set(
    options.venues.filter((venue) => venues.includes(venue.slug)).flatMap((venue) => venue.formats.map((f) => f.slug)),
  );
  return options.formats.filter((format) => slugs.has(format.slug));
}

/** Reads the URL, dropping anything the API would reject. */
export function parseSessionsQuery(params: URLSearchParams, options: FilterOptions): SessionsQuery {
  const venues = readList(params, PARAMS.venues, options.venues.map((venue) => venue.slug));
  const date = params.get(PARAMS.date) ?? "";
  const sort = params.get(PARAMS.sort) as SessionSort | null;
  const page = Number(params.get(PARAMS.page));

  return {
    date: isIsoDate(date) && date >= todayIso() ? date : todayIso(),
    venues,
    formats: readList(params, PARAMS.formats, availableFormats(options, venues).map((format) => format.slug)),
    languages: readList(params, PARAMS.languages, options.languages.map((language) => language.slug)),
    bands: readList(params, PARAMS.bands, options.timeBands.map((band) => band.id)) as TimeBand[],
    sort: sort && options.sorts.some((option) => option.id === sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** `/sessions?…` for a query; defaults are left out to keep links short. */
export function sessionsUrl(query: SessionsQuery): string {
  const params = new URLSearchParams();

  (["venues", "formats", "languages", "bands"] as const).forEach((key) => {
    if (query[key].length > 0) params.set(PARAMS[key], query[key].join(","));
  });
  if (query.date !== todayIso()) params.set(PARAMS.date, query.date);
  if (query.sort !== DEFAULT_SORT) params.set(PARAMS.sort, query.sort);
  if (query.page > 1) params.set(PARAMS.page, String(query.page));

  const search = params.toString().replace(/%2C/g, ",");
  return search ? `/sessions?${search}` : "/sessions";
}

export function toApiFilters(query: SessionsQuery): SessionFilters {
  return {
    date: query.date,
    venues: query.venues,
    formats: query.formats,
    languages: query.languages,
    bands: query.bands,
    sort: query.sort,
    page: query.page,
  };
}

/** Selected checkboxes; the date is always set, so it does not count. */
export function countActiveFilters(query: SessionsQuery): number {
  return query.venues.length + query.formats.length + query.languages.length + query.bands.length;
}

/** Toggles one checkbox value and returns to the first page. */
export function toggleFilter(
  query: SessionsQuery,
  key: SessionsFilterKey,
  value: string,
  options: FilterOptions,
): SessionsQuery {
  const current: string[] = query[key];
  const values = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  const next = { ...query, [key]: values, page: 1 } as SessionsQuery;

  if (key === "venues") {
    const allowed = availableFormats(options, next.venues).map((format) => format.slug);
    next.formats = next.formats.filter((format) => allowed.includes(format));
  }
  return next;
}

/** Clears every filter except the date. */
export function clearFilters(query: SessionsQuery): SessionsQuery {
  return { ...query, venues: [], formats: [], languages: [], bands: [], page: 1 };
}
