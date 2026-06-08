'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import {
  fetchAgentsList,
  fetchConversationsList,
  fetchInboxList,
  fetchWidgetsList,
} from '@/lib/dashboard-fetch';

/** Prefetch al hover en el sidebar — la vista siguiente abre con caché caliente. */
export function useDashboardPrefetch() {
  const qc = useQueryClient();

  return useCallback((href: string) => {
    switch (href) {
      case '/dashboard/inbox':
        void qc.prefetchQuery({
          queryKey: dashboardKeys.inbox('open'),
          queryFn: () => fetchInboxList('open'),
        });
        break;
      case '/dashboard/chats':
        void qc.prefetchQuery({
          queryKey: dashboardKeys.conversations('active'),
          queryFn: () => fetchConversationsList('active'),
        });
        break;
      case '/dashboard/agents':
        void qc.prefetchQuery({
          queryKey: dashboardKeys.agents(),
          queryFn: fetchAgentsList,
        });
        break;
      case '/dashboard/widgets':
        void qc.prefetchQuery({
          queryKey: dashboardKeys.widgets(),
          queryFn: fetchWidgetsList,
        });
        break;
      default:
        break;
    }
  }, [qc]);
}
