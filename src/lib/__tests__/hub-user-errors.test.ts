import { describe, expect, it } from 'vitest';
import {
  friendlyHubErrorMessage,
  HUB_MCP_CATALOG_USER_MESSAGE,
  isTechnicalHubError,
} from '@/lib/hub-user-errors';

describe('hub-user-errors', () => {
  it('detects technical infra messages', () => {
    expect(isTechnicalHubError('fetch failed')).toBe(true);
    expect(isTechnicalHubError('Falta BACKEND_URL en el entorno')).toBe(true);
    expect(isTechnicalHubError('Error al contactar AIBackHub')).toBe(true);
  });

  it('returns friendly copy for technical errors', () => {
    expect(friendlyHubErrorMessage('fetch failed', HUB_MCP_CATALOG_USER_MESSAGE)).toBe(
      'No se pudo conectar con Stargate.',
    );
  });

  it('keeps non-technical business messages', () => {
    expect(friendlyHubErrorMessage('Ningún modelo disponible para tu plan.')).toBe(
      'Ningún modelo disponible para tu plan.',
    );
  });
});
