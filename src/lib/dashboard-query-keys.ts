/** Claves centralizadas para caché del dashboard (TanStack Query). */

export const dashboardKeys = {
  all: ['dashboard'] as const,
  inbox: (status: 'open' | 'resolved') => ['dashboard', 'inbox', status] as const,
  inboxThread: (sessionId: string) => ['dashboard', 'inbox', 'thread', sessionId] as const,
  inboxCount: () => ['dashboard', 'inbox', 'count'] as const,
  conversations: (status: 'active' | 'all' | 'ended') => ['dashboard', 'conversations', status] as const,
  conversationThread: (sessionId: string) => ['dashboard', 'conversations', 'thread', sessionId] as const,
  webhookDeliveries: (status: 'todas' | 'fallidas') =>
    ['dashboard', 'webhook-deliveries', status] as const,
  agents: () => ['dashboard', 'agents'] as const,
  widgets: () => ['dashboard', 'widgets'] as const,
};
