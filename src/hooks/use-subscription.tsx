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
  refresh: (opts?: { silent?: boolean }) => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!user) {
        setStatus(DEFAULT_STATUS);
        setLoading(false);
        loadedOnce.current = false;
        return;
      }
      const silent = opts?.silent === true;
      if (!silent) {
        if (!loadedOnce.current) setLoading(true);
        else setIsRefreshing(true);
      }

      fetch('/api/subscription')
        .then((r) => r.json())
        .then((data) => setStatus(data))
        .catch(() => setStatus(DEFAULT_STATUS))
        .finally(() => {
          loadedOnce.current = true;
          setLoading(false);
          setIsRefreshing(false);
        });
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setStatus(DEFAULT_STATUS);
      setLoading(false);
      loadedOnce.current = false;
      return;
    }
    load();
  }, [user, load]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('subscription') !== 'success' && q.get('billing') !== 'return') return;
    const t = window.setTimeout(() => load({ silent: true }), 400);
    const t2 = window.setTimeout(() => load({ silent: true }), 1800);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [user, load]);

  // Al volver a la pestaña, sincroniza suscripción sin bloquear la UI
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
      window.location.href = data.url;
      return {};
    }
    if (res.ok && data.ok) {
      load({ silent: true });
      return typeof data.message === 'string' ? { message: data.message } : {};
    }
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
      load({ silent: true });
      return { message: data.message as string };
    }
    return { error: data.error || 'No se pudo cancelar.' };
  }, [load]);

  const resumeSubscription = useCallback(async () => {
    const res = await fetch('/api/billing/resume', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.ok) {
      load({ silent: true });
      return { message: data.message as string };
    }
    return { error: data.error || 'No se pudo reactivar.' };
  }, [load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

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
