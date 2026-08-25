import { describe, expect, it } from 'vitest';
import { shouldOmitMcpPipelineForTurn } from './widget-mcp-turn-gate';

const OPEN_HISTORY = [
  { role: 'user', content: 'Hola' },
  { role: 'model', content: '¿Me das tu celular?' },
];

describe('shouldOmitMcpPipelineForTurn', () => {
  it('con captura HubSpot no omite MCP al dar nombre, email o teléfono', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: true,
        skillsNeedMcp: true,
        hasExplicitMcpIds: true,
        message: '3287382390',
        history: OPEN_HISTORY,
      }),
    ).toBe(false);
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: true,
        skillsNeedMcp: true,
        hasExplicitMcpIds: true,
        message: 'hola',
        history: [],
      }),
    ).toBe(false);
  });

  it('sin HubSpot ni webhook sí omite MCP en un hola', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: true,
        message: 'hola',
        history: [],
      }),
    ).toBe(true);
  });

  it('sin ninguna señal MCP (skillsNeedMcp y hasExplicitMcpIds false) nunca omite, aunque el mensaje sea trivial', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: false,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: [],
      }),
    ).toBe(false);
    // Ni siquiera con historial abierto o mensaje totalmente distinto cambia: la
    // función corta antes de llegar a evaluar trivialidad si no hay pipeline que omitir.
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: false,
        hasExplicitMcpIds: false,
        message: 'gracias',
        history: OPEN_HISTORY,
      }),
    ).toBe(false);
  });

  it('con solo una señal MCP activa (skillsNeedMcp o hasExplicitMcpIds) igual evalúa trivialidad', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: [],
      }),
    ).toBe(true);
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: false,
        hasExplicitMcpIds: true,
        message: 'hola',
        history: [],
      }),
    ).toBe(true);
  });

  it('mensaje no trivial (con intención) y con señal MCP + historial abierto no omite', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'necesito ayuda con mi pedido',
        history: OPEN_HISTORY,
      }),
    ).toBe(false);
  });

  it('hasWebhook true nunca omite, incluso sin ninguna señal MCP explícita', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: true,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: false,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: [],
      }),
    ).toBe(false);
  });

  it('wantsHubspotAutoCapture true nunca omite, incluso sin ninguna señal MCP explícita', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: true,
        skillsNeedMcp: false,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: [],
      }),
    ).toBe(false);
  });

  it('history undefined no rompe la evaluación de trivialidad', () => {
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: undefined,
      }),
    ).toBe(true);
  });

  it('history con entradas malformadas se filtra sin romper y sin perder el turno abierto válido', () => {
    const messyHistory = [
      null,
      {},
      { role: 123, content: 'no debería contar (role no-string)' },
      { role: 'model', content: 42 },
      'garbage',
      ...OPEN_HISTORY, // última entrada real: pregunta abierta del modelo
      undefined,
    ] as unknown as { role?: string; content?: string }[];

    // "ok" es una confirmación ambigua: como el último turno real del modelo
    // (tras filtrar la basura) es una pregunta, NO debe omitir MCP.
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'ok',
        history: messyHistory,
      }),
    ).toBe(false);
  });

  it('history compuesto solo por entradas malformadas equivale a no tener historial (no crashea)', () => {
    const onlyGarbage = [null, {}, 'oops', 123, { foo: 'bar' }] as unknown as {
      role?: string;
      content?: string;
    }[];
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'ok',
        history: onlyGarbage,
      }),
    ).toBe(true);
  });

  it('history con forma no-array (objeto o string) no rompe, se trata como sin historial', () => {
    expect(() =>
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: {} as unknown as { role?: string; content?: string }[],
      }),
    ).not.toThrow();
    expect(
      shouldOmitMcpPipelineForTurn({
        hasWebhook: false,
        wantsHubspotAutoCapture: false,
        skillsNeedMcp: true,
        hasExplicitMcpIds: false,
        message: 'hola',
        history: 'not-an-array' as unknown as { role?: string; content?: string }[],
      }),
    ).toBe(true);
  });
});
