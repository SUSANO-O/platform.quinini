import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { mockCreate, mockInsertMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockInsertMany: vi.fn(),
}));

vi.mock('@/lib/db/models', () => ({
  WidgetMessage: {
    create: mockCreate,
    insertMany: mockInsertMany,
  },
}));

import {
  emitDoneAndPersist,
  persistWidgetTranscript,
  respondAndPersist,
  schedulePersistWidgetTranscript,
  type PersistTranscriptInput,
} from '@/lib/widget-transcript';

function baseInput(overrides: Partial<PersistTranscriptInput> = {}): PersistTranscriptInput {
  return {
    widgetId: 'w1',
    userId: 'u1',
    agentId: 'a1',
    sessionId: 's1',
    userMessage: 'hola',
    assistantMessage: 'hola, ¿en qué te ayudo?',
    ...overrides,
  };
}

describe('persistWidgetTranscript', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({});
    mockInsertMany.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('guarda user + assistant en una sola llamada', async () => {
    await persistWidgetTranscript(baseInput());
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    const docs = mockInsertMany.mock.calls[0][0] as Array<{ role: string }>;
    expect(docs.map((d) => d.role)).toEqual(['user', 'assistant']);
  });

  it('sin sessionId/widgetId/userId, no hace nada', async () => {
    await persistWidgetTranscript(baseInput({ sessionId: '' }));
    await persistWidgetTranscript(baseInput({ widgetId: '' }));
    await persistWidgetTranscript(baseInput({ userId: '' }));
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('filtra respuestas que parecen tool-calls alucinados, guarda solo el user message', async () => {
    await persistWidgetTranscript(
      baseInput({ assistantMessage: 'Workflow triggered successfully. executionId: "wf_1234"' }),
    );
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ role: 'user' });
  });

  it('si sí ejecutó tools reales, no aplica el filtro anti-alucinación', async () => {
    await persistWidgetTranscript(
      baseInput({
        assistantMessage: 'Workflow triggered successfully. executionId: "wf_1234"',
        toolsUsed: ['mcp:lead:capture'],
      }),
    );
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
  });
});

describe('schedulePersistWidgetTranscript', () => {
  beforeEach(() => {
    mockInsertMany.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('sin respuesta del asistente, no persiste', () => {
    schedulePersistWidgetTranscript(baseInput({ assistantMessage: '   ' }));
    expect(mockInsertMany).not.toHaveBeenCalled();
  });
});

describe('respondAndPersist (no-stream) — único punto responder+guardar', () => {
  beforeEach(() => {
    mockInsertMany.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('persiste y devuelve la misma response', async () => {
    const response = NextResponse.json({ reply: 'hola' });
    const result = respondAndPersist(response, baseInput());
    expect(result).toBe(response);
    // fire-and-forget: darle una vuelta de microtask para que corra
    await Promise.resolve();
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
  });

  it('con persistInput null (ej. rama sin datos suficientes), no persiste pero igual responde', async () => {
    const response = NextResponse.json({ reply: 'hola' });
    const result = respondAndPersist(response, null);
    expect(result).toBe(response);
    await Promise.resolve();
    expect(mockInsertMany).not.toHaveBeenCalled();
  });
});

describe('emitDoneAndPersist (stream) — único punto emitir done+guardar', () => {
  beforeEach(() => {
    mockInsertMany.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('emite el payload tal cual (el caller ya arma type:done) y persiste', async () => {
    const enqueue = vi.fn();
    emitDoneAndPersist(enqueue, { type: 'done', reply: 'hola', agentId: 'a1' }, baseInput());
    expect(enqueue).toHaveBeenCalledWith({ type: 'done', reply: 'hola', agentId: 'a1' });
    await Promise.resolve();
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
  });

  it('con persistInput null, emite el payload pero no persiste', async () => {
    const enqueue = vi.fn();
    emitDoneAndPersist(enqueue, { type: 'done', reply: 'hola' }, null);
    expect(enqueue).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mockInsertMany).not.toHaveBeenCalled();
  });
});
