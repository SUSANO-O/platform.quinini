import { describe, expect, it } from 'vitest';
import { getHubUiBase } from '../hub-ui-url';

describe('getHubUiBase', () => {
  it('en producción oculta el enlace si la URL es local o no existe', () => {
    expect(getHubUiBase('http://127.0.0.1:9010', true)).toBeNull();
    expect(getHubUiBase('http://localhost:9010/', true)).toBeNull();
    expect(getHubUiBase(undefined, true)).toBeNull();
    expect(getHubUiBase('no es url', true)).toBeNull();
  });

  it('en producción usa una URL pública, sin barra final', () => {
    expect(getHubUiBase('https://hub.botiva.space/', true)).toBe('https://hub.botiva.space');
  });

  it('en desarrollo mantiene el hub local por defecto', () => {
    expect(getHubUiBase(undefined, false)).toBe('http://127.0.0.1:9010');
  });
});
