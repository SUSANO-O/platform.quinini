export type FlowNodeType =
  | 'start'
  | 'text'
  | 'multiple_choice'
  | 'number'
  | 'email'
  | 'phone'
  | 'message'
  | 'delay'
  | 'set_variable'
  | 'goto'
  | 'random'
  | 'condition'
  | 'end'
  | 'calendar_booking'
  | 'calendly_booking';

export type FlowConnectionHandle = 'output' | 'true' | 'false' | `option:${number}`;

export interface FlowNodeOption {
  label: string;
  value: string;
}

export type FlowConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'contains'
  | 'empty'
  | 'not_empty';

/** Ajustes por nodo — se guardan en Mongo (Mixed) y se usan en runtime del widget. */
export interface FlowNodeConfig {
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  /** Clave con la que se guarda la respuesta (para condiciones). */
  variableKey?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Condición */
  sourceVariable?: string;
  operator?: FlowConditionOperator;
  compareValue?: string;
  /** Reservas */
  bookingUrl?: string;
  durationMinutes?: number;
  timezone?: string;
  /** Fin / CTA */
  buttonLabel?: string;
  redirectUrl?: string;
  /** Opción múltiple */
  randomizeOptions?: boolean;
  /** Mensaje: continuar automático sin botón */
  autoContinue?: boolean;
  /** Espera (ms) */
  delayMs?: number;
  /** set_variable: valor a guardar */
  setValue?: string;
  /** goto: id del nodo destino (vacío = reiniciar en start) */
  targetNodeId?: string;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  x: number;
  y: number;
  question?: string;
  options?: FlowNodeOption[];
  config?: FlowNodeConfig;
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

export type FlowConversationItem = {
  sessionId: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  messageCount: number;
  visitorId: string;
};
