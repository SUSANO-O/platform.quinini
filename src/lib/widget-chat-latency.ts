/**
 * Trazas de latencia por fase del flujo widget (Fase 4).
 * Fire-and-forget: nunca bloquea la respuesta al usuario.
 */

import { logWidgetFlow } from '@/lib/debug-widget-flow';

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
  | 'stream-hub'
  | 'stream-error'
  | 'non-stream-pipeline'
  | 'non-stream-parallel'
  | 'non-stream-direct-mcp'
  | 'non-stream-infer-direct'
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

  finish(opts?: { ok?: boolean; errorCode?: string | null }): WidgetChatLatencySummary {
    if (opts?.ok === false) this.ok = false;
    if (opts?.errorCode) this.errorCode = opts.errorCode;
    const totalMs = Date.now() - this.startedAt;
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
    };
  }

  logSummary(summary?: WidgetChatLatencySummary): void {
    const s = summary ?? this.finish();
    const slow = s.totalMs >= SLOW_REQUEST_MS;
    if (process.env.DEBUG_WIDGET_FLOW?.trim() !== '1' && !slow) return;

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
  opts?: { ok?: boolean; errorCode?: string | null; replyLen?: number },
): void {
  if (opts?.replyLen != null) trace.setReplyLen(opts.replyLen);
  const summary = trace.finish({ ok: opts?.ok, errorCode: opts?.errorCode });
  trace.logSummary(summary);
  if (summary.userId && summary.agentId) {
    persistWidgetChatLatency(summary);
  }
}
