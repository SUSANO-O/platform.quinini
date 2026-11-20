'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/hooks/use-subscription';
import { canUseApiAccess } from '@/lib/plan-catalog';
import {
  getAgentflowApiDocsUrl,
  getAgentflowApiUrl,
  resolveAgentflowApiUrl,
} from '@/lib/agentflow-api-url';
import { ApiDocsPageSkeleton, ApiDocsView } from '@/components/dashboard/api-docs-view';
import type { ApiServiceStatus } from '@/components/dashboard/api-release-modal';

export default function DashboardApiPage() {
  const router = useRouter();
  const { subscription, loading } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const status = subscription?.status ?? 'free';
  const hasAccess = canUseApiAccess(plan, status, subscription?.features);
  const [apiBase, setApiBase] = useState(() => getAgentflowApiUrl());
  const [docsUrl, setDocsUrl] = useState(() => getAgentflowApiDocsUrl());
  const [apiStatus, setApiStatus] = useState<ApiServiceStatus>('checking');
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [statusHelpOpen, setStatusHelpOpen] = useState(false);
  const [retryingStatus, setRetryingStatus] = useState(false);

  useEffect(() => {
    if (!loading && !hasAccess) {
      router.replace('/dashboard');
    }
  }, [loading, hasAccess, router]);

  useEffect(() => {
    const base = resolveAgentflowApiUrl({
      landingHostname: window.location.hostname,
    });
    setApiBase(base);
    setDocsUrl(`${base}/docs/`);
  }, []);

  const checkHealth = useCallback(async (): Promise<{ ok: boolean; version?: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${apiBase}/api/v1/health`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return { ok: false };
      const data = (await res.json()) as { version?: string };
      return { ok: true, version: typeof data.version === 'string' ? data.version : undefined };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    setApiStatus('checking');
    (async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        const health = await checkHealth();
        if (health.ok) {
          if (!cancelled) {
            setApiStatus('up');
            setApiVersion(health.version ?? null);
          }
          return;
        }
        if (attempt < 2 && !cancelled) await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setApiStatus('down');
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, checkHealth]);

  const retryHealth = useCallback(async () => {
    setApiStatus('checking');
    setRetryingStatus(true);
    const health = await checkHealth();
    setApiStatus(health.ok ? 'up' : 'down');
    setApiVersion(health.version ?? null);
    setRetryingStatus(false);
  }, [checkHealth]);

  if (loading) {
    return (
      <div className="p-4 md:p-6 w-full">
        <ApiDocsPageSkeleton />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-[1600px] mx-auto">
      <ApiDocsView
        apiBase={apiBase}
        docsUrl={docsUrl}
        apiStatus={apiStatus}
        apiVersion={apiVersion}
        releaseOpen={releaseOpen}
        statusHelpOpen={statusHelpOpen}
        retryingStatus={retryingStatus}
        onOpenRelease={() => setReleaseOpen(true)}
        onCloseRelease={() => setReleaseOpen(false)}
        onOpenStatusHelp={() => setStatusHelpOpen(true)}
        onCloseStatusHelp={() => setStatusHelpOpen(false)}
        onRetryHealth={retryHealth}
      />
    </div>
  );
}
