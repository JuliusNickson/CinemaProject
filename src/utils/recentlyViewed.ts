import type { AgeRatingCode, Movie } from "../types/movie";

export interface RecentlyViewedMovie {
  slug: string;
  title: string;
  posterUrl: string | null;
  genre: string | null;
  runtimeMinutes: number;
  ageRating: AgeRatingCode;
}

const STORAGE_KEY = "kinoxii.recentlyViewed";
const LIMIT = 4;

function isRecentlyViewedMovie(value: unknown): value is RecentlyViewedMovie {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.slug === "string" && typeof entry.title === "string" && typeof entry.runtimeMinutes === "number";
}

export function getRecentlyViewed(): RecentlyViewedMovie[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecentlyViewedMovie).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function addRecentlyViewed(movie: Movie): void {
  const entry: RecentlyViewedMovie = {
    slug: movie.slug,
    title: movie.title,
    posterUrl: movie.posterUrl,
    genre: movie.genres[0]?.name ?? null,
    runtimeMinutes: movie.runtimeMinutes,
    ageRating: movie.ageRating.code,
  };
  const rest = getRecentlyViewed().filter((item) => item.slug !== movie.slug);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...rest].slice(0, LIMIT)));
  } catch {
    // Storage can be full or disabled; the list is a convenience only.
  }
}
