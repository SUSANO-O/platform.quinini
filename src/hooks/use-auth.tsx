'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role: 'user' | 'admin';
  /** Si false, el usuario debe abrir el enlace del correo de verificaci?n antes de facturaci?n / ciertos cambios. */
  emailVerified?: boolean;
  /** Email pendiente de confirmaci?n por c?digo (cambio de correo). */
  pendingEmail?: string | null;
  /** Sesi?n de admin viendo la cuenta de un cliente (suplantaci?n). */
  impersonation?: { adminEmail: string; adminUid: string };
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, cfToken?: string) => Promise<{ error?: string; code?: string; user?: AuthUser; requires2FA?: boolean; tempToken?: string }>;
  complete2FA: (tempToken: string, code: string) => Promise<{ error?: string; user?: AuthUser }>;
  register: (email: string, password: string, displayName?: string, registrationCode?: string, cfToken?: string) => Promise<{ error?: string; user?: AuthUser }>;
  logout: () => Promise<void>;
  /** Recarga usuario desde la sesi?n (tras cambiar email o nombre en Ajustes). */
  refreshUser: () => Promise<void>;
  /** Termina suplantaci?n y restaura sesi?n de admin (solo con impersonation activa). */
  stopImpersonating: () => Promise<{ ok: boolean }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({}),
  complete2FA: async () => ({}),
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

  // Revalidar sesi?n al volver a la pesta?a (cookie expira a las 12 h)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshUser();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string, cfToken?: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password, cfToken }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'Error al iniciar sesi?n.', code: data.code as string | undefined };
    if (data.requires2FA) return { requires2FA: true, tempToken: data.tempToken as string };
    setUser(data.user);
    return { user: data.user as AuthUser };
  }, []);

  const complete2FA = useCallback(async (tempToken: string, code: string) => {
    const res = await fetch('/api/auth/2fa/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || 'C?digo incorrecto.' };
    setUser(data.user);
    return { user: data.user as AuthUser };
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string, registrationCode?: string, cfToken?: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', email, password, displayName, registrationCode, cfToken }),
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
    <AuthContext.Provider value={{ user, loading, login, complete2FA, register, logout, refreshUser, stopImpersonating }}>
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
