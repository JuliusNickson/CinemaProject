import { getCurrentUser } from "../api/authApi";
import { ApiError, clearToken, getToken } from "../api/client";
import { getFilterOptions } from "../api/sessionsApi";
import type { User } from "../types/auth";
import type { FilterOptions } from "../types/session";
import { createStore } from "./store";

interface AppState {
  user: User | null;
  /** Null until loaded, or if loading failed. */
  filterOptions: FilterOptions | null;
}

export const appState = createStore<AppState>({
  user: null,
  filterOptions: null,
});

export function setUser(user: User | null): void {
  appState.set({ user });
}

export function isLoggedIn(): boolean {
  return appState.get().user !== null;
}

async function restoreUser(): Promise<void> {
  if (!getToken()) return;

  try {
    setUser(await getCurrentUser());
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) clearToken();
    else console.error("Could not restore the session", error);
  }
}

async function loadFilterOptions(): Promise<void> {
  try {
    appState.set({ filterOptions: await getFilterOptions() });
  } catch (error) {
    console.error("Could not load filter options", error);
  }
}

/** Restores the signed in user and caches filter options. Never rejects. */
export async function bootstrap(): Promise<void> {
  await Promise.all([restoreUser(), loadFilterOptions()]);
}
