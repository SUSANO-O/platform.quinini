import { describe, expect, it, vi } from 'vitest';

/**
 * Banco de pruebas de agentes (Fase 1): validación de casos, juez, informe y ejecución de un turno
 * con la misma cadena que la ruta real del chat (y siempre en modo de prueba).
 */
vi.mock('@/lib/db/connection', () => ({ connectDB: vi.fn() }));
vi.mock('@/lib/db/models', () => ({ Widget: {}, ClientAgent: {} }));
vi.mock('@/lib/widget-page-visits', () => ({ getWidgetAppMap: vi.fn(), getWidgetScreenContextEnabled: vi.fn() }));
vi.mock('@/lib/aibackhub-sync', () => ({
  hubCreateHeaders: () => ({}),
  hubFetch: vi.fn(),
  getAibackhubBaseUrl: () => 'https://hub.test',
  syncHubCatalogFromLandingAgentDoc: vi.fn(),
}));

import { caseUserTextHasContactData, validateEvalSuite, type EvalCase } from '@/lib/eval/agent-eval-cases';
import { buildJudgePrompt, JUDGE_ATTEMPTS, judgeReply, parseJudgeResult } from '@/lib/eval/agent-eval-judge';
import { compareEvalRuns, renderEvalReport, summarizeEvalRun, type EvalCaseResult } from '@/lib/eval/agent-eval-report';
import { applyStrictPurpose, buildEvalChatBody, runEvalTurn, type EvalAgentContext, type EvalTurnDeps } from '@/lib/eval/agent-eval-runner';
import { STRICT_PURPOSE_SUFFIX } from '@/lib/widget-strict-purpose';

const CASE: EvalCase = {
  id: 'rutas-persona',
  category: 'navegacion',
  message: '¿Dónde veo el recorrido de ayer de mi moto?',
  expect: { behavior: 'answer', facts: ['☰ → Mis dispositivos → Rutas', 'elegir la fecha'], mustNot: ['Vigilancia → Rutas como única opción'] },
  source: 'Instrucciones A.1 / Documento A.2',
};

function suite(cases: unknown[]) {
  return { agent: 'navi-app', widgetId: '6abdb5c5105a5614da637efb', cases };
}

describe('validateEvalSuite', () => {
  it('acepta una suite bien formada', () => {
    expect(validateEvalSuite(suite([CASE]))).toEqual([]);
  });

  it('detecta ids repetidos, comportamiento inválido y casos "answer" sin datos', () => {
    const errs = validateEvalSuite(
      suite([
        CASE,
        { ...CASE },
        { ...CASE, id: 'otro', expect: { behavior: 'inventado' } },
        { ...CASE, id: 'sin-datos', expect: { behavior: 'answer', facts: [] } },
      ]),
    );
    expect(errs.join('\n')).toMatch(/repetido/);
    expect(errs.join('\n')).toMatch(/behavior/);
    expect(errs.join('\n')).toMatch(/al menos un dato/);
  });

  it('rechaza emails o teléfonos en lo que escribe el usuario (dispararían captura de leads)', () => {
    expect(caseUserTextHasContactData({ message: 'mi correo es ana@correo.co' })).toBe(true);
    expect(caseUserTextHasContactData({ message: 'llámame al 300 123 4567' })).toBe(true);
    expect(caseUserTextHasContactData({ message: 'hola', history: [{ role: 'user', content: 'soy pepe 3001234567' }] })).toBe(true);
    // Lo que dice el agente sí puede llevar teléfonos (líneas de soporte).
    expect(caseUserTextHasContactData({ message: '¿y entonces?', history: [{ role: 'model', content: 'Llama al 321 359 8997' }] })).toBe(false);
    expect(validateEvalSuite(suite([{ ...CASE, message: 'escríbeme a ana@correo.co' }])).join()).toMatch(/emails ni teléfonos/);
  });

  it('exige "source" (la respuesta esperada sale de una fuente)', () => {
    expect(validateEvalSuite(suite([{ ...CASE, source: '' }])).join()).toMatch(/source/);
  });
});

describe('juez', () => {
  it('el prompt incluye comportamiento, datos esperados, prohibiciones, historial y respuesta', () => {
    const { systemPrompt, prompt } = buildJudgePrompt(
      { ...CASE, history: [{ role: 'user', content: 'hola' }, { role: 'model', content: 'Hola, soy Navi' }] },
      'Ve a ☰ → Mis dispositivos → Rutas.',
    );
    expect(systemPrompt).toMatch(/no uses tu propio conocimiento/);
    expect(prompt).toContain('[0] ☰ → Mis dispositivos → Rutas');
    expect(prompt).toContain('Vigilancia → Rutas como única opción');
    expect(prompt).toContain('Agente: Hola, soy Navi');
    expect(prompt).toContain('Ve a ☰ → Mis dispositivos → Rutas.');
  });

  it('lee el JSON aunque venga envuelto y descarta índices fuera de rango', () => {
    const r = parseJudgeResult('```json\n{"verdict":"partial","factsCovered":[0,5,0],"unsupportedClaims":["x"],"reason":"falta la fecha"}\n```', 2);
    expect(r).toEqual({ verdict: 'partial', factsCovered: [0], unsupportedClaims: ['x'], reason: 'falta la fecha' });
    expect(parseJudgeResult('no es json', 2)).toBeNull();
    expect(parseJudgeResult('{"verdict":"genial"}', 2)).toBeNull();
  });

  it('reintenta una vez si el juez devuelve algo ilegible', async () => {
    const call = vi.fn().mockResolvedValueOnce('???').mockResolvedValueOnce('{"verdict":"correct","factsCovered":[0,1],"reason":"ok"}');
    const r = await judgeReply(CASE, 'Ve a ☰ → Mis dispositivos → Rutas y elige la fecha.', call);
    expect(r.verdict).toBe('correct');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('se rinde tras JUDGE_ATTEMPTS respuestas ilegibles (el script marca el caso y sigue)', async () => {
    const call = vi.fn().mockResolvedValue('{"verdict": "correct", "factsCove');
    await expect(judgeReply(CASE, 'respuesta', call)).rejects.toThrow(/veredicto válido/);
    expect(call).toHaveBeenCalledTimes(JUDGE_ATTEMPTS);
  });

  it('respuesta vacía = incorrecta sin llamar al juez', async () => {
    const call = vi.fn();
    expect((await judgeReply(CASE, '  ', call)).verdict).toBe('incorrect');
    expect(call).not.toHaveBeenCalled();
  });
});

function result(id: string, verdict: EvalCaseResult['judge']['verdict'], category = 'navegacion', latencyMs = 1000): EvalCaseResult {
  return { id, category, message: `pregunta ${id}`, reply: `respuesta ${id}`, path: 'infer-direct', latencyMs, judge: { verdict, factsCovered: [], unsupportedClaims: [], reason: 'r' } };
}

describe('informe', () => {
  const results = [
    result('a', 'correct', 'navegacion', 1000),
    result('b', 'partial', 'navegacion', 2000),
    result('c', 'hallucination', 'soporte', 3000),
    result('d', 'wrong_refusal', 'soporte', 4000),
  ];

  it('resume puntuación (correct + ½ partial), inventos, "no sé" de más, latencia y categorías', () => {
    const s = summarizeEvalRun('navi-app', '2026-11-06T20:00:00Z', results);
    expect(s.score).toBe(0.375);
    expect(s.accuracy).toBe(0.25);
    expect(s.hallucinationRate).toBe(0.25);
    expect(s.wrongRefusalRate).toBe(0.25);
    expect(s.latencyP50Ms).toBe(3000);
    expect(s.byCategory).toEqual({ navegacion: { total: 2, score: 0.75 }, soporte: { total: 2, score: 0 } });
  });

  it('compara con la corrida anterior: mejoras, empeoramientos y deltas', () => {
    const beforeResults = [result('a', 'partial'), result('b', 'correct'), result('c', 'correct'), result('d', 'wrong_refusal')];
    const before = { summary: summarizeEvalRun('navi-app', 't0', beforeResults), results: beforeResults };
    const after = { summary: summarizeEvalRun('navi-app', 't1', results), results };
    const cmp = compareEvalRuns(before, after);
    expect(cmp.improvements.map((r) => r.id)).toEqual(['a']);
    expect(cmp.regressions.map((r) => r.id)).toEqual(['b', 'c']);
    expect(cmp.hallucinationDelta).toBe(0.25);
  });

  it('el markdown lista los casos a revisar con la respuesta y el motivo', () => {
    const md = renderEvalReport(summarizeEvalRun('navi-app', 't', results), results);
    expect(md).toContain('# Banco de pruebas — navi-app');
    expect(md).toContain('🚨 inventó · c (soporte)');
    expect(md).not.toContain('· a (navegacion)');
  });
});

const CTX: EvalAgentContext = {
  widgetId: 'w1',
  ownerUserId: 'owner1',
  agentId: 'agent1',
  appMap: [{ path: '/views/posiciones.php', name: 'Posiciones' }],
  screenContextEnabled: true,
  strictPurposeOnly: false,
  systemPrompt: 'Eres Navi.',
  judgeSources: '## Instrucciones del agente\nEres Navi.',
};

function deps(over: Partial<EvalTurnDeps> = {}): EvalTurnDeps {
  let t = 0;
  return {
    enrich: vi.fn(async ({ rawBody }) => rawBody),
    hubMcp: vi.fn(async () => null),
    infer: vi.fn(async () => null),
    now: () => (t += 500),
    ...over,
  };
}

describe('runEvalTurn — misma cadena que la ruta, siempre en modo de prueba', () => {
  it('el cuerpo lleva sesión/visitante de prueba y la página; nunca widgetId', () => {
    const body = JSON.parse(buildEvalChatBody(CTX, { ...CASE, pagePath: '/views/posiciones.php', screenContext: 'Menú: A · B' }, 'r1'));
    expect(body).toMatchObject({ agentId: 'agent1', sessionId: 'eval_r1_rutas-persona', visitorId: 'eval_r1', pagePath: '/views/posiciones.php' });
    expect(body.widgetId).toBeUndefined();
  });

  it('responde por el hub con herramientas en modo de prueba', async () => {
    const d = deps({ hubMcp: vi.fn(async () => ({ reply: 'Ve a Rutas' })) });
    const r = await runEvalTurn(CTX, CASE, 'r1', d);
    expect(r).toMatchObject({ reply: 'Ve a Rutas', path: 'hub-mcp' });
    expect(d.hubMcp).toHaveBeenCalledWith(expect.objectContaining({ sandbox: true, appMap: CTX.appMap, screenContextEnabled: true }));
    expect(d.enrich).toHaveBeenCalledWith({ rawBody: expect.any(String), ownerUserId: 'owner1' });
    expect(d.infer).not.toHaveBeenCalled();
  });

  it('sin herramientas (NO_MCP_TOOLS) sigue por la inferencia directa con allowWithoutMcp', async () => {
    const d = deps({
      hubMcp: vi.fn(async (p) => {
        p.outcome!.noMcpTools = true;
        return null;
      }),
      infer: vi.fn(async () => ({ reply: 'Ve a Rutas' })),
    });
    const r = await runEvalTurn(CTX, CASE, 'r1', d);
    expect(r.path).toBe('infer-direct');
    expect(d.infer).toHaveBeenCalledWith(expect.objectContaining({ allowWithoutMcp: true }));
  });

  it('aplica "solo propósito" como la ruta', () => {
    const out = JSON.parse(applyStrictPurpose(JSON.stringify({ message: 'x' }), { strictPurposeOnly: true, systemPrompt: 'Eres Navi.' }));
    expect(out.systemPromptOverride).toBe('Eres Navi.' + STRICT_PURPOSE_SUFFIX);
    expect(applyStrictPurpose('{"message":"x"}', { strictPurposeOnly: false, systemPrompt: 'x' })).toBe('{"message":"x"}');
  });

  it('un error no tumba la corrida: queda registrado en el caso', async () => {
    const r = await runEvalTurn(CTX, CASE, 'r1', deps({ hubMcp: vi.fn(async () => { throw new Error('hub caído'); }) }));
    expect(r).toMatchObject({ reply: '', path: 'none', error: 'hub caído' });
  });
});

import { assertHubSupportsSandbox } from '@/lib/eval/agent-eval-runner';

describe('assertHubSupportsSandbox — candado de seguridad', () => {
  const health = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it('pasa si el hub anuncia el modo de prueba', async () => {
    await expect(assertHubSupportsSandbox('https://hub.test/', health({ ok: true, features: ['widget-chat-sandbox'] }))).resolves.toBeUndefined();
  });

  it('se niega con un hub sin modo de prueba (ejecutaría las herramientas de verdad)', async () => {
    await expect(assertHubSupportsSandbox('https://hub.test', health({ ok: true }))).rejects.toThrow(/ejecutaría de verdad/);
  });

  it('se niega si no puede comprobarlo', async () => {
    const down = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(assertHubSupportsSandbox('https://hub.test', down)).rejects.toThrow(/No se corre el banco/);
  });
});

import { JUDGE_SOURCES_MAX_CHARS } from '@/lib/eval/agent-eval-judge';
import { buildJudgeSources } from '@/lib/eval/agent-eval-runner';

describe('el juez ve las fuentes del agente', () => {
  it('un dato extra que está en las fuentes no es invención: el prompt las incluye y la regla lo dice', () => {
    const { systemPrompt, prompt } = buildJudgePrompt(CASE, 'Ve a Rutas. El logo de arriba te devuelve al mapa.', 'El logo de arriba siempre lo devuelve al mapa.');
    expect(systemPrompt).toContain('FUENTES DEL AGENTE');
    expect(systemPrompt).toContain('El logo de arriba siempre lo devuelve al mapa.');
    expect(systemPrompt).toMatch(/Un dato extra que SÍ está en las fuentes no es invención/);
    expect(prompt).not.toContain('FUENTES DEL AGENTE');
  });

  it('recorta fuentes enormes', () => {
    const { systemPrompt } = buildJudgePrompt(CASE, 'x', 'a'.repeat(JUDGE_SOURCES_MAX_CHARS + 5000));
    expect(systemPrompt.length).toBeLessThan(JUDGE_SOURCES_MAX_CHARS + 5000);
  });

  it('el mensaje al hub nunca pasa de 16k (el hub lo recortaría y el juez perdería la respuesta)', () => {
    const long = { ...CASE, history: Array.from({ length: 6 }, () => ({ role: 'model' as const, content: 'b'.repeat(900) })) };
    const { prompt } = buildJudgePrompt(long, 'r'.repeat(50_000), 'a'.repeat(200_000));
    expect(prompt.length).toBeLessThan(16_000);
    expect(prompt).toContain('RESPUESTA DEL AGENTE');
  });

  it('sin fuentes no añade el bloque', () => {
    expect(buildJudgePrompt(CASE, 'x').systemPrompt).not.toContain('<<<FUENTES');
  });

  it('buildJudgeSources junta instrucciones y documentos con su nombre', () => {
    const src = buildJudgeSources({ systemPrompt: 'Eres Navi.', ragSources: [{ name: 'guia.md', content: 'Paso 1' }, { name: 'vacio', content: ' ' }] });
    expect(src).toContain('## Instrucciones del agente\nEres Navi.');
    expect(src).toContain('## Documento: guia.md\nPaso 1');
    expect(src).not.toContain('vacio');
  });
});
