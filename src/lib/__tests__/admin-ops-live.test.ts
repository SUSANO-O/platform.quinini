import { describe, expect, it } from 'vitest';
import {
  ADMIN_OPS_LIVE_PATH,
  ADMIN_OPS_LIVE_SLUG,
  buildLiveAgentView,
  expandTurnToConsoleLines,
  foldTopAgents,
  isAdminOpsLiveSlug,
  speedScore,
  successScore,
} from '../admin-ops-live';

describe('admin-ops-live slug', () => {
  it('acepta solo el slug cifrado', () => {
    expect(isAdminOpsLiveSlug(ADMIN_OPS_LIVE_SLUG)).toBe(true);
    expect(isAdminOpsLiveSlug('observability')).toBe(false);
    expect(isAdminOpsLiveSlug('')).toBe(false);
    expect(isAdminOpsLiveSlug(undefined)).toBe(false);
  });

  it('expone path admin ofuscado', () => {
    expect(ADMIN_OPS_LIVE_PATH).toBe(`/admin/ops/${ADMIN_OPS_LIVE_SLUG}`);
    expect(ADMIN_OPS_LIVE_PATH).not.toContain('observ');
  });
});

describe('scores 0–100', () => {
  it('éxito es % de ok, no un juicio LLM', () => {
    expect(successScore(9, 10)).toBe(90);
    expect(successScore(0, 0)).toBe(0);
  });

  it('rapidez es 100 a 0 ms y 0 a 40 s', () => {
    expect(speedScore(0)).toBe(100);
    expect(speedScore(40_000)).toBe(0);
    expect(speedScore(20_000)).toBe(50);
  });
});

describe('foldTopAgents', () => {
  it('agrupa el resto en Otros para no romper el eje X', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      agentId: `a${i}`,
      name: `Agente ${i}`,
      requests: 10 - i,
      okRequests: 9 - i,
      avgTotalMs: 1000 * (i + 1),
      p95TotalMs: 1500 * (i + 1),
    }));
    const { agents, others } = foldTopAgents(rows, 3);
    expect(agents).toHaveLength(3);
    expect(others?.name).toBe('Otros');
    expect(others?.requests).toBe(7 + 6 + 5);
  });
});

describe('buildLiveAgentView', () => {
  it('alinea barras y latencia por el mismo eje de agentes', () => {
    const view = buildLiveAgentView({
      current: [
        { agentId: 'x', name: 'Taller', requests: 10, okRequests: 10, avgTotalMs: 8000, p95TotalMs: 12000 },
        { agentId: 'y', name: 'Soporte', requests: 4, okRequests: 2, avgTotalMs: 20000, p95TotalMs: 28000 },
      ],
      previous: [
        { agentId: 'x', name: 'Taller', requests: 8, okRequests: 8, avgTotalMs: 6000, p95TotalMs: 9000 },
      ],
      maxAgents: 24,
    });
    expect(view.agents.map((a) => a.label)).toEqual(['Taller', 'Soporte']);
    expect(view.agents[0].avgSec).toBe(8);
    expect(view.agents[0].prevAvgSec).toBe(6);
    expect(view.agents[1].prevAvgSec).toBeNull();
    expect(view.agents[0].success).toBe(100);
    expect(view.agents[1].success).toBe(50);
  });
});

describe('expandTurnToConsoleLines', () => {
  it('cae en cascada: turno, orquesta, fases, tools, memoria, rag', () => {
    const lines = expandTurnToConsoleLines({
      traceId: 't1',
      at: '2026-08-15T21:00:00.000Z',
      agentId: 'ag1',
      agentName: 'Asesor de ventas',
      path: 'stream-direct-mcp',
      ok: true,
      totalMs: 12500,
      phases: { auth: 80, hub: 9000, reveal: 400 },
      toolsUsed: ['mcp:sheets:read'],
      historyTurns: 6,
      ragChars: 2400,
      toolRounds: 1,
    });
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('turn');
    expect(kinds).toContain('orquesta');
    expect(kinds.filter((k) => k === 'fase').length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('tools');
    expect(kinds).toContain('memoria');
    expect(kinds).toContain('rag');
    expect(lines[0].text).toContain('Asesor de ventas');
    expect(lines[0].text).toContain('12,5 s');
    expect(lines.find((l) => l.kind === 'orquesta')?.text).toContain('stream-direct-mcp');
    expect(lines.some((l) => l.kind === 'tools' && l.text.includes('mcp:sheets:read'))).toBe(true);
    expect(lines.find((l) => l.kind === 'memoria')?.text).toContain('6');
    expect(lines.every((l) => l.id.startsWith('t1:'))).toBe(true);
  });

  it('vuelca tokens, costo, cuello y cada tool', () => {
    const lines = expandTurnToConsoleLines({
      traceId: 't3',
      at: '2026-08-15T21:00:02.000Z',
      agentId: 'ag1',
      agentName: 'Asesor',
      path: 'stream-hub',
      ok: true,
      totalMs: 10000,
      phases: { hub: 8000, reveal: 2000 },
      toolsUsed: ['mcp:sheets:read', 'mcp:hubspot:search'],
      toolRounds: 2,
      model: 'gemini-2.5-flash',
      provider: 'google-ai',
      inputTokens: 1200,
      outputTokens: 400,
      systemChars: 8000,
      toolDefsChars: 3000,
      costUsd: 0.0123,
      replyLen: 520,
      sessionId: 'sess-1',
      widgetId: 'wid-1',
      ragEnabled: true,
      sessionMsgCount: 11,
    });
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain('gemini-2.5-flash');
    expect(text).toMatch(/1[.,]200/);
    expect(text).toContain('mcp:hubspot:search');
    expect(text).toContain('cuello');
    expect(text).toContain('80%');
    expect(text).toContain('0,0123');
    expect(text).toContain('520');
    expect(text).toContain('11 msgs');
  });

  it('marca error sin filtrar el mensaje del visitante', () => {
    const lines = expandTurnToConsoleLines({
      traceId: 't2',
      at: '2026-08-15T21:00:01.000Z',
      agentId: 'ag1',
      agentName: 'Soporte',
      path: 'stream-error',
      ok: false,
      errorCode: 'HUB_ERROR',
      totalMs: 800,
      phases: {},
    });
    expect(lines.some((l) => l.kind === 'error' && l.text.includes('HUB_ERROR'))).toBe(true);
    expect(lines.every((l) => !/visitante|mensaje/i.test(l.text))).toBe(true);
  });
});
