import { get, post, type ApiResponse } from "./client";
import type { Movie, MovieDetail, MovieWithSynopsis, NotifySubscription } from "../types/movie";
import type { VenueSessionsGroup } from "../types/session";

const moviePath = (slug: string) => `/movies/${encodeURIComponent(slug)}`;

export async function getNowPlaying(limit?: number, signal?: AbortSignal): Promise<MovieWithSynopsis[]> {
  const { data } = await get<ApiResponse<MovieWithSynopsis[]>>("/movies/now-playing", { query: { limit }, signal });
  return data;
}

export async function getComingSoon(limit?: number, signal?: AbortSignal): Promise<Movie[]> {
  const { data } = await get<ApiResponse<Movie[]>>("/movies/coming-soon", { query: { limit }, signal });
  return data;
}

export async function getFeatured(signal?: AbortSignal): Promise<MovieWithSynopsis[]> {
  const { data } = await get<ApiResponse<MovieWithSynopsis[]>>("/movies/featured", { signal });
  return data;
}

export async function getMovie(slug: string, signal?: AbortSignal): Promise<MovieDetail> {
  const { data } = await get<ApiResponse<MovieDetail>>(moviePath(slug), { signal });
  return data;
}

/** Sessions for one film on one date (`YYYY-MM-DD`, defaults to today), grouped by venue. */
export async function getMovieSessions(
  slug: string,
  date?: string,
  signal?: AbortSignal,
): Promise<VenueSessionsGroup[]> {
  const { data } = await get<ApiResponse<VenueSessionsGroup[]>>(`${moviePath(slug)}/sessions`, {
    query: { date },
    signal,
  });
  return data;
}

/** Subscribe to a coming soon title. Safe to call more than once. */
export async function notifyMe(slug: string): Promise<NotifySubscription> {
  const { data } = await post<ApiResponse<NotifySubscription>>(`${moviePath(slug)}/notify`);
  return data;
}

/** Header typeahead; at most 6 results, blank query returns []. Debounce before calling. */
export async function searchMovies(q: string, signal?: AbortSignal): Promise<Movie[]> {
  const { data } = await get<ApiResponse<Movie[]>>("/search", { query: { q }, signal });
  return data;
}
