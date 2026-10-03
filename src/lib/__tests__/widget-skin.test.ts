import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeWidgetSkin as normalizeServer, WIDGET_SKIN_FONTS } from '@/lib/widget-skin';

/** El widget es JS plano concatenado en el build: se carga el archivo tal cual. */
const src = readFileSync(resolve(__dirname, '../../../scripts/widget/skin.js'), 'utf8');
const mod = new Function(`${src}; return { normalizeWidgetSkin, buildWidgetSkinCss, WIDGET_SKIN_FONTS };`)() as {
  normalizeWidgetSkin: (raw: unknown) => Record<string, string>;
  buildWidgetSkinCss: (rootId: string, skin: unknown) => string;
  WIDGET_SKIN_FONTS: Record<string, string>;
};

describe('normalizeWidgetSkin (servidor y widget iguales)', () => {
  it('acepta colores hex y valores conocidos; descarta el resto', () => {
    const raw = {
      headerBg: '#FF5500', headerText: '#fff', chatBg: 'red', userBubbleBg: '#12345', botBubbleText: '#000000',
      fontFamily: 'Poppins', fontScale: 'lg', inventado: '#ffffff',
    };
    const expected = { headerBg: '#ff5500', headerText: '#ffffff', botBubbleText: '#000000', fontFamily: 'Poppins', fontScale: 'lg' };
    expect(normalizeServer(raw)).toEqual(expected);
    expect(mod.normalizeWidgetSkin(raw)).toEqual(expected);
  });

  it('rechaza intentos de inyectar CSS', () => {
    const raw = { headerBg: '#fff;} body{display:none', fontFamily: 'Arial;}*{x:y', fontScale: 'xxl' };
    expect(normalizeServer(raw)).toEqual({});
    expect(mod.normalizeWidgetSkin(raw)).toEqual({});
  });

  it('vacío o basura → {} (aspecto de siempre)', () => {
    expect(normalizeServer(null)).toEqual({});
    expect(mod.normalizeWidgetSkin('x')).toEqual({});
  });

  it('las listas de fuentes del servidor y del widget coinciden', () => {
    expect(Object.keys(mod.WIDGET_SKIN_FONTS).sort()).toEqual([...WIDGET_SKIN_FONTS].sort());
  });
});

describe('buildWidgetSkinCss', () => {
  it('sin personalización no genera nada', () => {
    expect(mod.buildWidgetSkinCss('r1', {})).toBe('');
  });

  it('cabecera: fondo, y color en nombre, subtítulo e iconos de acciones', () => {
    const css = mod.buildWidgetSkinCss('r1', { headerBg: '#112233', headerText: '#ffffff' });
    expect(css).toContain('#r1 .afhub-header{background:#112233 !important');
    expect(css).toMatch(/#r1 \.afhub-header,#r1 \.afhub-header \*\{color:#ffffff !important/);
    expect(css).toContain('#r1 .afhub-header svg{stroke:currentColor');
  });

  it('pie, chat, burbujas, botón flotante y tipografía', () => {
    const css = mod.buildWidgetSkinCss('r1', {
      footerBg: '#eeeeee', inputBg: '#ffffff', inputText: '#111111', sendBg: '#00aa00',
      chatBg: '#fafafa', userBubbleBg: '#0000ff', userBubbleText: '#ffffff',
      botBubbleBg: '#f0f0f0', botBubbleText: '#222222', fabBg: '#ff0000',
      fontFamily: 'inherit', fontScale: 'sm',
    });
    for (const frag of [
      '.afhub-input-area,#r1 .afhub-policy,#r1 .afhub-powered{background:#eeeeee',
      '.afhub-input-composer{background:#ffffff',
      '.afhub-input-composer-inner,#r1 .afhub-input-wrap,#r1 .afhub-input{background:#ffffff',
      '.afhub-input{color:#111111',
      '.afhub-send{background:#00aa00',
      '.afhub-messages{background:#fafafa',
      '.afhub-msg.user{background:#0000ff !important;color:#ffffff',
      '.afhub-msg.bot{background:#f0f0f0 !important;color:#222222',
      '.afhub-fab{background:#ff0000',
      'font-family:inherit !important',
      '.afhub-messages{font-size:13px',
    ]) expect(css, frag).toContain(frag);
  });

  it('valores inválidos no llegan al CSS', () => {
    expect(mod.buildWidgetSkinCss('r1', { headerBg: 'url(javascript:x)' })).toBe('');
  });
});

describe('contrastRatio', () => {
  it('blanco/negro 21, mismo color 1, gris claro sobre blanco bajo', async () => {
    const { contrastRatio } = await import('@/lib/widget-skin');
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
    expect(contrastRatio('#dddddd', '#ffffff')).toBeLessThan(2);
  });
});

describe('fase 2 — tamaños, visibilidad y texto del pie', () => {
  it('acota tamaños a rangos seguros y solo acepta true en los "ocultar"', () => {
    const raw = { chatWidth: 900, chatHeight: '500', fabSize: 10, edgeOffset: 30, hideAvatar: true, hideTimestamps: 'sí', hideOnlineDot: true };
    const expected = { chatWidth: 520, chatHeight: 500, fabSize: 48, edgeOffset: 30, hideAvatar: true, hideOnlineDot: true };
    expect(normalizeServer(raw)).toEqual(expected);
    expect(mod.normalizeWidgetSkin(raw)).toEqual(expected);
  });

  it('texto del pie: limpio y recortado; enlace solo https', () => {
    const raw = { footerNote: '  Atención\nL-V 8 a 6 <b>x</b> ' + 'y'.repeat(200), footerNoteUrl: 'javascript:alert(1)' };
    const n = normalizeServer(raw);
    expect(n.footerNote!.length).toBeLessThanOrEqual(120);
    expect(n.footerNote).not.toMatch(/[<>\n]/);
    expect(n.footerNoteUrl).toBeUndefined();
    expect(mod.normalizeWidgetSkin(raw)).toEqual(n);
    expect(normalizeServer({ footerNote: 'x', footerNoteUrl: 'https://tribugps.com/ayuda' }).footerNoteUrl).toBe('https://tribugps.com/ayuda');
  });

  it('CSS: ancho/alto solo en modo flotante, botón sin avatar, y ocultar elementos', () => {
    const css = mod.buildWidgetSkinCss('r1', { chatWidth: 440, chatHeight: 620, fabSize: 70, hideAvatar: true, hideOnlineDot: true, hideTimestamps: true });
    expect(css).toContain('.afhub-chat:not(.afhub-chat--sidebar):not(.afhub-chat--fullscreen){width:440px !important;height:620px !important;}');
    expect(css).toContain('.afhub-fab:not(.afhub-fab--avatar){width:70px !important;height:70px !important;}');
    expect(css).toContain('.afhub-header .afhub-avatar{display:none !important;}');
    expect(css).toContain('.afhub-status-dot{display:none !important;}');
    expect(css).toContain('.afhub-msg-time{display:none !important;}');
  });
});

describe('guardado automático de Apariencia', () => {
  it('incluye skin (antes los colores por zona solo se guardaban al pulsar Guardar)', async () => {
    const { pickWidgetAppearancePatch } = await import('@/lib/widget-ai-beam');
    expect(pickWidgetAppearancePatch({ color: '#000000', skin: { headerBg: '#ff0000' } }).skin).toEqual({ headerBg: '#ff0000' });
  });
});

describe('fase 2 del estudio — paleta de marca y plantillas', () => {
  it('brandPalette: tonos de la marca de claro a oscuro + neutros, todos hex válidos', async () => {
    const { brandPalette } = await import('@/lib/widget-skin');
    const pal = brandPalette('#e63312');
    expect(pal.brand).toHaveLength(7);
    expect(pal.brand[3]).toBe('#e63312');
    expect(pal.neutral).toContain('#ffffff');
    for (const c of [...pal.brand, ...pal.neutral]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('plantillas: cada una es un skin válido y todos sus textos se leen (contraste ≥ 4,5)', async () => {
    const { skinTemplates, normalizeWidgetSkin, contrastRatio } = await import('@/lib/widget-skin');
    for (const brand of ['#e63312', '#006b7d', '#f5d90a', '#111111']) {
      for (const t of skinTemplates(brand)) {
        expect(normalizeWidgetSkin(t.skin), t.id).toEqual(t.skin);
        for (const [text, bg] of [['headerText', 'headerBg'], ['userBubbleText', 'userBubbleBg'], ['botBubbleText', 'botBubbleBg']] as const) {
          if (t.skin[text] && t.skin[bg]) {
            expect(contrastRatio(t.skin[text]!, t.skin[bg]!), `${brand} ${t.id} ${text}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('legibleBg: oscurece lo mínimo para que el texto se lea; un color ya legible no cambia', async () => {
    const { legibleBg, readableOn, contrastRatio } = await import('@/lib/widget-skin');
    const fixed = legibleBg('#e63312');
    expect(contrastRatio(readableOn(fixed), fixed)).toBeGreaterThanOrEqual(4.5);
    expect(fixed).not.toBe('#e63312');
    expect(legibleBg('#006b7d')).toBe('#006b7d');
  });

  it('readableOn: elige blanco o casi negro según el fondo', async () => {
    const { readableOn } = await import('@/lib/widget-skin');
    expect(readableOn('#f5d90a')).toBe('#111111');
    expect(readableOn('#006b7d')).toBe('#ffffff');
  });
});
