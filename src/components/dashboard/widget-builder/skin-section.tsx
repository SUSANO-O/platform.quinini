'use client';

/**
 * "Colores y tipografía": personalización por zona (Widget.skin). Cada color vacío = el del tema.
 * Avisa cuando un texto se leería mal sobre su fondo (contraste WCAG < 4,5).
 */

import { contrastRatio, WIDGET_SKIN_FONTS, type WidgetSkin, type WidgetSkinColorKey } from '@/lib/widget-skin';
import { WidgetBuilderHint, WidgetBuilderSection } from './ui';

const GROUPS: { title: string; fields: { key: WidgetSkinColorKey; label: string }[] }[] = [
  { title: 'Cabecera (nombre y acciones)', fields: [{ key: 'headerBg', label: 'Fondo' }, { key: 'headerText', label: 'Texto e iconos' }] },
  {
    title: 'Pie (zona de escribir)',
    fields: [
      { key: 'footerBg', label: 'Fondo' },
      { key: 'inputBg', label: 'Caja de texto' },
      { key: 'inputText', label: 'Texto escrito' },
      { key: 'sendBg', label: 'Botón enviar' },
    ],
  },
  { title: 'Conversación', fields: [{ key: 'chatBg', label: 'Fondo del chat' }] },
  { title: 'Mensajes del usuario', fields: [{ key: 'userBubbleBg', label: 'Fondo' }, { key: 'userBubbleText', label: 'Texto' }] },
  { title: 'Mensajes del asistente', fields: [{ key: 'botBubbleBg', label: 'Fondo' }, { key: 'botBubbleText', label: 'Texto' }] },
  { title: 'Botón flotante', fields: [{ key: 'fabBg', label: 'Fondo' }] },
];

/** Pares texto/fondo para el aviso de contraste. */
const PAIRS: [WidgetSkinColorKey, WidgetSkinColorKey, string][] = [
  ['headerText', 'headerBg', 'la cabecera'],
  ['inputText', 'inputBg', 'la caja de texto'],
  ['userBubbleText', 'userBubbleBg', 'los mensajes del usuario'],
  ['botBubbleText', 'botBubbleBg', 'los mensajes del asistente'],
];

const FONT_LABELS: Record<string, string> = { inherit: 'La de mi web', system: 'Del sistema' };

export function WidgetBuilderSkinSection({
  skin,
  onChange,
}: {
  skin: WidgetSkin;
  onChange: (skin: WidgetSkin) => void;
}) {
  const set = (key: keyof WidgetSkin, value: string | undefined) => {
    const next: WidgetSkin = { ...skin };
    if (value) (next as Record<string, string>)[key] = value;
    else delete (next as Record<string, string>)[key];
    onChange(next);
  };
  const warnings = PAIRS.filter(([t, b]) => skin[t] && skin[b] && contrastRatio(skin[t]!, skin[b]!) < 4.5).map(
    ([t, b, where]) => `El texto de ${where} se lee mal sobre su fondo (contraste ${contrastRatio(skin[t]!, skin[b]!)}:1; mínimo recomendado 4,5).`,
  );
  const hasAny = Object.keys(skin).length > 0;

  return (
    <WidgetBuilderSection
      tourId="widget-builder-skin"
      title="Colores y tipografía"
      description="Colores por zona y fuente. Lo que dejes sin elegir usa el color principal y el tema."
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p style={{ fontSize: 12.5, fontWeight: 600, margin: '0 0 6px' }}>{g.title}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {g.fields.map((f) => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input
                    type="color"
                    aria-label={`${g.title}: ${f.label}`}
                    value={skin[f.key] ?? '#ffffff'}
                    onChange={(e) => set(f.key, e.target.value)}
                    style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, opacity: skin[f.key] ? 1 : 0.45 }}
                  />
                  <span>{f.label}</span>
                  {skin[f.key] ? (
                    <button
                      type="button"
                      onClick={() => set(f.key, undefined)}
                      aria-label={`Quitar ${f.label} de ${g.title}`}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)' }}
                    >
                      ✕
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>(por defecto)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            Fuente
            <select
              value={skin.fontFamily ?? ''}
              onChange={(e) => set('fontFamily', e.target.value || undefined)}
              aria-label="Fuente del widget"
            >
              <option value="">Por defecto (Plus Jakarta Sans)</option>
              {WIDGET_SKIN_FONTS.map((f) => (
                <option key={f} value={f}>{FONT_LABELS[f] ?? f}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            Tamaño del texto
            <select
              value={skin.fontScale ?? ''}
              onChange={(e) => set('fontScale', e.target.value || undefined)}
              aria-label="Tamaño del texto"
            >
              <option value="">Normal</option>
              <option value="sm">Pequeño</option>
              <option value="lg">Grande</option>
            </select>
          </label>
          {hasAny ? (
            <button type="button" onClick={() => onChange({})} style={{ fontSize: 12.5, cursor: 'pointer' }}>
              Restablecer todo
            </button>
          ) : null}
        </div>

        {warnings.map((w) => (
          <WidgetBuilderHint key={w}>⚠️ {w}</WidgetBuilderHint>
        ))}
      </div>
    </WidgetBuilderSection>
  );
}
