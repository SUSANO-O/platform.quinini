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
