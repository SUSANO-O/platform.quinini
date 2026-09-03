/**
 * Lógica pura de la vista de entregas de webhook.
 *
 * Se separa del route handler para poder testearla sin Mongo ni Next: lo que
 * importa acá es que el resumen diga la verdad — que un dueño mirando esto
 * entienda en 5 segundos si sus leads están llegando o no.
 */

/**
 * IDs con los que un agente puede aparecer en la bitácora.
 *
 * OJO — trampa real: el campo `tenantId` de la bitácora **no** es el userId del
 * landing. Es el tenant multi-inquilino de AIBackHub (`req.tenantId ?? 'default'`),
 * y hoy vale `'default'` para todo el mundo. Filtrar por él devolvería vacío.
 *
 * La propiedad se resuelve por **agente**: se toman los agentes del usuario y se
 * arma el conjunto de identificadores con los que pueden haberse registrado.
 * El `agentId` de la bitácora es a veces el `_id` de Mongo y a veces el
 * `agentHubId`, según cómo se haya invocado el widget — por eso van los dos.
 */
export function agentIdsForOwner(
  agents: Array<{ _id?: unknown; agentHubId?: string }>,
): string[] {
  const ids = new Set<string>();
  for (const a of agents) {
    if (a._id) ids.add(String(a._id));
    if (a.agentHubId && a.agentHubId.trim()) ids.add(a.agentHubId.trim());
  }
  return [...ids];
}

export type DeliveryRow = {
  _id?: unknown;
  agentId?: string;
  event?: string;
  webhookName?: string;
  urlHost?: string;
  attempt?: number;
  ok?: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  responseSnippet?: string;
  durationMs?: number;
  createdAt?: Date | string;
  payload?: unknown;
};

export type DeliveryItem = {
  id: string;
  agentId: string;
  event: string;
  webhookName: string;
  host: string;
  attempt: number;
  ok: boolean;
  status: number;
  /** Explicación en castellano de qué pasó. */
  detalle: string;
  durationMs: number;
  createdAt: string | null;
  /** Campos del lead que traía (nombres, nunca valores). */
  leadFields: string[];
};

export type DeliverySummary = {
  total: number;
  ok: number;
  fallidas: number;
  /** % de entregas exitosas, 0-100. null si no hay datos. */
  tasaExito: number | null;
  /** Motivo más frecuente de fallo, para saber por dónde empezar. */
  principalMotivoFallo: string | null;
};

/** Traduce un resultado HTTP a algo que un humano pueda accionar. */
export function explicarResultado(row: DeliveryRow): string {
  if (row.ok) return `Entregado (${row.status})`;
  const status = row.status ?? 0;
  if (status === 0) {
    const st = row.statusText ?? '';
    if (st === 'ssrf_blocked' || st === 'ssrf_blocked_redirect') {
      return 'Destino no permitido (IP interna o esquema inválido)';
    }
    if (st.startsWith('redirect')) return 'Problema de redirección en el destino';
    if (st === 'too_many_redirects') return 'El destino encadena redirecciones';
    return `Sin respuesta del destino${row.error ? ` — ${row.error}` : ''}`;
  }
  if (status === 401 || status === 403) return `Rechazado por credenciales (${status})`;
  if (status === 404) return 'La URL no existe en el destino (404)';
  if (status === 408) return 'El destino tardó demasiado (408)';
  if (status === 429) return 'El destino rechazó por límite de peticiones (429)';
  if (status >= 500) return `El destino falló (${status})`;
  if (status >= 400) return `El destino rechazó la petición (${status})`;
  return `HTTP ${status}`;
}

/** Nombres de los campos del lead presentes. Nunca los valores: esto se muestra en pantalla. */
export function leadFieldsOf(payload: unknown): string[] {
  const lead = (payload as { lead?: unknown } | null)?.lead;
  if (!lead || typeof lead !== 'object') return [];
  return Object.entries(lead as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .map(([k]) => k);
}

export function toDeliveryItem(row: DeliveryRow): DeliveryItem {
  return {
    id: String(row._id ?? ''),
    agentId: row.agentId ?? '',
    event: row.event ?? '',
    webhookName: row.webhookName ?? '',
    host: row.urlHost ?? '',
    attempt: row.attempt ?? 1,
    ok: Boolean(row.ok),
    status: row.status ?? 0,
    detalle: explicarResultado(row),
    durationMs: row.durationMs ?? 0,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    leadFields: leadFieldsOf(row.payload),
  };
}

export function buildSummary(rows: DeliveryRow[]): DeliverySummary {
  const total = rows.length;
  if (total === 0) {
    return { total: 0, ok: 0, fallidas: 0, tasaExito: null, principalMotivoFallo: null };
  }
  const ok = rows.filter((r) => r.ok).length;
  const fallidas = total - ok;

  const motivos = new Map<string, number>();
  for (const r of rows) {
    if (r.ok) continue;
    const motivo = explicarResultado(r);
    motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
  }
  const principal = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    total,
    ok,
    fallidas,
    tasaExito: Math.round((ok / total) * 1000) / 10,
    principalMotivoFallo: principal ? principal[0] : null,
  };
}
