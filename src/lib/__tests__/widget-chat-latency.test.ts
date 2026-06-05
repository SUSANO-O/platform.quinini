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
});
