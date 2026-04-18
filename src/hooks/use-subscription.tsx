'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './use-auth';
import {
  clearSubscriptionSessionCache,
  readSubscriptionSessionCache,
  writeSubscriptionSessionCache,
} from '@/lib/subscription-session-cache';

export interface SubscriptionStatus {
  hasAccess: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  /** True si existe suscripción enlazada en Stripe (hay `stripeSubscriptionId`). */
  hasStripeSubscription: boolean;
  subscription: {
    status: string;
    plan: string;
    currentPeriodEnd: number;
    /** Stripe: inicio del periodo de facturación (epoch segundos) */
    currentPeriodStart?: number;
    /** Stripe: `subscription.created` (epoch segundos) */
    stripeSubscriptionCreated?: number;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    cancelAtPeriodEnd?: boolean;
  } | null;
}

const DEFAULT_STATUS: SubscriptionStatus = {
  hasAccess: false,
  isPremium: false,
  isTrialActive: false,
  trialDaysRemaining: 0,
  hasStripeSubscription: false,
  subscription: null,
};

export type SubscriptionContextValue = SubscriptionStatus & {
  loading: boolean;
  /** Recarga en segundo plano (no bloquea la UI con pantalla de carga) */
  isRefreshing: boolean;
  /** Suscripción nueva (Checkout) o cambio de plan con proration si ya hay suscripción en Stripe */
  startCheckout: (plan: string) => Promise<{ error?: string; message?: string } | Record<string, never>>;
  openBillingPortal: () => Promise<{ error?: string } | Record<string, never>>;
  cancelSubscription: (atPeriodEnd?: boolean) => Promise<{ error?: string; message?: string }>;
  resumeSubscription: () => Promise<{ error?: string; message?: string }>;
  /** `force` ignora caché y vuelve a pedir al servidor (tras checkout, facturación, botón actualizar). */
  refresh: (opts?: { silent?: boolean; force?: boolean }) => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(
    (opts?: { silent?: boolean; force?: boolean }) => {
      const uid = user?.uid;
      if (!uid) {
        setStatus(DEFAULT_STATUS);
        setLoading(false);
        loadedOnce.current = false;
        return;
      }
      const silent = opts?.silent === true;
      const force = opts?.force === true;

      if (!force) {
        const cached = readSubscriptionSessionCache(uid);
        if (cached && !cached.stale) {
          setStatus(cached.data as SubscriptionStatus);
          setLoading(false);
          setIsRefreshing(false);
          loadedOnce.current = true;
          return;
        }
      }

      if (!silent) {
        if (!loadedOnce.current) setLoading(true);
        else setIsRefreshing(true);
      }

      fetch('/api/subscription')
        .then(async (r) => {
          const data = (await r.json()) as SubscriptionStatus & { error?: string };
          if (!r.ok || (data && typeof data.error === 'string' && data.error)) {
            setStatus(DEFAULT_STATUS);
            return;
          }
          setStatus(data);
          writeSubscriptionSessionCache(uid, data);
        })
        .catch(() => setStatus(DEFAULT_STATUS))
        .finally(() => {
          loadedOnce.current = true;
          setLoading(false);
          setIsRefreshing(false);
        });
    },
    [user?.uid],
  );

  useEffect(() => {
    if (!user) {
      clearSubscriptionSessionCache();
      setStatus(DEFAULT_STATUS);
      setLoading(false);
      loadedOnce.current = false;
      return;
    }
    load();
  }, [user?.uid, load]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('subscription') !== 'success' && q.get('billing') !== 'return') return;
    const t = window.setTimeout(() => load({ silent: true, force: true }), 400);
    const t2 = window.setTimeout(() => load({ silent: true, force: true }), 1800);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [user, load]);

  // Al volver a la pestaña: solo red si la caché está caducada (load sin force usa sessionStorage)
  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, load]);

  const startCheckout = useCallback(async (plan: string) => {
    const res = await fetch('/api/billing/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) {
      try {
        const checkoutUrl = new URL(String(data.url));
        console.info('[Paddle][Checkout] Redirecting to checkout URL', {
          plan,
          host: checkoutUrl.host,
          path: checkoutUrl.pathname,
        });
        if (checkoutUrl.host.includes('sandbox') && window.location.hostname !== 'localhost') {
          console.warn(
            '[Paddle][Checkout] Estás redirigiendo a sandbox fuera de localhost. Revisa variables de entorno de producción.',
          );
        }
      } catch {
        console.warn('[Paddle][Checkout] No se pudo parsear checkout URL', { plan });
      }
      window.location.href = data.url;
      return {};
    }
    if (res.ok && data.ok) {
      load({ silent: true, force: true });
      return typeof data.message === 'string' ? { message: data.message } : {};
    }
    console.error('[Paddle][Checkout] API /api/billing/plan falló', {
      plan,
      status: res.status,
      error: data?.error || 'Sin detalle',
    });
    return { error: data.error || 'Error al procesar el plan.' };
  }, [load]);

  const openBillingPortal = useCallback(async () => {
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
      return {};
    }
    return { error: data.error || 'No se pudo abrir el portal de facturación.' };
  }, []);

  const cancelSubscription = useCallback(async (atPeriodEnd = true) => {
    const res = await fetch('/api/billing/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atPeriodEnd }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      load({ silent: true, force: true });
      return { message: data.message as string };
    }
    return { error: data.error || 'No se pudo cancelar.' };
  }, [load]);

  const resumeSubscription = useCallback(async () => {
    const res = await fetch('/api/billing/resume', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.ok) {
      load({ silent: true, force: true });
      return { message: data.message as string };
    }
    return { error: data.error || 'No se pudo reactivar.' };
  }, [load]);

  const refresh = useCallback(
    (opts?: { silent?: boolean; force?: boolean }) =>
      load({ silent: opts?.silent !== false, force: opts?.force !== false }),
    [load],
  );

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ...status,
      loading,
      isRefreshing,
      startCheckout,
      openBillingPortal,
      cancelSubscription,
      resumeSubscription,
      refresh,
    }),
    [status, loading, isRefreshing, startCheckout, openBillingPortal, cancelSubscription, resumeSubscription, refresh],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription debe usarse dentro de <SubscriptionProvider>');
  }
  return ctx;
}
