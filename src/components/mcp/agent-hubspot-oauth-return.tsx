'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

type Props = {
  agentId: string;
  onOpenToolsTab: () => void;
  onHubspotOauthDone: (kind: 'ok' | 'partial' | 'err', detail?: string) => void;
};

function AgentHubspotOauthReturnInner({ onOpenToolsTab, onHubspotOauthDone }: Props) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const v = searchParams.get('hubspot_oauth');
    if (!v) return;
    const detail = searchParams.get('hubspot_oauth_detail') ?? undefined;
    onOpenToolsTab();
    if (v === 'ok' || v === 'partial' || v === 'err') {
      onHubspotOauthDone(v, detail);
    }
    const u = new URL(window.location.href);
    u.searchParams.delete('hubspot_oauth');
    u.searchParams.delete('hubspot_oauth_detail');
    const qs = u.searchParams.toString();
    window.history.replaceState({}, '', `${u.pathname}${qs ? `?${qs}` : ''}`);
  }, [searchParams, onOpenToolsTab, onHubspotOauthDone]);

  return null;
}

export function AgentHubspotOauthReturn(props: Props) {
  return (
    <Suspense fallback={null}>
      <AgentHubspotOauthReturnInner {...props} />
    </Suspense>
  );
}
