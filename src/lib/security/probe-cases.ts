/**
 * Banco de pruebas de seguridad — definiciones de sondas.
 *
 * Cada sonda es una petición contra la propia infraestructura de BotIvA y una expectativa sobre la
 * respuesta. Todas son NO destructivas: usan IDs y tokens inventados, no borran ni modifican datos,
 * no hacen fuerza bruta ni saturan el servicio. Sirven para confirmar que los arreglos de seguridad
 * siguen en pie tras cada deploy y para detectar un endpoint que se vuelva a abrir.
 *
 * La lógica de evaluación (`evaluateProbeResponse`) es pura y testeable; el runner
 * (`scripts/security/run-security-probe.mts`) hace las peticiones reales.
 */

export type ProbeTarget = 'landing' | 'hub' | 'backend';

export type ProbeSeverity = 'critical' | 'high' | 'medium' | 'info';

export type ProbeExpectation = {
  /** Código(s) HTTP aceptables. */
  status?: number[];
  /** Código(s) HTTP que harían FALLAR la sonda (p. ej. un 200 donde esperamos rechazo). */
  notStatus?: number[];
  /** Texto que DEBE aparecer en el cuerpo. */
  bodyIncludes?: string[];
  /** Texto que NO debe aparecer en el cuerpo (p. ej. una respuesta del agente donde esperamos 401). */
  bodyExcludes?: string[];
};

export type ProbeCase = {
  id: string;
  /** Qué comprueba, en una frase. */
  description: string;
  target: ProbeTarget;
  severity: ProbeSeverity;
  method: 'GET' | 'POST';
  /** Ruta relativa a la base del `target`. */
  path: string;
  headers?: Record<string, string>;
  /** Cuerpo JSON (se serializa). */
  body?: unknown;
  expect: ProbeExpectation;
  /** Por qué importa / qué ataque cubre. */
  rationale: string;
};

const FAKE_OID = '000000000000000000000000';
const FAKE_WT = 'wt_tokenfalso000000000000000000';

/**
 * Sondas de regresión: cada una reproduce, sin causar daño, un hueco que cerramos el 2026-11-07.
 * Un 200 donde esperamos 401/403/404 significa que el hueco volvió a abrirse.
 */
export const SECURITY_PROBES: readonly ProbeCase[] = [
  // ── Chat del widget: exige un widget validado ────────────────────────────
  {
    id: 'landing-chat-stream-no-token',
    description: 'El chat en streaming rechaza una petición sin token.',
    target: 'landing',
    severity: 'critical',
    method: 'POST',
    path: '/api/widget/chat/stream',
    headers: { origin: 'https://probe.invalid' },
    body: { agentId: 'probe-agent-inexistente', message: 'hola', sessionId: 'sess_probe_000' },
    expect: { status: [401], notStatus: [200], bodyExcludes: ['"type":"done"'] },
    rationale: 'Sin esto, cualquiera usa el agente de cualquier cliente con sus herramientas, sin cuota.',
  },
  {
    id: 'landing-chat-stream-fake-token',
    description: 'El chat en streaming rechaza un token wt_ inventado.',
    target: 'landing',
    severity: 'critical',
    method: 'POST',
    path: '/api/widget/chat/stream',
    headers: { origin: 'https://probe.invalid' },
    body: { agentId: 'probe-agent-inexistente', message: 'hola', sessionId: 'sess_probe_001', token: FAKE_WT },
    expect: { status: [401], notStatus: [200], bodyIncludes: ['WIDGET_TOKEN_INVALID'] },
    rationale: 'Antes un token que empezara por wt_ bastaba para que la landing firmara al hub.',
  },
  {
    id: 'landing-chat-no-token',
    description: 'El chat (no streaming) rechaza una petición sin token.',
    target: 'landing',
    severity: 'critical',
    method: 'POST',
    path: '/api/widget/chat',
    headers: { origin: 'https://probe.invalid' },
    body: { agentId: 'probe-agent-inexistente', message: 'hola', sessionId: 'sess_probe_002' },
    expect: { status: [401], notStatus: [200] },
    rationale: 'Mismo hueco que el streaming, por la ruta sin SSE.',
  },

  // ── Endpoints que exigen sesión o secreto interno ────────────────────────
  {
    id: 'landing-admin-promote-no-session',
    description: 'admin/promote exige sesión de admin (no solo el secreto).',
    target: 'landing',
    severity: 'critical',
    method: 'POST',
    path: '/api/admin/promote',
    body: { email: 'probe@probe.invalid', secret: 'x' },
    expect: { status: [401], notStatus: [200] },
    rationale: 'Era público: cualquiera podía probar secretos sin límite y hacerse admin.',
  },
  {
    id: 'landing-mcp-agent-tools-no-session',
    description: 'mcp/agent-tools exige sesión.',
    target: 'landing',
    severity: 'high',
    method: 'GET',
    path: `/api/mcp/agent-tools?agentId=${FAKE_OID}`,
    expect: { status: [401], notStatus: [200] },
    rationale: 'Listaba integraciones, conexiones y credenciales enmascaradas de cualquier agente.',
  },
  {
    id: 'landing-ab-metrics-no-secret',
    description: 'ab-tests/metrics exige el secreto interno.',
    target: 'landing',
    severity: 'medium',
    method: 'POST',
    path: `/api/agents/${FAKE_OID}/ab-tests/metrics`,
    body: { variantId: 'x' },
    expect: { status: [401], notStatus: [200] },
    rationale: 'Era público: cualquiera podía inflar las métricas de un test A/B.',
  },

  // ── Hub (control-matias): chat directo exige autenticación ───────────────
  {
    id: 'hub-chat-no-token',
    description: 'El chat directo del hub rechaza sin token.',
    target: 'hub',
    severity: 'critical',
    method: 'POST',
    path: '/api/widget/chat',
    body: { agentId: 'probe-agent-inexistente', message: 'hola' },
    // 401 (token inválido) o 404 (agente inexistente antes del check) son aceptables; 200 no.
    expect: { notStatus: [200], bodyExcludes: ['"reply"'] },
    rationale: 'El hub es público; sin esto cualquiera chatea con los 76 agentes y sus herramientas.',
  },
  {
    id: 'hub-chat-fake-token',
    description: 'El chat directo del hub rechaza un token wt_ inventado.',
    target: 'hub',
    severity: 'critical',
    method: 'POST',
    path: '/api/widget/chat',
    body: { agentId: 'probe-agent-inexistente', message: 'hola', token: FAKE_WT },
    expect: { status: [401], notStatus: [200], bodyIncludes: ['WIDGET_TOKEN_INVALID'] },
    rationale: 'Un token wt_ que el hub no conoce no puede valer como válido.',
  },

  // ── Backend: todo exige la clave interna ─────────────────────────────────
  {
    id: 'backend-agents-no-key',
    description: 'El backend rechaza /api/agents sin x-api-key.',
    target: 'backend',
    severity: 'critical',
    method: 'GET',
    path: '/api/agents',
    expect: { status: [401], notStatus: [200] },
    rationale: 'El backend es la pieza con acceso a todo; sin clave no debe responder nada sensible.',
  },
  {
    id: 'backend-mcp-connections-no-key',
    description: 'El backend rechaza /api/mcp/connections sin x-api-key.',
    target: 'backend',
    severity: 'critical',
    method: 'GET',
    path: '/api/mcp/connections',
    expect: { status: [401], notStatus: [200] },
    rationale: 'Las conexiones MCP llevan credenciales de integraciones de clientes.',
  },

  // ── Controles positivos: lo público sigue vivo y sin secretos ────────────
  {
    id: 'backend-health-ok',
    description: 'El /health del backend responde (control de que no rompimos nada).',
    target: 'backend',
    severity: 'info',
    method: 'GET',
    path: '/health',
    expect: { status: [200], bodyIncludes: ['widget-chat-sandbox'] },
    rationale: 'Control positivo: el backend está arriba y en modo correcto.',
  },
  {
    id: 'backend-catalog-public-no-secrets',
    description: 'El catálogo MCP público no filtra credenciales.',
    target: 'backend',
    severity: 'info',
    method: 'GET',
    path: '/api/mcp/catalog',
    expect: { status: [200], bodyExcludes: ['access_token', 'refresh_token', 'client_secret', 'password'] },
    rationale: 'El catálogo es público a propósito: debe traer solo metadatos.',
  },
];

export type ProbeResult = {
  probe: ProbeCase;
  status: number;
  ok: boolean;
  reasons: string[];
};

/** Evalúa una respuesta contra la expectativa de una sonda. Pura: no hace red. */
export function evaluateProbeResponse(
  probe: ProbeCase,
  status: number,
  bodyText: string,
): ProbeResult {
  const reasons: string[] = [];
  const { expect } = probe;

  if (expect.status && !expect.status.includes(status)) {
    reasons.push(`esperaba HTTP ${expect.status.join('/')}, llegó ${status}`);
  }
  if (expect.notStatus && expect.notStatus.includes(status)) {
    reasons.push(`HTTP ${status} está prohibido para esta sonda`);
  }
  for (const needle of expect.bodyIncludes ?? []) {
    if (!bodyText.includes(needle)) reasons.push(`faltaba en el cuerpo: "${needle}"`);
  }
  for (const needle of expect.bodyExcludes ?? []) {
    if (bodyText.includes(needle)) reasons.push(`no debía aparecer en el cuerpo: "${needle}"`);
  }

  return { probe, status, ok: reasons.length === 0, reasons };
}

/** Resumen de una corrida. */
export function summarizeProbeRun(results: ProbeResult[]): {
  total: number;
  passed: number;
  failed: number;
  failedCritical: number;
} {
  const failed = results.filter((r) => !r.ok);
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedCritical: failed.filter((r) => r.probe.severity === 'critical').length,
  };
}
