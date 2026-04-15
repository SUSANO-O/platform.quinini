'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { McpConnectModal } from '@/components/mcp/mcp-connect-modal';
import { McpLandingConnectForm } from '@/components/mcp/mcp-landing-connect-form';

type InnerProps = {
  agentId: string;
  /** Plan de suscripción para filtrar integraciones MCP (mismo que en la página del agente). */
  plan?: string;
  readOnly: boolean;
  onConnected: () => void;
  onOpenToolsTab: () => void;
};

function AgentMcpOpenFromQueryInner({
  agentId,
  plan,
  readOnly,
  onConnected,
  onOpenToolsTab,
}: InnerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openMcp = searchParams.get('openMcp');
  const showModal = Boolean(openMcp?.trim()) && !readOnly;

  useEffect(() => {
    if (showModal) onOpenToolsTab();
  }, [showModal, onOpenToolsTab]);

  const close = useCallback(() => {
    router.replace(`/dashboard/agents/${agentId}`, { scroll: false });
  }, [router, agentId]);

  if (!showModal) return null;

  return (
    <McpConnectModal open title="Conectar integración MCP" onClose={close}>
      <McpLandingConnectForm
        landingAgentId={agentId}
        plan={plan}
        initialIntegrationKey={openMcp ?? undefined}
        onConnected={() => {
          onConnected();
          close();
        }}
      />
    </McpConnectModal>
  );
}

export function AgentMcpOpenFromQuery(props: InnerProps) {
  return (
    <Suspense fallback={null}>
      <AgentMcpOpenFromQueryInner {...props} />
    </Suspense>
  );
}
