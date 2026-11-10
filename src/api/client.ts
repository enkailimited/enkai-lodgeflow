/**
 * Browser API client.
 *
 * Every call sends the session cookie. Errors preserve the backend code and
 * field errors so forms can show real validation messages instead of guessing.
 */

export interface ApiFieldErrors {
  [field: string]: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldErrors;
  readonly detail?: string;

  constructor(status: number, code: string, message: string, fieldErrors: ApiFieldErrors = {}, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.detail = detail;
  }
}

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

const ELEVATION_KEY = 'lodge_elevated_tenant';

/**
 * Platform administrators can only read a tenant workspace after explicitly
 * naming it. The chosen tenant is kept in sessionStorage and sent on reads as
 * `x-tenant-id`; the backend still audits and enforces read-only elevation.
 */
export function getElevatedTenantId(): string | null {
  try {
    return sessionStorage.getItem(ELEVATION_KEY);
  } catch {
    return null;
  }
}

export function setElevatedTenantId(tenantId: string | null): void {
  try {
    if (tenantId) sessionStorage.setItem(ELEVATION_KEY, tenantId);
    else sessionStorage.removeItem(ELEVATION_KEY);
  } catch {
    /* Storage can be unavailable; elevation then simply stays off. */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const elevation = getElevatedTenantId();
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(elevation && (init.method ?? 'GET') === 'GET' ? { 'x-tenant-id': elevation } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = body?.error ?? {};
    throw new ApiError(
      response.status,
      error.code ?? 'REQUEST_FAILED',
      error.message ?? 'The request failed.',
      error.fieldErrors ?? {},
      error.detail
    );
  }

  return (body as Envelope<T>).data;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
