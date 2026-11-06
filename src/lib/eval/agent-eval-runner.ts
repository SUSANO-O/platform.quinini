import { connectDB } from '@/lib/db/connection';
import { Widget, ClientAgent } from '@/lib/db/models';
import { enrichWidgetChatBody } from '@/lib/widget-chat-enrich';
import { tryServeWidgetChatViaHubMcp } from '@/lib/widget-chat-direct-mcp';
import { tryServeWidgetChatViaDirectInference } from '@/lib/widget-chat-direct-inference';
import { getWidgetAppMap, getWidgetScreenContextEnabled } from '@/lib/widget-page-visits';
import { STRICT_PURPOSE_SUFFIX } from '@/lib/widget-strict-purpose';
import { hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';
import type { AppMapEntry } from '@/lib/widget-app-map';
import type { EvalCase } from '@/lib/eval/agent-eval-cases';
import type { JudgeModelCall } from '@/lib/eval/agent-eval-judge';

/**
 * Ejecuta un caso del banco de pruebas con la MISMA cadena que la ruta real del chat
 * (`/api/widget/chat/stream`): preparar el cuerpo → "solo propósito" → chat con herramientas del
 * hub → inferencia directa si el agente no tiene herramientas. Diferencias a propósito:
 *  - no guarda la conversación, no cuenta uso, no registra visitas ni latencia;
 *  - el hub corre en modo de prueba (`sandbox`): las herramientas que escriben se simulan;
 *  - sesión y visitante propios (`eval_…`), sin memoria ni contexto de sesión previos.
 */

export type EvalAgentContext = {
  widgetId: string;
  ownerUserId: string;
  agentId: string;
  appMap: AppMapEntry[];
  screenContextEnabled: boolean;
  strictPurposeOnly: boolean;
  systemPrompt: string;
  /** Instrucciones + FAQs/reglas + documentos del agente: lo que ve el juez como fuente de verdad. */
  judgeSources: string;
};

/** Junta las fuentes del agente para el juez (instrucciones y cada documento con su nombre). */
export function buildJudgeSources(agent: { systemPrompt?: string; ragSources?: Array<{ name?: string; content?: string }> }): string {
  const parts = [`## Instrucciones del agente\n${agent.systemPrompt ?? ''}`];
  for (const doc of agent.ragSources ?? []) {
    if (typeof doc?.content === 'string' && doc.content.trim()) parts.push(`## Documento: ${doc.name ?? 'sin nombre'}\n${doc.content}`);
  }
  return parts.join('\n\n');
}

export async function loadEvalAgentContext(widgetId: string): Promise<EvalAgentContext> {
  await connectDB();
  const w = (await Widget.findById(widgetId).select({ userId: 1, agentId: 1 }).lean()) as
    | { userId?: string; agentId?: string }
    | null;
  if (!w?.userId || !w.agentId) throw new Error(`Widget ${widgetId} sin dueño o sin agente`);
  const agentFilter = /^[a-f0-9]{24}$/i.test(w.agentId) ? { _id: w.agentId } : { agentHubId: w.agentId };
  const agent = (await ClientAgent.findOne(agentFilter).select({ strictPurposeOnly: 1, systemPrompt: 1, ragSources: 1 }).lean()) as
    | { strictPurposeOnly?: boolean; systemPrompt?: string; ragSources?: Array<{ name?: string; content?: string }> }
    | null;
  const [appMap, screenContextEnabled] = await Promise.all([
    getWidgetAppMap(widgetId),
    getWidgetScreenContextEnabled(widgetId),
  ]);
  return {
    widgetId,
    ownerUserId: String(w.userId),
    agentId: String(w.agentId),
    appMap,
    screenContextEnabled,
    strictPurposeOnly: agent?.strictPurposeOnly === true,
    systemPrompt: agent?.systemPrompt ?? '',
    judgeSources: buildJudgeSources(agent ?? {}),
  };
}

/** Cuerpo igual al que envía el widget (sin widgetId: así la preparación no escribe hechos de sesión). */
export function buildEvalChatBody(ctx: Pick<EvalAgentContext, 'agentId'>, c: EvalCase, runId: string): string {
  return JSON.stringify({
    message: c.message,
    history: c.history ?? [],
    agentId: ctx.agentId,
    sessionId: `eval_${runId}_${c.id}`,
    visitorId: `eval_${runId}`,
    ...(c.pagePath ? { pagePath: c.pagePath } : {}),
    ...(c.pageTitle ? { pageTitle: c.pageTitle } : {}),
    ...(c.screenContext ? { screenContext: c.screenContext } : {}),
  });
}

/** Igual que la ruta: con "solo propósito" activo, el sufijo se añade a las instrucciones. */
export function applyStrictPurpose(rawBody: string, ctx: Pick<EvalAgentContext, 'strictPurposeOnly' | 'systemPrompt'>): string {
  if (!ctx.strictPurposeOnly) return rawBody;
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  const base = typeof parsed.systemPromptOverride === 'string' ? parsed.systemPromptOverride : ctx.systemPrompt;
  parsed.systemPromptOverride = base + STRICT_PURPOSE_SUFFIX;
  return JSON.stringify(parsed);
}

export type EvalTurnDeps = {
  enrich: typeof enrichWidgetChatBody;
  hubMcp: typeof tryServeWidgetChatViaHubMcp;
  infer: typeof tryServeWidgetChatViaDirectInference;
  now: () => number;
};

const DEFAULT_DEPS: EvalTurnDeps = {
  enrich: enrichWidgetChatBody,
  hubMcp: tryServeWidgetChatViaHubMcp,
  infer: tryServeWidgetChatViaDirectInference,
  now: Date.now,
};

export type EvalTurnResult = { reply: string; path: 'hub-mcp' | 'infer-direct' | 'none'; latencyMs: number; error?: string };

export async function runEvalTurn(
  ctx: EvalAgentContext,
  c: EvalCase,
  runId: string,
  deps: EvalTurnDeps = DEFAULT_DEPS,
): Promise<EvalTurnResult> {
  const t0 = deps.now();
  try {
    let body = buildEvalChatBody(ctx, c, runId);
    body = await deps.enrich({ rawBody: body, ownerUserId: ctx.ownerUserId });
    body = applyStrictPurpose(body, ctx);

    const outcome: { noMcpTools?: boolean } = {};
    const mcp = await deps.hubMcp({
      widgetTokenStartsWithWt: true,
      parsedAgentId: ctx.agentId,
      rawBody: body,
      ownerUserId: ctx.ownerUserId,
      strictPurposeSuffix: STRICT_PURPOSE_SUFFIX,
      appMap: ctx.appMap,
      screenContextEnabled: ctx.screenContextEnabled,
      outcome,
      sandbox: true,
    });
    if (mcp?.reply) return { reply: mcp.reply, path: 'hub-mcp', latencyMs: deps.now() - t0 };

    const inferred = await deps.infer({
      parsedAgentId: ctx.agentId,
      rawBody: body,
      ownerUserId: ctx.ownerUserId,
      allowWithoutMcp: outcome.noMcpTools === true,
      appMap: ctx.appMap,
      screenContextEnabled: ctx.screenContextEnabled,
    });
    if (inferred?.reply) return { reply: inferred.reply, path: 'infer-direct', latencyMs: deps.now() - t0 };
    return { reply: '', path: 'none', latencyMs: deps.now() - t0, error: 'Ningún camino devolvió respuesta' };
  } catch (err) {
    return { reply: '', path: 'none', latencyMs: deps.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Llamada al modelo juez por el hub (POST /api/models), temperatura 0. 4096 tokens: Gemini 2.5 razona
 * antes de responder y con menos presupuesto el JSON del veredicto salía cortado.
 */
export function hubJudgeModelCall(model = 'gemini-2.5-flash', provider = 'vertex'): JudgeModelCall {
  return async ({ systemPrompt, prompt }) => {
    const res = await hubFetch(
      '/api/models',
      {
        method: 'POST',
        headers: { ...hubCreateHeaders(), 'x-agent-name': 'botiva-eval-judge' },
        body: JSON.stringify({ prompt, systemPrompt, provider, model, taskType: 'analysis', temperature: 0, maxTokens: 4096 }),
      },
      90_000,
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`juez HTTP ${res.status}`);
    const data = (json.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>;
    return String(data.text ?? data.reply ?? json.text ?? '');
  };
}

/** Feature que anuncia en /health un hub con modo de prueba (matias-backend/src/server.ts). */
export const HUB_SANDBOX_FEATURE = 'widget-chat-sandbox';

/**
 * Candado de seguridad: el banco solo corre contra un hub que anuncia el modo de prueba. Un hub
 * anterior ignoraría `sandbox` y ejecutaría de verdad las herramientas que escriben (tickets, webhooks).
 */
export async function assertHubSupportsSandbox(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let features: unknown;
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(15_000) });
    features = ((await res.json()) as { features?: unknown }).features;
  } catch (err) {
    throw new Error(`No se pudo comprobar el hub (${err instanceof Error ? err.message : String(err)}). No se corre el banco.`);
  }
  if (!Array.isArray(features) || !features.includes(HUB_SANDBOX_FEATURE)) {
    throw new Error(
      `El hub no anuncia "${HUB_SANDBOX_FEATURE}": ejecutaría de verdad las herramientas que escriben. Despliega matias-backend con el modo de prueba antes de correr el banco.`,
    );
  }
}
