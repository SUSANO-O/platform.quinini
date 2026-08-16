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
});
