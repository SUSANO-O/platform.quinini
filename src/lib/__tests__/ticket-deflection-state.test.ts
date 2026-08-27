import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockLoad, mockUpsert } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@/lib/widget-session-context', () => ({
  loadWidgetSessionContext: mockLoad,
  upsertWidgetSessionContext: mockUpsert,
}));

import {
  isAwaitingProblemDescription,
  setAwaitingProblemDescription,
  getPendingDeflectionSurvey,
  setPendingDeflectionSurvey,
  clearTicketDeflectionState,
} from '../ticket-deflection-state';

const W = 'widget1';
const S = 'session1';
const U = 'user1';

function ctxWithFacts(facts: Array<{ key: string; value: string }>) {
  return { widgetId: W, chatSessionId: S, userId: U, summary: '', facts };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
});

describe('isAwaitingProblemDescription', () => {
  it('false sin contexto guardado', async () => {
    mockLoad.mockResolvedValue(null);
    expect(await isAwaitingProblemDescription(W, S, U)).toBe(false);
  });

  it('true con marca reciente', async () => {
    mockLoad.mockResolvedValue(
      ctxWithFacts([{ key: 'ticket_deflection_awaiting_problem', value: new Date().toISOString() }]),
    );
    expect(await isAwaitingProblemDescription(W, S, U)).toBe(true);
  });

  it('false si la marca es vieja (>15 min)', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockLoad.mockResolvedValue(
      ctxWithFacts([{ key: 'ticket_deflection_awaiting_problem', value: old }]),
    );
    expect(await isAwaitingProblemDescription(W, S, U)).toBe(false);
  });

  it('false con parámetros vacíos (no llama a Mongo)', async () => {
    expect(await isAwaitingProblemDescription('', S, U)).toBe(false);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe('setAwaitingProblemDescription', () => {
  it('guarda la marca y limpia cualquier encuesta pendiente previa', async () => {
    mockLoad.mockResolvedValue(
      ctxWithFacts([{ key: 'ticket_deflection_survey', value: '{"sourceText":"x","at":"2026-01-01"}' }]),
    );
    await setAwaitingProblemDescription(W, S, U);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [, , , patch] = mockUpsert.mock.calls[0];
    expect(patch.facts).toHaveLength(1);
    expect(patch.facts[0].key).toBe('ticket_deflection_awaiting_problem');
  });
});

describe('getPendingDeflectionSurvey / setPendingDeflectionSurvey', () => {
  it('null sin contexto', async () => {
    mockLoad.mockResolvedValue(null);
    expect(await getPendingDeflectionSurvey(W, S, U)).toBeNull();
  });

  it('devuelve sourceText cuando la encuesta está fresca', async () => {
    const value = JSON.stringify({ sourceText: 'Restablecé tu contraseña.', at: new Date().toISOString() });
    mockLoad.mockResolvedValue(ctxWithFacts([{ key: 'ticket_deflection_survey', value }]));
    const result = await getPendingDeflectionSurvey(W, S, U);
    expect(result).toEqual({ sourceText: 'Restablecé tu contraseña.' });
  });

  it('null si la encuesta guardada ya venció', async () => {
    const value = JSON.stringify({
      sourceText: 'Restablecé tu contraseña.',
      at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    });
    mockLoad.mockResolvedValue(ctxWithFacts([{ key: 'ticket_deflection_survey', value }]));
    expect(await getPendingDeflectionSurvey(W, S, U)).toBeNull();
  });

  it('null si el JSON guardado está corrupto', async () => {
    mockLoad.mockResolvedValue(ctxWithFacts([{ key: 'ticket_deflection_survey', value: 'no-es-json' }]));
    expect(await getPendingDeflectionSurvey(W, S, U)).toBeNull();
  });

  it('setPendingDeflectionSurvey guarda sourceText + timestamp, reemplazando el awaiting previo', async () => {
    mockLoad.mockResolvedValue(
      ctxWithFacts([{ key: 'ticket_deflection_awaiting_problem', value: new Date().toISOString() }]),
    );
    await setPendingDeflectionSurvey(W, S, U, { sourceText: 'Probá reiniciar la app.' });
    const [, , , patch] = mockUpsert.mock.calls[0];
    expect(patch.facts).toHaveLength(1);
    expect(patch.facts[0].key).toBe('ticket_deflection_survey');
    const stored = JSON.parse(patch.facts[0].value);
    expect(stored.sourceText).toBe('Probá reiniciar la app.');
    expect(typeof stored.at).toBe('string');
  });
});

describe('clearTicketDeflectionState', () => {
  it('quita ambas claves de deflection pero conserva otros facts de la sesión', async () => {
    mockLoad.mockResolvedValue(
      ctxWithFacts([
        { key: 'ticket_deflection_awaiting_problem', value: '2026-01-01' },
        { key: 'ticket_deflection_survey', value: '{}' },
        { key: 'email', value: 'juan@test.com' },
      ]),
    );
    await clearTicketDeflectionState(W, S, U);
    const [, , , patch] = mockUpsert.mock.calls[0];
    expect(patch.facts).toEqual([{ key: 'email', value: 'juan@test.com' }]);
  });
});
