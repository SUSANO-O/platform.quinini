/**
 * Mapa de capacidades por agente para triaje multi-agente.
 * Deriva señales desde lo que cada agente tiene configurado (MCP, skills, tools, crons, RAG),
 * ampliado con metadatos del catálogo de integraciones — sin reglas por widget ni por nombre de agente.
 */

import type { AgentSkillCatalogEntry, SkillConfigRow } from '@/lib/agent-skills-catalog';
import { normalizeAgentSkillsState } from '@/lib/agent-skills-catalog';
import type { LandingToolConfig } from '@/lib/aibackhub-sync';
import { extractAgentSheets } from '@/lib/agent-sheets';

export type CapabilityKind =
  | 'domain'
  | 'mcp'
  | 'skill'
  | 'tool'
  | 'webhook'
  | 'cron'
  | 'rag'
  | 'vision'
  | 'sheet';

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
  /** Rol / propósito extraído del prompt y descripción. */
  domainSummary: string;
  /** Texto compacto para triaje LLM (dominio + herramientas). */
  summary: string;
  /** Señales de dominio (prompt, descripción, skills de perfil). */
  domainSignals: string[];
  /** Señales técnicas (MCP, webhooks, crons). */
  toolSignals: string[];
  /** Alias de domainSignals — compatibilidad. */
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
    topics: [
      'hoja de cálculo',
      'spreadsheet',
      'excel',
      'google sheets',
      'inventario',
      'stock',
      'repuesto',
      'repuestos',
      'catálogo',
      'bodega',
      'disponibilidad',
      'referencia oem',
      'hoja de ventas',
    ],
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
  systemPrompt?: string;
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

/** Palabras genéricas de chat que no deben decidir el routing entre agentes. */
const TRIAGE_STOPWORDS = new Set([
  'sabes',
  'sabe',
  'hola',
  'como',
  'cómo',
  'puedo',
  'puede',
  'ayuda',
  'ayudar',
  'ayudarte',
  'quiero',
  'necesito',
  'tienes',
  'tiene',
  'algo',
  'sobre',
  'para',
  'mis',
  'muy',
  'bien',
  'gracias',
  'favor',
  'decir',
  'dime',
  'cuentame',
  'explica',
  'coneccion',
  'conexion',
  'conección',
  'tener',
  'tengo',
  'hacer',
  'eres',
  'eres',
  'estas',
  'estás',
  'puedes',
  'podrias',
  'podrías',
  'consulta',
  'pregunta',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:/\-–—_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function meaningfulMessageTokens(message: string): string[] {
  return tokenize(message).filter((t) => !TRIAGE_STOPWORDS.has(t));
}

function isWeakTriageSignal(signal: string): boolean {
  const s = signal.trim().toLowerCase();
  return s.length < 5 || TRIAGE_STOPWORDS.has(s);
}

function stemsMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const n = Math.min(5, a.length, b.length);
  return a.slice(0, n) === b.slice(0, n);
}

const TOOL_INTENT_PATTERN =
  /base de datos|bases de datos|mongodb|\bmongo\b|colecci[oó]n|webhook|\bcron\b|tarea programada|hubspot|\bslack\b|\bsql\b|listar bases|consulta(?:r)?\s+(?:a\s+)?(?:la\s+)?(?:base|mongo|datos)/i;

/** Consultas de mostrador / catálogo tabular (triaje). Sin marcas ni piezas de un cliente. */
const INVENTORY_INTENT_PATTERN =
  /\binventario\b|\bstock\b|\brepuestos?\b|\bsku\b|\boem\b|referencia|\bbodega\b|\bsede\b|\bpasillo\b|hoja de ventas|busca(?:r)?\s+en\s+(?:la\s+)?(?:hoja|inventario|cat[aá]logo)|disponib|(?:tiene(?:n)?|hay|busco|necesito)\s+(?:el|la|los|las|un|una)?\s*\w{4,}/i;

/** El visitante pide que lo contacten o deja datos. Sin vertical. */
const CONTACT_INTENT_PATTERN =
  /\b(?:contact(?:ar(?:me|nos|te|los|les)?|o|enme|arme)|me\s+contact(?:an|en|e)|c[oó]mo\s+me\s+(?:contacto|comunico)|c[oó]mo\s+(?:los|les|te)\s+contacto|hablar\s+con|comunica(?:rme|nos)|d[eé]j(?:o|ame|enme)\s+(?:mis\s+)?datos)\b/i;

export function messageLooksInventoryIntent(message: string): boolean {
  return INVENTORY_INTENT_PATTERN.test(message);
}

export function messageLooksContactIntent(message: string): boolean {
  return CONTACT_INTENT_PATTERN.test(String(message || ''));
}

export function messageLooksToolIntent(message: string): boolean {
  return TOOL_INTENT_PATTERN.test(message) || messageLooksInventoryIntent(message);
}

export function memberHasSheetInventoryCapability(member: {
  capabilities?: AgentCapabilityProfile;
}): boolean {
  return (
    member.capabilities?.items.some((i) => i.kind === 'sheet' || (i.kind === 'tool' && i.id === 'google-sheets')) ??
    false
  );
}

export function memberHasHubspotCapability(member: {
  capabilities?: AgentCapabilityProfile;
}): boolean {
  return member.capabilities?.items.some((i) => i.kind === 'mcp' && i.id === 'hubspot') ?? false;
}

function appendDomainCapability(agent: AgentDocForCapabilities, items: AgentCapabilityItem[]): void {
  const name = (agent.name ?? '').trim();
  const description = (agent.description ?? '').trim();
  const prompt = (agent.systemPrompt ?? '').trim();
  const promptLead = prompt.slice(0, 900);
  const signals = uniqueSignals([
    name,
    description,
    promptLead,
    ...tokenize(name),
    ...tokenize(description),
    ...tokenize(promptLead),
  ]);
  if (!signals.length && !promptLead && !description) return;

  items.push({
    kind: 'domain',
    id: 'domain',
    label: 'Rol y propósito',
    description: promptLead.slice(0, 280) || description || undefined,
    signals,
  });
}

function scoreSignalsAgainstMessage(
  message: string,
  signals: string[],
  weight: number,
): number {
  const msg = message.toLowerCase();
  const msgWords = meaningfulMessageTokens(msg);
  let score = 0;
  for (const signal of signals) {
    if (isWeakTriageSignal(signal)) continue;
    if (signal.length >= 5 && msg.includes(signal)) {
      score += (signal.length >= 10 ? 8 : 6) * weight;
      continue;
    }
    if (signal.length >= 4 && msgWords.some((w) => stemsMatch(w, signal))) {
      score += 6 * weight;
    }
  }
  return score;
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

    if (toolId === 'google-sheets') {
      const sheets = extractAgentSheets({ tools: [t] });
      for (const sh of sheets) {
        items.push({
          kind: 'sheet',
          id: sh.name,
          label: `Inventario: ${sh.name}`,
          description: sh.description || sh.matrixNeed,
          signals: uniqueSignals([
            sh.name,
            sh.description,
            sh.matrixNeed,
            sh.tabTitle,
            'inventario',
            'stock',
            'repuesto',
            'repuestos',
            'catálogo',
            'bodega',
            'disponibilidad',
            'referencia',
            'oem',
            'hoja de ventas',
            ...tokenize(sh.description),
            ...tokenize(sh.matrixNeed ?? ''),
            ...(BUILTIN_TOOL_TOPICS['google-sheets']?.topics ?? []),
          ]),
        });
      }
      if (!sheets.length) {
        const meta = BUILTIN_TOOL_TOPICS['google-sheets'];
        items.push({
          kind: 'tool',
          id: toolId,
          label: meta?.label ?? 'Google Sheets',
          signals: uniqueSignals([toolId, humanizeKey(toolId), ...(meta?.topics ?? [])]),
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

  appendDomainCapability(agent, items);

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
  const domainItem = items.find((i) => i.kind === 'domain');
  const domainSummary =
    domainItem?.description?.trim() ||
    [name, description].filter(Boolean).join(' — ') ||
    'sin rol definido';

  const domainSignals = uniqueSignals([
    ...(domainItem?.signals ?? []),
    ...items.filter((i) => i.kind === 'skill').flatMap((i) => i.signals),
  ]);

  const toolSignals = uniqueSignals(
    items
      .filter((i) => i.kind !== 'domain' && i.kind !== 'skill')
      .flatMap((i) => i.signals),
  );

  const toolParts = items
    .filter((i) => i.kind !== 'domain')
    .slice(0, 10)
    .map((i) => {
      const desc = i.description ? ` (${i.description.slice(0, 60)})` : '';
      return `${i.kind}:${i.label}${desc}`;
    });

  const summary = [
    `dominio: ${domainSummary.slice(0, 220)}`,
    toolParts.length ? `herramientas: ${toolParts.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    items,
    domainSummary,
    summary,
    domainSignals,
    toolSignals,
    signals: domainSignals,
  };
}

export function formatCapabilitySummaryForLlm(profile: AgentCapabilityProfile | undefined): string {
  return profile?.summary ?? 'sin capacidades registradas';
}

export type CapabilityMatchOptions = {
  memberId?: string;
  primaryOrchestratorId?: string;
};

/** Puntúa encaje dominio (prompt/rol) vs herramientas (MCP/crons). */
export function scoreMemberCapabilityMatch(
  message: string,
  member: {
    id?: string;
    name: string;
    description: string;
    hubId?: string | null;
    role: 'orchestrator' | 'specialist';
    capabilities?: AgentCapabilityProfile;
  },
  opts?: CapabilityMatchOptions,
): number {
  const msg = message.toLowerCase();
  let score = 0;

  const name = member.name.trim().toLowerCase();
  if (name.length >= 4 && msg.includes(name)) score += 20;

  const hub = (member.hubId ?? '').trim().toLowerCase();
  if (hub.length >= 4 && (msg.includes(hub) || msg.includes(hub.replace(/-/g, ' ')))) score += 8;

  const profile = member.capabilities;
  const toolIntent = messageLooksToolIntent(message);
  const inventoryIntent = messageLooksInventoryIntent(message);

  if (profile) {
    score += scoreSignalsAgainstMessage(message, profile.domainSignals, 2);

    for (const topic of meaningfulMessageTokens(message)) {
      if (topic.length < 5) continue;
      score += scoreSignalsAgainstMessage(topic, profile.domainSignals, 2.5);
    }

    if (toolIntent) {
      score += scoreSignalsAgainstMessage(message, profile.toolSignals, 1.2);
    } else {
      for (const item of profile.items) {
        if (item.kind === 'mcp' || item.kind === 'webhook' || item.kind === 'cron' || item.kind === 'tool') {
          const hit = scoreSignalsAgainstMessage(message, item.signals, 1);
          if (hit >= 5) score += hit * 0.5;
        }
      }
    }

    if (inventoryIntent) {
      for (const item of profile.items) {
        if (item.kind !== 'sheet') continue;
        const hit = scoreSignalsAgainstMessage(message, item.signals, 2.5);
        if (hit > 0) score += hit;
      }
    }
  } else {
    score += scoreSignalsAgainstMessage(
      message,
      uniqueSignals([member.name, member.description, ...tokenize(`${member.name} ${member.description}`)]),
      1.5,
    );
  }

  const primaryId = opts?.primaryOrchestratorId?.trim();
  const memberId = opts?.memberId ?? member.id;
  if (primaryId && memberId === primaryId && !toolIntent) {
    score += 6;
  }

  if (member.role === 'orchestrator') score += 1;
  return Math.round(score);
}
