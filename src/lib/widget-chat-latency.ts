/**
 * Trazas de latencia por fase del flujo widget (Fase 4).
 * Fire-and-forget: nunca bloquea la respuesta al usuario.
 */

import { logWidgetFlow } from '@/lib/debug-widget-flow';
import { buildWidgetTurnObsFields } from '@/lib/widget-turn-observability';

export type WidgetChatLatencyPhase =
  | 'vision'
  | 'auth'
  | 'human_guard'
  | 'multi_pipeline'
  | 'multi_parallel'
  | 'multi_triage'
  | 'ab_variant'
  | 'strict_purpose'
  | 'resolve'
  | 'hints'
  | 'infer_direct'
  | 'hub'
  | 'reveal'
  | 'post';

export type WidgetChatLatencyPath =
  | 'stream-pipeline'
  | 'stream-parallel'
  | 'stream-infer-direct'
  | 'stream-direct-mcp'
  | 'stream-hub'
  | 'stream-ticket-deflection'
  | 'stream-error'
  | 'non-stream-pipeline'
  | 'non-stream-parallel'
  | 'non-stream-direct-mcp'
  | 'non-stream-infer-direct'
  | 'non-stream-ticket-deflection'
  | 'non-stream-hub'
  | 'non-stream-error'
  | 'human-mode'
  | '';

export type WidgetChatTraceMeta = {
  traceId: string;
  userId?: string | null;
  agentId?: string | null;
  widgetId?: string | null;
  sessionId?: string | null;
  stream?: boolean;
};

export type WidgetChatLatencySummary = {
  traceId: string;
  totalMs: number;
  path: WidgetChatLatencyPath;
  ok: boolean;
  errorCode: string | null;
  phases: Record<string, number>;
  userId: string | null;
  agentId: string | null;
  widgetId: string | null;
  sessionId: string | null;
  replyLen: number | null;
  /** Fases SSE `type:status` en orden (dedupe consecutivo). */
  ssePhases: string[];
  toolsUsed: string[];
  promptChars: number | null;
  promptTokensEst: number | null;
  inputTokens: number | null;
  statusHonest: boolean;
  lyingReason: string | null;
};

const SLOW_REQUEST_MS = 15_000;

export class WidgetChatTrace {
  private readonly startedAt = Date.now();
  private lastMarkAt = this.startedAt;
  private readonly phases: Record<string, number> = {};
  private path: WidgetChatLatencyPath = '';
  private ok = true;
  private errorCode: string | null = null;
  private replyLen: number | null = null;
  private readonly ssePhases: string[] = [];
  private toolsUsed: string[] = [];
  private promptChars: number | null = null;
  private inputTokens: number | null = null;

  constructor(private meta: WidgetChatTraceMeta) {}

  get traceId(): string {
    return this.meta.traceId;
  }

  setMeta(patch: Partial<Omit<WidgetChatTraceMeta, 'traceId'>>): void {
    this.meta = { ...this.meta, ...patch };
  }

  mark(phase: WidgetChatLatencyPhase | string): void {
    const now = Date.now();
    const delta = now - this.lastMarkAt;
    this.lastMarkAt = now;
    const key = String(phase);
    this.phases[key] = (this.phases[key] ?? 0) + delta;
  }

  async span<T>(phase: WidgetChatLatencyPhase | string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      const key = String(phase);
      this.phases[key] = (this.phases[key] ?? 0) + (Date.now() - t0);
      this.lastMarkAt = Date.now();
    }
  }

  setPath(path: WidgetChatLatencyPath): void {
    this.path = path;
  }

  setReplyLen(len: number): void {
    this.replyLen = Number.isFinite(len) ? Math.max(0, Math.floor(len)) : null;
  }

  /** Registra fase SSE; ignora ticks consecutivos idénticos. */
  recordSsePhase(phase: string | undefined | null): void {
    const p = typeof phase === 'string' ? phase.trim() : '';
    if (!p) return;
    if (this.ssePhases[this.ssePhases.length - 1] === p) return;
    if (this.ssePhases.length < 40) this.ssePhases.push(p);
  }

  setToolsUsed(tools: string[] | undefined | null): void {
    if (!Array.isArray(tools)) return;
    this.toolsUsed = [...new Set(tools.map(String).filter(Boolean))].slice(0, 40);
  }

  setPromptChars(chars: number | null | undefined): void {
    if (chars == null || !Number.isFinite(chars)) return;
    this.promptChars = Math.max(0, Math.floor(chars));
  }

  setInputTokens(tokens: number | null | undefined): void {
    if (tokens == null || !Number.isFinite(tokens)) return;
    this.inputTokens = Math.max(0, Math.floor(tokens));
  }

  finish(opts?: { ok?: boolean; errorCode?: string | null }): WidgetChatLatencySummary {
    if (opts?.ok === false) this.ok = false;
    if (opts?.errorCode) this.errorCode = opts.errorCode;
    const totalMs = Date.now() - this.startedAt;
    const obs = buildWidgetTurnObsFields({
      path: this.path,
      ssePhases: this.ssePhases,
      toolsUsed: this.toolsUsed,
      promptChars: this.promptChars,
      inputTokens: this.inputTokens,
      replyLen: this.replyLen,
      totalMs,
    });
    return {
      traceId: this.meta.traceId,
      totalMs,
      path: this.path,
      ok: this.ok,
      errorCode: this.errorCode,
      phases: { ...this.phases },
      userId: this.meta.userId ?? null,
      agentId: this.meta.agentId ?? null,
      widgetId: this.meta.widgetId ?? null,
      sessionId: this.meta.sessionId ?? null,
      replyLen: this.replyLen,
      ssePhases: obs.ssePhases,
      toolsUsed: obs.toolsUsed,
      promptChars: obs.promptChars,
      promptTokensEst: obs.promptTokensEst,
      inputTokens: obs.inputTokens,
      statusHonest: obs.statusHonest,
      lyingReason: obs.lyingReason,
    };
  }

  logSummary(summary?: WidgetChatLatencySummary): void {
    const s = summary ?? this.finish();
    const slow = s.totalMs >= SLOW_REQUEST_MS;
    const debugOn = process.env.DEBUG_WIDGET_FLOW?.trim() === '1';
    const lying = !s.statusHonest;

    if (lying) {
      console.warn(
        `⚠️ [widget-flow|landing|turn:lying-status] status mentiroso ${JSON.stringify({
          traceId: s.traceId,
          path: s.path,
          ssePhases: s.ssePhases,
          lyingReason: s.lyingReason,
          agentId: s.agentId,
        })}`,
      );
    }

    if (!debugOn && !slow && !lying) return;

    const obs = buildWidgetTurnObsFields({
      path: s.path,
      ssePhases: s.ssePhases,
      toolsUsed: s.toolsUsed,
      promptChars: s.promptChars,
      inputTokens: s.inputTokens,
      replyLen: s.replyLen,
      totalMs: s.totalMs,
    });

    if (debugOn || lying) {
      logWidgetFlow('📊', 'turn:obs', 'resumen turno', {
        traceId: s.traceId,
        ...obs,
        agentId: s.agentId,
        widgetId: s.widgetId,
      });
    }

    if (!debugOn && !slow) return;

    const emoji = slow ? '🐢' : '⏱️';
    const segment = slow ? 'latency:slow' : 'latency:ok';
    const detail = slow
      ? `request lento (${s.totalMs}ms ≥ ${SLOW_REQUEST_MS}ms)`
      : `latencia por fase (${s.totalMs}ms)`;

    logWidgetFlow(emoji, segment, detail, {
      traceId: s.traceId,
      path: s.path,
      totalMs: s.totalMs,
      phases: s.phases,
      ok: s.ok,
      errorCode: s.errorCode,
      replyLen: s.replyLen,
      agentId: s.agentId,
      widgetId: s.widgetId,
      ssePhases: s.ssePhases,
      toolsUsed: s.toolsUsed,
      statusHonest: s.statusHonest,
      promptTokensEst: s.promptTokensEst,
      inputTokens: s.inputTokens,
    });
  }
}

export function persistWidgetChatLatency(summary: WidgetChatLatencySummary): void {
  void (async () => {
    try {
      const { connectDB } = await import('@/lib/db/connection');
      const { WidgetChatLatency } = await import('@/lib/db/models');
      await connectDB();
      await WidgetChatLatency.create({
        traceId: summary.traceId,
        userId: summary.userId ?? '',
        agentId: summary.agentId ?? '',
        widgetId: summary.widgetId,
        sessionId: summary.sessionId,
        path: summary.path,
        totalMs: summary.totalMs,
        phases: summary.phases,
        ok: summary.ok,
        errorCode: summary.errorCode,
        replyLen: summary.replyLen,
        ssePhases: summary.ssePhases,
        toolsUsed: summary.toolsUsed,
        promptChars: summary.promptChars,
        promptTokensEst: summary.promptTokensEst,
        inputTokens: summary.inputTokens,
        statusHonest: summary.statusHonest,
        lyingReason: summary.lyingReason,
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[widget-latency] insert failed:', e instanceof Error ? e.message : String(e));
      }
    }
  })();
}

export function finalizeWidgetChatTrace(
  trace: WidgetChatTrace,
  opts?: {
    ok?: boolean;
    errorCode?: string | null;
    replyLen?: number;
    toolsUsed?: string[];
    promptChars?: number | null;
    inputTokens?: number | null;
  },
): void {
  if (opts?.replyLen != null) trace.setReplyLen(opts.replyLen);
  if (opts?.toolsUsed) trace.setToolsUsed(opts.toolsUsed);
  if (opts?.promptChars != null) trace.setPromptChars(opts.promptChars);
  if (opts?.inputTokens != null) trace.setInputTokens(opts.inputTokens);
  const summary = trace.finish({ ok: opts?.ok, errorCode: opts?.errorCode });
  trace.logSummary(summary);
  if (summary.userId && summary.agentId) {
    persistWidgetChatLatency(summary);
  }
}
