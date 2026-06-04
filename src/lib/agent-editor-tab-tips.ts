import type { AgentDetailTabId } from '@/components/dashboard/agent-detail-tabs';

export const AGENT_TAB_TIPS: Record<AgentDetailTabId, string> = {
  general: 'Nombre, modelo y system prompt definen la personalidad. Guarda para sincronizar con el hub.',
  rules: 'Las reglas de comportamiento se integran al prompt al guardar.',
  faqs: 'Las FAQ se añaden al contexto del agente en cada conversación.',
  tools: 'Herramientas MCP y nativas amplían lo que el agente puede hacer.',
  rag: 'Sube documentos o URLs para que el agente consulte tu conocimiento.',
  subagents: 'Delega subtareas a agentes especializados vinculados.',
  'scheduled-tasks': 'Programa recordatorios y ejecuciones automáticas con cron.',
  whatsapp: 'Conecta WhatsApp Business para atender por ese canal.',
};
