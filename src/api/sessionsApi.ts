import { del, get, post, type ApiResponse } from "./client";
import type { HoldSeatInput, SeatHold, SeatMap } from "../types/seat";
import type { FilterOptions, Session, SessionFilters, SessionsPage } from "../types/session";

/** Fetch once at boot and cache; source of truth for every filter list and booking limit. */
export async function getFilterOptions(signal?: AbortSignal): Promise<FilterOptions> {
  const { data } = await get<ApiResponse<FilterOptions>>("/filter-options", { signal });
  return data;
}

/** Paginated by films (10 per page), not sessions. Returns `data` and `meta`. */
export function getSessions(filters: SessionFilters = {}, signal?: AbortSignal): Promise<SessionsPage> {
  return get<SessionsPage>("/sessions", { query: { ...filters }, signal });
}

export async function getSession(sessionId: number, signal?: AbortSignal): Promise<Session> {
  const { data } = await get<ApiResponse<Session>>(`/sessions/${sessionId}`, { signal });
  return data;
}

/** Public; with a token, seats in the user's own live hold come back with `isMine: true`. */
export async function getSeatMap(sessionId: number, signal?: AbortSignal): Promise<SeatMap> {
  const { data } = await get<ApiResponse<SeatMap>>(`/sessions/${sessionId}/seats`, { signal });
  return data;
}

/** Replaces any previous hold of this user on the same session. */
export async function holdSeats(sessionId: number, seats: HoldSeatInput[]): Promise<SeatHold> {
  const { data } = await post<ApiResponse<SeatHold>>(`/sessions/${sessionId}/holds`, { seats });
  return data;
}

/** An expired hold still resolves, with `isLive: false`; an unknown one is a 404. */
export async function getHold(holdId: string, signal?: AbortSignal): Promise<SeatHold> {
  const { data } = await get<ApiResponse<SeatHold>>(`/holds/${encodeURIComponent(holdId)}`, { signal });
  return data;
}

export async function releaseHold(holdId: string): Promise<void> {
  await del<void>(`/holds/${encodeURIComponent(holdId)}`);
}
