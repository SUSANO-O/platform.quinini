/**
 * Mapa de capacidades por agente para triaje multi-agente.
 * Deriva señales desde lo que cada agente tiene configurado (MCP, skills, tools, crons, RAG),
 * ampliado con metadatos del catálogo de integraciones — sin reglas por widget ni por nombre de agente.
 */

import type { AgentSkillCatalogEntry, SkillConfigRow } from '@/lib/agent-skills-catalog';
import { normalizeAgentSkillsState } from '@/lib/agent-skills-catalog';
import type { LandingToolConfig } from '@/lib/aibackhub-sync';

export type CapabilityKind = 'mcp' | 'skill' | 'tool' | 'webhook' | 'cron' | 'rag' | 'vision';

export type AgentCapabilityItem = {
  kind: CapabilityKind;
  id: string;
  label: string;
  description?: string;
  /** Términos derivados de esta capacidad concreta del agente. */
  signals: string[];
};

export type AgentCapabilityProfile = {
  items: AgentCapabilityItem[];
  /** Texto compacto para triaje LLM. */
  summary: string;
  /** Señales aplanadas (sin duplicados) para scoring por keywords. */
  signals: string[];
};

/** Metadatos por integración MCP — qué temas cubre cuando un agente la tiene habilitada. */
const MCP_INTEGRATION_TOPICS: Record<string, { label: string; topics: string[] }> = {
  mongodb: {
    label: 'MongoDB',
    topics: ['base de datos', 'bases de datos', 'mongodb', 'mongo', 'colección', 'colecciones', 'consulta de datos'],
  },
  postgres: {
    label: 'PostgreSQL',
    topics: ['base de datos', 'postgresql', 'postgres', 'sql', 'tabla', 'tablas'],
  },
  hubspot: {
    label: 'HubSpot CRM',
    topics: ['crm', 'hubspot', 'contacto', 'contactos', 'lead', 'leads', 'pipeline'],
  },
  gmail: {
    label: 'Gmail',
    topics: ['correo', 'email', 'gmail', 'bandeja', 'enviar correo'],
  },
  google_calendar: {
    label: 'Google Calendar',
    topics: ['calendario', 'cita', 'agenda', 'reunión', 'evento'],
  },
  google_maps: {
    label: 'Google Maps',
    topics: ['mapa', 'ubicación', 'dirección', 'geolocalización'],
  },
  slack: {
    label: 'Slack MCP',
    topics: ['slack', 'canal', 'notificación'],
  },
  webSearch: {
    label: 'Búsqueda web',
    topics: ['buscar en internet', 'noticias', 'web', 'información actual'],
  },
};

const BUILTIN_TOOL_TOPICS: Record<string, { label: string; topics: string[] }> = {
  webhook: {
    label: 'Webhook HTTP',
    topics: ['webhook', 'api externa', 'integración http', 'llamar servicio'],
  },
  slack: {
    label: 'Slack',
    topics: ['slack', 'notificación', 'canal'],
  },
  'google-sheets': {
    label: 'Google Sheets',
    topics: ['hoja de cálculo', 'spreadsheet', 'excel', 'google sheets'],
  },
};

const CRON_ACTION_TOPICS: Record<string, string[]> = {
  webhook: ['tarea programada', 'cron', 'ejecutar webhook', 'automatización'],
  agent_run: ['tarea programada', 'cron', 'ejecutar agente', 'automatización'],
  chat_message: ['tarea programada', 'cron', 'mensaje programado', 'automatización'],
  email: ['tarea programada', 'cron', 'correo programado', 'automatización'],
};

export type AgentDocForCapabilities = {
  name?: string;
  description?: string;
  agentHubId?: string | null;
  enabledMcpToolIds?: string[];
  enabledToolIds?: string[];
  tools?: LandingToolConfig[];
  skills?: string[];
  skillsConfig?: Array<{
    id?: string;
    name?: string;
    enabled?: boolean;
    config?: { active_tools?: string[]; prompt_extension?: string };
  }>;
  ragEnabled?: boolean;
  vision?: { enabled?: boolean };
};

export type ScheduledTaskSummary = {
  name: string;
  actionType: string;
  enabled: boolean;
};

function uniqueSignals(parts: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const raw of parts) {
    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s.length >= 3) out.add(s);
  }
  return [...out];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:/\-–—_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function stemsMatch(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return false;
  const n = Math.min(6, a.length, b.length);
  return a.slice(0, n) === b.slice(0, n);
}

function parseMcpToolId(toolId: string): { integration: string; tool: string } | null {
  const parts = toolId.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts[0] !== 'mcp' || parts.length < 2) return null;
  return { integration: parts[1], tool: parts[2] ?? '' };
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').trim();
}

function appendMcpCapabilities(toolIds: string[], items: AgentCapabilityItem[]): void {
  const byIntegration = new Map<string, Set<string>>();

  for (const raw of toolIds) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const parsed = parseMcpToolId(raw.trim());
    if (!parsed) continue;
    const set = byIntegration.get(parsed.integration) ?? new Set<string>();
    if (parsed.tool) set.add(parsed.tool);
    byIntegration.set(parsed.integration, set);
  }

  for (const [integration, tools] of byIntegration) {
    const meta = MCP_INTEGRATION_TOPICS[integration];
    const label = meta?.label ?? humanizeKey(integration);
    const signals = uniqueSignals([
      integration,
      humanizeKey(integration),
      label,
      ...(meta?.topics ?? []),
      ...[...tools],
      ...[...tools].map((t) => humanizeKey(t)),
    ]);
    items.push({
      kind: 'mcp',
      id: integration,
      label,
      signals,
    });
  }
}

function appendSkillCapabilities(
  catalog: AgentSkillCatalogEntry[],
  agent: AgentDocForCapabilities,
  items: AgentCapabilityItem[],
): void {
  const rows = normalizeAgentSkillsState(
    catalog,
    agent.skills,
    agent.skillsConfig as SkillConfigRow[] | undefined,
  );
  const catalogMap = new Map(catalog.map((s) => [s.id, s]));

  for (const row of rows) {
    if (row.enabled === false) continue;
    const entry = catalogMap.get(row.id);
    const label = row.name?.trim() || entry?.label || row.id;
    const description = entry?.description ?? '';
    const activeTools = [
      ...(entry?.config.active_tools ?? []),
      ...(row.config?.active_tools ?? []),
    ];
    const toolSignals = activeTools.flatMap((t) => {
      const parsed = parseMcpToolId(t);
      if (!parsed) return [t];
      const meta = MCP_INTEGRATION_TOPICS[parsed.integration];
      return [parsed.integration, parsed.tool, ...(meta?.topics ?? [])];
    });
    const promptExtension =
      typeof row.config?.prompt_extension === 'string' ? row.config.prompt_extension : '';
    const signals = uniqueSignals([
      row.id,
      label,
      description,
      promptExtension,
      ...tokenize(description),
      ...tokenize(label),
      ...tokenize(promptExtension),
      ...toolSignals,
    ]);
    items.push({
      kind: 'skill',
      id: row.id,
      label,
      description: description || undefined,
      signals,
    });
    appendMcpCapabilities(activeTools, items);
  }
}

function appendBuiltinTools(tools: LandingToolConfig[] | undefined, items: AgentCapabilityItem[]): void {
  if (!Array.isArray(tools)) return;

  for (const t of tools) {
    const toolId = typeof t?.toolId === 'string' ? t.toolId.trim() : '';
    if (!toolId) continue;

    if (toolId === 'webhook') {
      const webhooks = (t.config as { webhooks?: Array<{ name?: string; description?: string }> } | undefined)
        ?.webhooks;
      if (Array.isArray(webhooks)) {
        for (const wh of webhooks) {
          const name = typeof wh?.name === 'string' ? wh.name.trim() : '';
          const desc = typeof wh?.description === 'string' ? wh.description.trim() : '';
          if (!name && !desc) continue;
          items.push({
            kind: 'webhook',
            id: name || 'webhook',
            label: name || 'Webhook',
            description: desc || undefined,
            signals: uniqueSignals([name, desc, ...tokenize(name), ...tokenize(desc), ...(BUILTIN_TOOL_TOPICS.webhook?.topics ?? [])]),
          });
        }
      } else {
        const meta = BUILTIN_TOOL_TOPICS.webhook;
        items.push({
          kind: 'webhook',
          id: 'webhook',
          label: meta?.label ?? 'Webhook',
          signals: uniqueSignals([toolId, ...(meta?.topics ?? [])]),
        });
      }
      continue;
    }

    const meta = BUILTIN_TOOL_TOPICS[toolId];
    items.push({
      kind: 'tool',
      id: toolId,
      label: meta?.label ?? humanizeKey(toolId),
      signals: uniqueSignals([toolId, humanizeKey(toolId), ...(meta?.topics ?? [])]),
    });
  }
}

function appendCronCapabilities(tasks: ScheduledTaskSummary[], items: AgentCapabilityItem[]): void {
  for (const task of tasks) {
    if (!task.enabled) continue;
    const actionTopics = CRON_ACTION_TOPICS[task.actionType] ?? CRON_ACTION_TOPICS.agent_run;
    items.push({
      kind: 'cron',
      id: task.name,
      label: `Tarea: ${task.name}`,
      signals: uniqueSignals([
        task.name,
        ...tokenize(task.name),
        task.actionType,
        ...actionTopics,
        'tarea programada',
        'cron',
      ]),
    });
  }
}

export function buildAgentCapabilityProfile(params: {
  agent: AgentDocForCapabilities;
  skillCatalog: AgentSkillCatalogEntry[];
  scheduledTasks?: ScheduledTaskSummary[];
}): AgentCapabilityProfile {
  const items: AgentCapabilityItem[] = [];
  const agent = params.agent;

  const mcpIds = [
    ...(Array.isArray(agent.enabledMcpToolIds) ? agent.enabledMcpToolIds : []),
    ...(Array.isArray(agent.enabledToolIds) ? agent.enabledToolIds : []),
  ];
  appendMcpCapabilities(mcpIds, items);
  appendSkillCapabilities(params.skillCatalog, agent, items);
  appendBuiltinTools(agent.tools, items);
  appendCronCapabilities(params.scheduledTasks ?? [], items);

  if (agent.ragEnabled) {
    items.push({
      kind: 'rag',
      id: 'rag',
      label: 'Base de conocimiento (RAG)',
      signals: uniqueSignals([
        'rag',
        'documentos',
        'base de conocimiento',
        'archivos indexados',
        'conocimiento interno',
      ]),
    });
  }

  if (agent.vision?.enabled) {
    items.push({
      kind: 'vision',
      id: 'vision',
      label: 'Análisis de imágenes',
      signals: uniqueSignals(['imagen', 'foto', 'captura', 'vision', 'analizar imagen']),
    });
  }

  const name = (agent.name ?? '').trim();
  const description = (agent.description ?? '').trim();
  const hubId = (agent.agentHubId ?? '').trim();
  const baseSignals = uniqueSignals([
    name,
    description,
    hubId,
    humanizeKey(hubId),
    ...tokenize(name),
    ...tokenize(description),
  ]);

  const itemSignals = items.flatMap((i) => i.signals);
  const signals = uniqueSignals([...baseSignals, ...itemSignals]);

  const summaryParts = items.slice(0, 12).map((i) => {
    const desc = i.description ? ` (${i.description.slice(0, 80)})` : '';
    return `${i.kind}:${i.label}${desc}`;
  });

  const summary =
    summaryParts.length > 0
      ? summaryParts.join('; ')
      : [name, description].filter(Boolean).join(' — ') || 'sin capacidades registradas';

  return { items, summary, signals };
}

export function formatCapabilitySummaryForLlm(profile: AgentCapabilityProfile | undefined): string {
  if (!profile?.items.length) return profile?.summary ?? 'sin capacidades registradas';
  return profile.summary;
}

/** Puntúa qué tan bien el mensaje encaja con las capacidades reales del miembro del equipo. */
export function scoreMemberCapabilityMatch(
  message: string,
  member: {
    name: string;
    description: string;
    hubId?: string | null;
    role: 'orchestrator' | 'specialist';
    capabilities?: AgentCapabilityProfile;
  },
): number {
  const msg = message.toLowerCase();
  let score = 0;

  const name = member.name.trim().toLowerCase();
  if (name.length >= 4 && msg.includes(name)) score += 20;

  const hub = (member.hubId ?? '').trim().toLowerCase();
  if (hub.length >= 4 && (msg.includes(hub) || msg.includes(hub.replace(/-/g, ' ')))) score += 10;

  const profile = member.capabilities;
  if (profile) {
    const msgWords = tokenize(msg);
    for (const signal of profile.signals) {
      if (signal.length >= 4 && msg.includes(signal)) {
        score += signal.length >= 10 ? 8 : 5;
        continue;
      }
      if (signal.length >= 5 && msgWords.some((w) => stemsMatch(w, signal))) {
        score += 5;
      }
    }

    const msgTokens = new Set(tokenize(msg));
    for (const item of profile.items) {
      const blob = `${item.label} ${item.description ?? ''} ${item.signals.join(' ')}`.toLowerCase();
      if (item.label.length >= 4 && msg.includes(item.label.toLowerCase())) score += 8;
      for (const token of tokenize(blob)) {
        if (msgTokens.has(token)) score += 2;
        else if (token.length >= 5 && [...msgTokens].some((mt) => stemsMatch(mt, token))) score += 2;
      }
    }
  } else {
    const text = `${member.name} ${member.description}`.toLowerCase();
    for (const token of tokenize(text)) {
      if (msg.includes(token)) score += 2;
    }
  }

  if (member.role === 'orchestrator') score += 1;
  return score;
}
