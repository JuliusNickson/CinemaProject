export const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL ?? "https://api.kinoxii.redberryinternship.ge/api"
).replace(/\/+$/, "");

// Auth token

const TOKEN_STORAGE_KEY = "kinoxii.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

type UnauthorizedHandler = (error: ApiError) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Called on any 401 from a request that carried a token, after the token is cleared. */
export function onUnauthorized(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

// Errors

export type ValidationErrors = Record<string, string[]>;

interface ErrorBody {
  message?: string;
  errors?: ValidationErrors;
  contested?: string[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: ValidationErrors;
  readonly contested?: string[];

  constructor(status: number, body: ErrorBody | null, fallbackMessage: string) {
    super(body?.message ?? fallbackMessage);
    this.name = "ApiError";
    this.status = status;
    this.errors = body?.errors;
    this.contested = body?.contested;
  }

  /** The request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** 422 with field `errors`. */
  get isValidationError(): boolean {
    return this.status === 422 && this.errors !== undefined;
  }

  /** 422 with only a `message`, meant to be shown to the user as is. */
  get isRuleViolation(): boolean {
    return this.status === 422 && this.errors === undefined;
  }
}

// Query parameters and bodies

type QueryScalar = string | number | boolean;
export type QueryParams = Record<string, QueryScalar | QueryScalar[] | null | undefined>;

/** Arrays are serialised as `key[]=a&key[]=b`; empty values are skipped. */
export function buildQuery(params: QueryParams = {}): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      for (const item of value) search.append(`${key}[]`, String(item));
    } else {
      search.append(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

type FormValue = string | number | boolean | Blob | null | undefined;

/** `undefined` fields are skipped, `null` is sent as an empty string. */
export function toFormData(fields: Record<string, FormValue>): FormData {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value instanceof Blob) form.append(key, value);
    else form.append(key, value === null ? "" : String(value));
  }

  return form;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Requests

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions {
  query?: QueryParams;
  signal?: AbortSignal;
  /** Skip the global 401 handling, e.g. where a 401 means wrong credentials. */
  skipUnauthorizedHandler?: boolean;
}

/** Plain objects are sent as JSON, `FormData` as multipart. */
export async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { query, signal, skipUnauthorizedHandler = false } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: payload,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, null, "Could not reach the server. Check your connection and try again.");
  }

  const data = await parseBody(response);

  if (!response.ok) {
    const error = new ApiError(response.status, data as ErrorBody | null, response.statusText || "Request failed");

    if (error.isUnauthorized && token && !skipUnauthorizedHandler) {
      clearToken();
      unauthorizedHandler?.(error);
    }

    throw error;
  }

  return data as T;
}

export function get<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

export function post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>("POST", path, body, options);
}

export function put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>("PUT", path, body, options);
}

/** `delete` is a reserved word. */
export function del<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, options);
}

/** Response body shape of endpoints that wrap their payload. */
export interface ApiResponse<T> {
  data: T;
}
