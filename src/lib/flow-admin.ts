import type { FlowNode } from '@/lib/flow-editor/types';
import {
  canUseConversationFlows,
  effectiveProductPlan,
} from '@/lib/plan-catalog';

/** Máximo de flujos por plan (-1 = ilimitado). Solo aplica si canUseConversationFlows. */
export const FLOW_LIMITS_BY_PLAN: Record<string, number> = {
  free: 0,
  solo: 0,
  api_develop: 0,
  team: 0,
  plus: 10,
  business: -1,
  enterprise: -1,
};

export function flowLimitForPlan(
  plan: string,
  status = 'active',
  subscriptionFeatures?: string[] | null,
): number {
  const effective = effectiveProductPlan(plan, status);
  if (!canUseConversationFlows(plan, status, subscriptionFeatures)) return 0;
  return FLOW_LIMITS_BY_PLAN[effective] ?? 0;
}

export function parseFlowTags(tags: string): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function countFlowSteps(nodes: FlowNode[]): number {
  return nodes.filter((n) => n.type !== 'start').length;
}

export function flowStatusLabel(status: 'draft' | 'published'): string {
  return status === 'published' ? 'Activo' : 'Borrador';
}

export function buildFlowEmbedSnippet(opts: {
  origin: string;
  flowId: string;
  embedToken: string;
  widgetToken?: string | null;
}): string {
  const { origin, flowId, embedToken, widgetToken } = opts;
  const wt = widgetToken?.trim() ? ` data-token="${widgetToken.trim()}"` : '';
  return [
    `<!-- BotIvA Flow Widget -->`,
    `<script${wt} data-flow-id="${flowId}" data-flow-token="${embedToken}" src="${origin}/widget.js"></script>`,
  ].join('\n');
}

export const SUPPORT_TICKET_META = {
  name: 'Support Ticket',
  description:
    'Streamline support requests by categorizing issues, assessing urgency, and collecting detailed information to route tickets to the appropriate team.',
  tags: 'support, help, ticket, urgency, email',
};

export type FlowStats = {
  totalConversations: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgDurationSec: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
};

export const EMPTY_FLOW_STATS: FlowStats = {
  totalConversations: 0,
  completed: 0,
  abandoned: 0,
  completionRate: 0,
  avgDurationSec: 0,
  totalMessages: 0,
  avgMessagesPerConversation: 0,
};
