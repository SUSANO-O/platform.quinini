/**
 * Multi-webhook config helpers.
 *
 * Estructura nueva: `tools[{ toolId:'webhook', config: { webhooks: [...] } }]`
 * Cada entrada del array tiene { id, name, description, url, secret }.
 *
 * Compat legacy: si solo existe `config.url` (formato viejo de UN webhook),
 * se normaliza como un array de una entrada con name='webhook'.
 */

export interface WebhookEntry {
  id:          string;
  name:        string;          // identificador funcional (snake_case, único por agente)
  description: string;          // descripción que el LLM lee para decidir cuándo invocarlo
  url:         string;
  secret?:     string;
}

/** Sanea un nombre a un identificador válido (`[a-z0-9_]`, max 48). Útil como function name del LLM. */
export function sanitizeWebhookName(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'webhook';
}

/** Genera un id único corto, estable mientras no se borre la entrada. */
export function generateWebhookId(): string {
  return 'wh_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

type ToolConfigShape = {
  url?:      unknown;
  secret?:   unknown;
  webhooks?: unknown;
};

/**
 * Extrae el array de webhooks del config (acepta formato nuevo o legacy).
 * @param opts.includeIncomplete — si true, incluye entradas con URL vacía (útil
 *   para la UI de edición donde el usuario aún está rellenando los campos).
 */
export function extractWebhookEntries(
  rawConfig: unknown,
  opts: { includeIncomplete?: boolean } = {},
): WebhookEntry[] {
  if (!rawConfig || typeof rawConfig !== 'object') return [];
  const cfg = rawConfig as ToolConfigShape;

  // Nuevo formato — array `webhooks`
  if (Array.isArray(cfg.webhooks)) {
    const out: WebhookEntry[] = [];
    for (const w of cfg.webhooks) {
      if (!w || typeof w !== 'object') continue;
      const e = w as Record<string, unknown>;
      const url = typeof e.url === 'string' ? e.url.trim() : '';
      if (!url && !opts.includeIncomplete) continue;
      out.push({
        id:          typeof e.id === 'string' && e.id ? e.id : generateWebhookId(),
        name:        sanitizeWebhookName(typeof e.name === 'string' ? e.name : 'webhook'),
        description: typeof e.description === 'string' ? e.description.trim() : '',
        url,
        ...(typeof e.secret === 'string' && e.secret.trim() ? { secret: e.secret.trim() } : {}),
      });
    }
    // En modo UI, devolver el array tal cual (aunque esté vacío) para que se vea la entrada nueva
    if (opts.includeIncomplete) return out;
    if (out.length > 0) return out;
  }

  // Legacy — `url`/`secret` planos
  const legacyUrl = typeof cfg.url === 'string' ? cfg.url.trim() : '';
  if (legacyUrl) {
    return [{
      id:          'wh_legacy',
      name:        'webhook',
      description: 'Webhook genérico. Envía un POST JSON cuando el usuario confirme el envío de datos.',
      url:         legacyUrl,
      ...(typeof cfg.secret === 'string' && cfg.secret.trim() ? { secret: cfg.secret.trim() } : {}),
    }];
  }

  return [];
}

/** Extrae todos los webhooks de los tools[] del agente (cualquier entry con toolId='webhook'). */
export function extractAgentWebhooks(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }> | null;
} | null | undefined): WebhookEntry[] {
  if (!agent?.tools?.length) return [];
  const out: WebhookEntry[] = [];
  for (const t of agent.tools) {
    if (t?.toolId !== 'webhook') continue;
    out.push(...extractWebhookEntries(t.config));
  }
  return out;
}

/** ¿El agente tiene al menos un webhook configurado con URL? */
export function agentHasAnyWebhook(agent: {
  tools?: Array<{ toolId?: string; config?: unknown }> | null;
} | null | undefined): boolean {
  return extractAgentWebhooks(agent).length > 0;
}
