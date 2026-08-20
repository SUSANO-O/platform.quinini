import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WidgetChatTrace } from '@/lib/widget-chat-latency';

describe('widget-chat-latency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acumula ms por fase con mark()', () => {
    const trace = new WidgetChatTrace({ traceId: 't1' });
    vi.advanceTimersByTime(50);
    trace.mark('auth');
    vi.advanceTimersByTime(120);
    trace.mark('hub');
    const summary = trace.finish();
    expect(summary.phases.auth).toBe(50);
    expect(summary.phases.hub).toBe(120);
    expect(summary.totalMs).toBe(170);
  });

  it('span() mide duración async', async () => {
    const trace = new WidgetChatTrace({ traceId: 't2' });
    await trace.span('resolve', async () => {
      vi.advanceTimersByTime(80);
      return 'ok';
    });
    const summary = trace.finish();
    expect(summary.phases.resolve).toBe(80);
  });

  it('finish() guarda path, ok y errorCode', () => {
    const trace = new WidgetChatTrace({ traceId: 't3', agentId: 'a1' });
    trace.setPath('stream-hub');
    trace.setReplyLen(240);
    const summary = trace.finish({ ok: false, errorCode: 'HUB_ERROR' });
    expect(summary.path).toBe('stream-hub');
    expect(summary.ok).toBe(false);
    expect(summary.errorCode).toBe('HUB_ERROR');
    expect(summary.replyLen).toBe(240);
    expect(summary.agentId).toBe('a1');
  });

  it('recordSsePhase + tools + tokens en finish', () => {
    const trace = new WidgetChatTrace({ traceId: 't4' });
    trace.recordSsePhase('prepare');
    trace.recordSsePhase('prepare');
    trace.recordSsePhase('hub');
    trace.setToolsUsed(['sheet_read', 'sheet_read']);
    trace.setPromptChars(800);
    trace.setInputTokens(180);
    trace.setPath('stream-direct-mcp');
    const summary = trace.finish();
    expect(summary.ssePhases).toEqual(['prepare', 'hub']);
    expect(summary.toolsUsed).toEqual(['sheet_read']);
    expect(summary.promptTokensEst).toBe(200);
    expect(summary.inputTokens).toBe(180);
    expect(summary.statusHonest).toBe(true);
  });

  it('status mentiroso si rag tras prepare', () => {
    const trace = new WidgetChatTrace({ traceId: 't5' });
    trace.recordSsePhase('prepare');
    trace.recordSsePhase('rag');
    const summary = trace.finish();
    expect(summary.statusHonest).toBe(false);
    expect(summary.lyingReason).toMatch(/anticipatorio/);
  });
});
