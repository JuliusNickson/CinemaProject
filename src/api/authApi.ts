import { clearToken, get, post, setToken, toFormData, type ApiResponse } from "./client";
import type { AuthResult, LoginPayload, RegisterPayload, User } from "../types/auth";

/** Creates the account and signs the user in; the token is stored automatically. */
export async function register(payload: RegisterPayload): Promise<AuthResult> {
  const { data } = await post<ApiResponse<AuthResult>>("/register", toFormData({ ...payload }));
  setToken(data.token);
  return data;
}

/** A 401 here means wrong credentials, not an expired session. */
export async function login(payload: LoginPayload): Promise<AuthResult> {
  const { data } = await post<ApiResponse<AuthResult>>("/login", payload, { skipUnauthorizedHandler: true });
  setToken(data.token);
  return data;
}

/** Revokes the current token; the stored token is cleared even if the request fails. */
export async function logout(): Promise<void> {
  try {
    await post<void>("/logout", undefined, { skipUnauthorizedHandler: true });
  } finally {
    clearToken();
  }
}

/** A 401 means the stored token is stale; treat the user as a guest. */
export async function getCurrentUser(signal?: AbortSignal): Promise<User> {
  const { data } = await get<ApiResponse<User>>("/me", { signal, skipUnauthorizedHandler: true });
  return data;
}
