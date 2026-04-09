'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from './use-subscription';
import { useAuth } from './use-auth';

/**
 * Gate that redirects to dashboard (upgrade prompt) if subscription is expired.
 * Returns { loading, hasAccess } for showing a spinner while checking.
 */
export function useRequireAccess() {
  const { user, loading: authLoading } = useAuth();
  const { hasAccess, isTrialActive, loading: subLoading } = useSubscription();
  const router = useRouter();

  const loading = authLoading || subLoading;
  const canAccess = hasAccess || isTrialActive;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    if (!canAccess) {
      router.push('/dashboard?subscription=expired');
    }
  }, [loading, user, canAccess, router]);

  return { loading, hasAccess: canAccess };
}
