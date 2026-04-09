'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
  /** Email pendiente de confirmación por código (cambio de correo). */
  pendingEmail?: string | null;
  /** Sesión de admin viendo la cuenta de un cliente (suplantación). */
  impersonation?: { adminEmail: string; adminUid: string };
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string; user?: AuthUser }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ error?: string; user?: AuthUser }>;
  logout: () => Promise<void>;
  /** Recarga usuario desde la sesión (tras cambiar email o nombre en Ajustes). */
  refreshUser: () => Promise<void>;
  /** Termina suplantación y restaura sesión de admin (solo con impersonation activa). */
  stopImpersonating: () => Promise<{ ok: boolean }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({}),
  register: async () => ({}),
  logout: async () => {},
  refreshUser: async () => {},
  stopImpersonating: async () => ({ ok: false }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const r = await fetch('/api/auth');
      const data = await r.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    }
  }, []);

  // Hydrate from API (reads session cookie)
  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((data) => {
        setUser(data.user || null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Error al iniciar sesión.' };
    setUser(data.user);
    return { user: data.user as AuthUser };
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Error al registrarse.' };
    setUser(data.user);
    return { user: data.user as AuthUser };
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    setUser(null);
  }, []);

  const stopImpersonating = useCallback(async () => {
    const res = await fetch('/api/admin/stop-impersonate', { method: 'POST' });
    if (!res.ok) return { ok: false };
    await refreshUser();
    return { ok: true };
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, stopImpersonating }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  return { user, loading };
}
