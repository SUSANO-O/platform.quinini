import { describe, it, expect } from 'vitest';
import { generateWidgetSnippet } from '@/lib/widget-builder/snippet';
import type { WidgetConfig } from '@/lib/widget-builder/types';

// La configuración no interviene en el fragmento; basta un objeto vacío.
const cfg = {} as WidgetConfig;

describe('generateWidgetSnippet', () => {
  it('incluye el token y el script del SDK', () => {
    const s = generateWidgetSnippet(cfg, 'wt_abc123');
    expect(s).toContain("token: 'wt_abc123'");
    expect(s).toMatch(/<script src=".*\/widget\.js\?v=.*"><\/script>/);
  });

  it('sin token deja el marcador, no undefined', () => {
    const s = generateWidgetSnippet(cfg);
    expect(s).toContain("token: 'YOUR_TOKEN'");
    expect(s).not.toContain('undefined');
  });

  // El fragmento lo pega el cliente en su web: una comilla sin escapar
  // cerraría la cadena y rompería la página de quien lo instale.
  it('escapa una comilla simple en el token', () => {
    const s = generateWidgetSnippet(cfg, "wt_a'b");
    expect(s).not.toContain("token: 'wt_a'b'");
    expect(s).toContain("wt_a\\'b");
  });

  it('escapa la barra invertida', () => {
    expect(generateWidgetSnippet(cfg, 'wt_a\\b')).toContain('wt_a\\\\b');
  });

  // Un token con un cierre de etiqueta no debe poder salirse del <script>.
  it('no deja cerrar la etiqueta script desde el token', () => {
    const s = generateWidgetSnippet(cfg, 'wt_x</script><script>alert(1)</script>');
    expect(s).not.toContain('</script><script>alert(1)');
  });

  it('un token vacío cae al marcador', () => {
    expect(generateWidgetSnippet(cfg, '')).toContain("token: 'YOUR_TOKEN'");
  });

  it('es un bloque de varias líneas listo para copiar', () => {
    expect(generateWidgetSnippet(cfg, 'wt_x').split('\n').length).toBeGreaterThan(3);
  });
});
