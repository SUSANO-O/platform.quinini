import { describe, it, expect } from 'vitest';
import {
  formatPosition,
  formatTheme,
  multiAgentLabel,
  buildEmbedSnippet,
} from '@/lib/widget-list';

describe('formatPosition', () => {
  it('traduce las cuatro esquinas', () => {
    expect(formatPosition('bottom-right')).toBe('Abajo der.');
    expect(formatPosition('bottom-left')).toBe('Abajo izq.');
    expect(formatPosition('top-right')).toBe('Arriba der.');
    expect(formatPosition('top-left')).toBe('Arriba izq.');
  });

  // Una posición nueva no debe salir con guiones en la tarjeta.
  it('una posición desconocida se muestra sin guiones', () => {
    expect(formatPosition('center-middle')).toBe('center middle');
  });

  it('vacío no rompe', () => {
    expect(formatPosition('')).toBe('');
  });
});

describe('formatTheme', () => {
  it('claro y oscuro', () => {
    expect(formatTheme('dark')).toBe('Oscuro');
    expect(formatTheme('light')).toBe('Claro');
  });

  it('cualquier otro valor se devuelve tal cual', () => {
    expect(formatTheme('auto')).toBe('auto');
  });
});

describe('multiAgentLabel', () => {
  it('los tres modos', () => {
    expect(multiAgentLabel('parallel')).toBe('Paralelo');
    expect(multiAgentLabel('pipeline')).toBe('Pipeline');
    expect(multiAgentLabel('triage')).toBe('Triaje');
  });

  it('sin modo, triaje es el de por defecto', () => {
    expect(multiAgentLabel(undefined)).toBe('Triaje');
  });
});

describe('buildEmbedSnippet', () => {
  it('arma el script con el token y el origen', () => {
    const s = buildEmbedSnippet('wt_abc123', 'https://botiva.space');
    expect(s).toContain('<script src="https://botiva.space/widget.js"></script>');
    expect(s).toContain("token: 'wt_abc123'");
    expect(s).toContain("host:  'https://botiva.space'");
  });

  // Con la barra final quedaría "https://botiva.space//widget.js".
  it('no duplica la barra del origen', () => {
    expect(buildEmbedSnippet('wt_x', 'https://botiva.space/')).toContain(
      '<script src="https://botiva.space/widget.js">',
    );
  });

  it('sin token todavía muestra el hueco, no undefined', () => {
    const s = buildEmbedSnippet('', 'https://botiva.space');
    expect(s).toContain("token: 'wt_…'");
    expect(s).not.toContain('undefined');
  });

  // Un token con comilla rompería el script que el cliente pega en su web.
  it('una comilla en el token no rompe el script', () => {
    const s = buildEmbedSnippet("wt_a'b", 'https://botiva.space');
    expect(s).not.toContain("'wt_a'b'");
    expect(s).toContain("wt_a\\'b");
  });

  it('es un bloque de varias líneas listo para copiar', () => {
    expect(buildEmbedSnippet('wt_x', 'https://botiva.space').split('\n').length).toBeGreaterThan(3);
  });
});
