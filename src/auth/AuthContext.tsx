/**
 * Authenticated session context.
 *
 * The session lives in an httpOnly cookie, so the browser only ever holds the
 * user profile returned by /api/auth/me.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, apiGet, apiPost } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  tenantId: string | null;
  tenantName: string | null;
  currency: string;
  timezone: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
      setError(null);
    } catch (err) {
      setUser(null);
      if (err instanceof ApiError && err.status !== 401) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiPost<{ user: AuthUser }>('/api/auth/login', { email, password });
    setUser(data.user);
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, error, login, logout, refresh, can }),
    [user, loading, error, login, logout, refresh, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
