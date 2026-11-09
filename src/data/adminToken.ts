/**
 * ENKAI LODGEFLOW — GATE 2.0
 * Session-scoped admin token used by the two destructive operations that are
 * enabled before D11 staff sessions exist: room deletion and local import.
 *
 * Stored in `sessionStorage` (never `localStorage`) so it disappears when the
 * tab closes and is not shared across browser restarts. It is never logged.
 */

const ADMIN_TOKEN_KEY = 'enkai-lodgeflow.admin-token';

let memoryToken = '';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function getAdminToken(): string {
  const store = storage();
  if (!store) return memoryToken;
  try {
    return store.getItem(ADMIN_TOKEN_KEY) ?? '';
  } catch {
    return memoryToken;
  }
}

export function setAdminToken(token: string): void {
  const trimmed = token.trim();
  memoryToken = trimmed;
  const store = storage();
  if (!store) return;
  try {
    if (trimmed) store.setItem(ADMIN_TOKEN_KEY, trimmed);
    else store.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Session storage can be unavailable; the in-memory copy still works.
  }
}

export function clearAdminToken(): void {
  setAdminToken('');
}

export function hasAdminToken(): boolean {
  return getAdminToken().length > 0;
}
