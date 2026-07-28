'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseAgentTabHash, writeWindowHash } from '@/lib/dashboard-url-hash';
import type { AgentDetailTabId } from '@/components/dashboard/agent-detail-tabs';

/** Sincroniza pestaña activa del editor de agente con `location.hash` (#reglas, #tools, …). */
export function useAgentDetailTab(
  visibleTabIds: readonly AgentDetailTabId[],
  defaultTab: AgentDetailTabId = 'general',
): [AgentDetailTabId, (id: AgentDetailTabId) => void] {
  const isVisible = useCallback(
    (id: AgentDetailTabId) => visibleTabIds.includes(id),
    [visibleTabIds],
  );

  const resolve = useCallback(
    (raw: string | null | undefined): AgentDetailTabId => {
      const parsed = parseAgentTabHash(raw);
      if (parsed && isVisible(parsed)) return parsed;
      return defaultTab;
    },
    [defaultTab, isVisible],
  );

  const [tab, setTabState] = useState<AgentDetailTabId>(defaultTab);

  useEffect(() => {
    setTabState(resolve(window.location.hash));
  }, [resolve]);

  useEffect(() => {
    if (!isVisible(tab)) {
      setTabState(defaultTab);
      writeWindowHash(defaultTab, defaultTab);
    }
  }, [tab, isVisible, defaultTab]);

  useEffect(() => {
    const onHashChange = () => {
      setTabState(resolve(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [resolve]);

  const setTab = useCallback(
    (id: AgentDetailTabId) => {
      if (!isVisible(id)) return;
      setTabState(id);
      writeWindowHash(id, defaultTab);
    },
    [defaultTab, isVisible],
  );

  return [tab, setTab];
}
