import { describe, expect, it } from 'vitest';
import {
  finalizeWidgetNavReply,
  isSafeSameSitePath,
  currentViewBlock,
  pageContextLine,
  stripWidgetNavBlocks,
} from '@/lib/widget-page-nav';

const block = (o: Record<string, unknown>) => '```assist-nav\n' + JSON.stringify(o) + '\n```';

describe('pageContextLine', () => {
  it('conserva parámetros normales y la pestaña (#), quita los sensibles', () => {
    expect(pageContextLine('/views/posiciones.php?path=harold-gps&token=abc&sig=zz#x')).toBe(
      'Página actual del cliente en la app: /views/posiciones.php?path=harold-gps#x',
    );
  });

  it('ficha de dispositivo: dispositivo, fechas y pestaña llegan al agente', () => {
    expect(
      pageContextLine('https://www.tribugps.com/views/visorDisp.php?k_disp=Xch4645&desde=2026-10-02&hasta=2026-10-04#routes-day'),
    ).toBe('Página actual del cliente en la app: /views/visorDisp.php?k_disp=Xch4645&desde=2026-10-02&hasta=2026-10-04#routes-day');
  });

  it('quita parámetros con pinta de secreto (password, session, jwt, api_key, auth…)', () => {
    expect(
      pageContextLine('/views/a.php?k_disp=1&password=x&session_id=y&jwt=z&api_key=w&Authorization=q&o_token=t'),
    ).toBe('Página actual del cliente en la app: /views/a.php?k_disp=1');
  });

  it('acepta URL absoluta y se queda con ruta + parámetros + pestaña', () => {
    expect(pageContextLine('http://192.168.40.8:9090/views/geocercas.php?path=x')).toBe(
      'Página actual del cliente en la app: /views/geocercas.php?path=x',
    );
  });

  it('vacío o raro → sin línea', () => {
    expect(pageContextLine('')).toBe('');
    expect(pageContextLine(undefined)).toBe('');
    expect(pageContextLine('javascript:alert(1)')).toBe('');
  });
});

describe('isSafeSameSitePath', () => {
  it('acepta rutas relativas del mismo sitio', () => {
    expect(isSafeSameSitePath('/views/geocercas.php')).toBe(true);
    expect(isSafeSameSitePath('/views/reportesInformes.php?tab=rutas')).toBe(true);
  });

  it('rechaza otros dominios, esquemas y trucos de redirección', () => {
    for (const bad of [
      'https://evil.com/x',
      '//evil.com/x',
      '/\\evil.com',
      'javascript:alert(1)',
      'views/geocercas.php',
      '/views/<script>.php',
      '',
      '/' + 'a'.repeat(300),
    ]) {
      expect(isSafeSameSitePath(bad), bad).toBe(false);
    }
  });
});

describe('finalizeWidgetNavReply', () => {
  it('convierte el bloque assist-nav en navOffer y lo quita del texto', () => {
    const raw =
      'Las geocercas están en Vigilancia → Geocercas. ¿Quieres que te lleve?\n' +
      block({ path: '/views/geocercas.php', onDecline: 'Vale, cuando quieras.', afterNavigate: 'Ya estás en Geocercas.' });
    const out = finalizeWidgetNavReply(raw);
    expect(out.reply).toBe('Las geocercas están en Vigilancia → Geocercas. ¿Quieres que te lleve?');
    expect(out.navOffer).toEqual({
      path: '/views/geocercas.php',
      onDecline: 'Vale, cuando quieras.',
      afterNavigate: 'Ya estás en Geocercas.',
    });
  });

  it('ruta insegura → no hay botón, pero el bloque igual se quita del texto', () => {
    const out = finalizeWidgetNavReply('Mira esto ' + block({ path: 'https://evil.com', onDecline: 'x' }));
    expect(out.navOffer).toBeUndefined();
    expect(out.reply).toBe('Mira esto');
  });

  it('sin onDecline usa un texto neutro (no el del panel de BotIvA)', () => {
    const out = finalizeWidgetNavReply('Te llevo ' + block({ path: '/views/logs.php' }));
    expect(out.navOffer?.onDecline).toBe('De acuerdo, puedes ir cuando quieras desde el menú.');
  });

  it('JSON roto → sin botón y texto limpio', () => {
    const out = finalizeWidgetNavReply('Hola\n```assist-nav\n{roto\n```');
    expect(out.navOffer).toBeUndefined();
    expect(out.reply).toBe('Hola');
  });

  it('respuesta normal queda intacta', () => {
    expect(finalizeWidgetNavReply('Hola, ¿en qué te ayudo?')).toEqual({ reply: 'Hola, ¿en qué te ayudo?' });
  });
});

describe('stripWidgetNavBlocks', () => {
  it('quita bloques para el streaming de tokens', () => {
    expect(stripWidgetNavBlocks('Hola ' + block({ path: '/views/logs.php' }) + ' fin')).toBe('Hola  fin'.trim());
  });
});

describe('currentViewBlock — "¿dónde estoy?" sin adivinar', () => {
  it('con página: la marca como única fuente de verdad e incluye el título', () => {
    const b = currentViewBlock('http://localhost:9090/views/reportesDashboard.php?path=x', '  TRIBU · Dashboard  ');
    expect(b).toContain('Página actual del cliente en la app: /views/reportesDashboard.php?path=x');
    expect(b).toContain('Título de la página: TRIBU · Dashboard');
    expect(b).toMatch(/nunca la deduzcas de mensajes anteriores/i);
  });

  it('sin página: lo dice y prohíbe adivinar por el historial', () => {
    const b = currentViewBlock(undefined, undefined);
    expect(b).toMatch(/VISTA ACTUAL DESCONOCIDA/);
    expect(b).toMatch(/ya NO vale como ubicación actual/);
  });

  it('el título se limpia: sin saltos ni texto enorme', () => {
    const b = currentViewBlock('/views/a.php', 'Hola\nmundo' + 'x'.repeat(500));
    expect(b).toContain('Título de la página: Hola mundo');
    expect(b.split('\n').find((l) => l.startsWith('Título'))!.length).toBeLessThanOrEqual(141);
  });
});
