export type FlowNodeType =
  | 'start'
  | 'text'
  | 'multiple_choice'
  | 'number'
  | 'email'
  | 'phone'
  | 'condition'
  | 'end'
  | 'calendar_booking'
  | 'calendly_booking';

export type FlowConnectionHandle = 'output' | `option:${number}`;

export interface FlowNodeOption {
  label: string;
  value: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  question?: string;
  options?: FlowNodeOption[];
}

export interface FlowConnection {
  id: string;
  fromNodeId: string;
  fromHandle: FlowConnectionHandle;
  toNodeId: string;
}

export interface FlowSettings {
  description: string;
  tags: string;
  generatesLeads: boolean;
  enabledChannels: string[];
  completionMessage: string;
  tooltipEnabled: boolean;
  tooltipMessage: string;
  tooltipDelay: number;
  tooltipDuration: number;
}

export interface FlowStats {
  totalConversations: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgDurationSec: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
}

export interface FlowDocument {
  id: string;
  userId: string;
  workspaceId: string;
  orgId: string | null;
  name: string;
  description: string;
  tags: string;
  embedToken: string | null;
  status: 'draft' | 'published';
  settings: FlowSettings;
  nodes: FlowNode[];
  connections: FlowConnection[];
  stepCount: number;
  stats: FlowStats;
  createdAt: string;
  updatedAt: string;
}

export interface FlowListItem {
  id: string;
  name: string;
  description: string;
  tags: string;
  status: 'draft' | 'published';
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}
