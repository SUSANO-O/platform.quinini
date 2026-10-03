'use client';

/**
 * "Colores, tipografía y diseño" (Widget.skin) en el estudio: plantillas de un clic, selector de
 * color con la paleta de la marca e insignia de contraste en cada texto. Vacío = aspecto de siempre.
 */

import { useEffect, useRef, useState } from 'react';
import {
  brandPalette,
  contrastRatio,
  skinTemplates,
  WIDGET_SKIN_COLOR_KEYS,
  WIDGET_SKIN_FONTS,
  WIDGET_SKIN_RANGES,
  type WidgetSkin,
  type WidgetSkinColorKey,
} from '@/lib/widget-skin';
import { WidgetBuilderSection } from './ui';
import './skin-section.css';

const GROUPS: { title: string; fields: { key: WidgetSkinColorKey; label: string; on?: WidgetSkinColorKey }[] }[] = [
  { title: 'Cabecera', fields: [{ key: 'headerBg', label: 'Fondo' }, { key: 'headerText', label: 'Nombre e iconos', on: 'headerBg' }] },
  {
    title: 'Pie',
    fields: [
      { key: 'footerBg', label: 'Fondo' },
      { key: 'inputBg', label: 'Caja de texto' },
      { key: 'inputText', label: 'Texto escrito', on: 'inputBg' },
      { key: 'sendBg', label: 'Botón enviar' },
    ],
  },
  { title: 'Conversación', fields: [{ key: 'chatBg', label: 'Fondo del chat' }] },
  { title: 'Mensajes del usuario', fields: [{ key: 'userBubbleBg', label: 'Fondo' }, { key: 'userBubbleText', label: 'Texto', on: 'userBubbleBg' }] },
  { title: 'Mensajes del asistente', fields: [{ key: 'botBubbleBg', label: 'Fondo' }, { key: 'botBubbleText', label: 'Texto', on: 'botBubbleBg' }] },
  { title: 'Botón flotante', fields: [{ key: 'fabBg', label: 'Fondo' }] },
];

const FONT_LABELS: Record<string, string> = { inherit: 'La de mi web', system: 'Del sistema' };

function ContrastBadge({ text, bg }: { text?: string; bg?: string }) {
  if (!text || !bg) return null;
  const r = contrastRatio(text, bg);
  const ok = r >= 4.5;
  return (
    <span className={`sk-badge ${ok ? 'is-ok' : 'is-warn'}`} title={`Contraste ${r}:1 (mínimo recomendado 4,5:1)`}>
      {ok ? '✓ Legible' : `⚠ ${r}:1`}
    </span>
  );
}

function ColorControl({
  label,
  value,
  palette,
  onChange,
  badge,
}: {
  label: string;
  value?: string;
  palette: { brand: string[]; neutral: string[] };
  onChange: (v: string | undefined) => void;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(value ?? ''), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="sk-color" ref={box}>
      <button type="button" className={`sk-color__btn${value ? '' : ' is-default'}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="sk-color__swatch" style={value ? { background: value } : undefined} />
        <span className="sk-color__text">
          <span className="sk-color__label">{label}</span>
          <span className="sk-color__value">{value ?? 'Por defecto'}</span>
        </span>
        {badge}
      </button>
      {open ? (
        <div className="sk-pop" role="dialog" aria-label={`Color: ${label}`}>
          <p className="sk-pop__title">Tu marca</p>
          <div className="sk-pop__row">
            {palette.brand.map((c) => (
              <button key={c} type="button" className={`sk-pop__chip${c === value ? ' is-on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />
            ))}
          </div>
          <p className="sk-pop__title">Neutros</p>
          <div className="sk-pop__row">
            {palette.neutral.map((c) => (
              <button key={c} type="button" className={`sk-pop__chip${c === value ? ' is-on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />
            ))}
          </div>
          <div className="sk-pop__custom">
            <input type="color" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label="Color personalizado" />
            <input
              value={draft}
              placeholder="#000000"
              maxLength={7}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onChange(/^#[0-9a-f]{6}$/i.test(draft) ? draft.toLowerCase() : value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(draft)) onChange(draft.toLowerCase());
              }}
              aria-label="Código hex"
            />
            <button type="button" className="sk-pop__reset" onClick={() => { onChange(undefined); setOpen(false); }}>
              Por defecto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Miniatura de una plantilla con sus propios colores. */
function TemplateThumb({ skin }: { skin: WidgetSkin }) {
  return (
    <span className="sk-thumb" style={{ background: skin.chatBg ?? '#fff' }}>
      <span className="sk-thumb__head" style={{ background: skin.headerBg, color: skin.headerText }}>
        <i style={{ background: skin.headerText }} />
      </span>
      <span className="sk-thumb__bot" style={{ background: skin.botBubbleBg }} />
      <span className="sk-thumb__user" style={{ background: skin.userBubbleBg }} />
      <span className="sk-thumb__foot" style={{ background: skin.footerBg }}>
        <i style={{ background: skin.inputBg ?? '#fff' }} />
        <b style={{ background: skin.sendBg }} />
      </span>
    </span>
  );
}

export function WidgetBuilderSkinSection({
  skin,
  brand,
  onChange,
}: {
  skin: WidgetSkin;
  brand: string;
  onChange: (skin: WidgetSkin) => void;
}) {
  const palette = brandPalette(brand);
  const templates = skinTemplates(brand);
  const set = (key: keyof WidgetSkin, value: string | number | boolean | undefined) => {
    const next = { ...skin } as Record<string, unknown>;
    if (value === undefined || value === '' || value === false) delete next[key];
    else next[key] = value;
    onChange(next as WidgetSkin);
  };
  /** Aplicar plantilla: reemplaza colores y fuente; conserva tamaños, visibilidad y texto del pie. */
  const applyTemplate = (t: WidgetSkin) => {
    const next = { ...skin } as Record<string, unknown>;
    for (const k of WIDGET_SKIN_COLOR_KEYS) delete next[k];
    delete next.fontFamily;
    onChange({ ...(next as WidgetSkin), ...t });
  };
  const activeTemplate = templates.find((t) => WIDGET_SKIN_COLOR_KEYS.every((k) => (t.skin[k] ?? null) === (skin[k] ?? null)));
  const hasAny = Object.keys(skin).length > 0;

  return (
    <WidgetBuilderSection
      tourId="widget-builder-skin"
      title="Colores, tipografía y diseño"
      description="Empieza con una plantilla y ajusta lo que quieras. Lo que no toques queda como siempre."
    >
      <div className="sk">
        <div className="sk-templates" role="group" aria-label="Plantillas">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sk-template${activeTemplate?.id === t.id ? ' is-on' : ''}`}
              onClick={() => applyTemplate(t.skin)}
              title={t.description}
            >
              <TemplateThumb skin={t.skin} />
              <span className="sk-template__name">{t.name}</span>
            </button>
          ))}
        </div>

        {GROUPS.map((g) => (
          <div key={g.title} className="sk-group">
            <p className="sk-group__title">{g.title}</p>
            <div className="sk-grid">
              {g.fields.map((f) => (
                <ColorControl
                  key={f.key}
                  label={f.label}
                  value={skin[f.key]}
                  palette={palette}
                  onChange={(v) => set(f.key, v)}
                  badge={f.on ? <ContrastBadge text={skin[f.key]} bg={skin[f.on]} /> : null}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="sk-group">
          <p className="sk-group__title">Tipografía</p>
          <div className="sk-fonts" role="group" aria-label="Fuente">
            {[undefined, ...WIDGET_SKIN_FONTS].map((f) => (
              <button
                key={f ?? 'default'}
                type="button"
                className={`sk-font${(skin.fontFamily ?? undefined) === f ? ' is-on' : ''}`}
                style={f && f !== 'inherit' && f !== 'system' ? { fontFamily: `"${f}", system-ui` } : undefined}
                onClick={() => set('fontFamily', f)}
              >
                {f ? FONT_LABELS[f] ?? f : 'Por defecto'}
              </button>
            ))}
          </div>
          <div className="sk-seg" role="group" aria-label="Tamaño del texto">
            {([[undefined, 'Normal'], ['sm', 'Pequeño'], ['lg', 'Grande']] as const).map(([v, l]) => (
              <button key={l} type="button" className={skin.fontScale === v ? 'is-on' : ''} onClick={() => set('fontScale', v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="sk-group">
          <p className="sk-group__title">Tamaño y posición</p>
          <div className="sk-ranges">
            {(
              [
                ['chatWidth', 'Ancho del chat', 392],
                ['chatHeight', 'Alto del chat', 540],
                ['fabSize', 'Botón flotante', 60],
                ['edgeOffset', 'Distancia al borde', 20],
              ] as const
            ).map(([key, label, def]) => {
              const [min, max] = WIDGET_SKIN_RANGES[key];
              const v = skin[key] ?? def;
              return (
                <label key={key} className="sk-range">
                  <span>
                    {label}
                    <strong>{v}px</strong>
                  </span>
                  <input type="range" min={min} max={max} step={key === 'edgeOffset' ? 2 : 4} value={v} onChange={(e) => set(key, Number(e.target.value))} />
                </label>
              );
            })}
          </div>
        </div>

        <div className="sk-group">
          <p className="sk-group__title">Elementos visibles</p>
          <div className="sk-switches">
            {(
              [
                ['hideAvatar', 'Avatar en la cabecera'],
                ['hideOnlineDot', 'Punto «en línea»'],
                ['hideTimestamps', 'Hora de los mensajes'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="sk-switch">
                <input type="checkbox" checked={!skin[key]} onChange={(e) => set(key, !e.target.checked)} />
                <span className="sk-switch__track" aria-hidden />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="sk-group">
          <p className="sk-group__title">Texto propio en el pie</p>
          <input
            className="sk-input"
            value={skin.footerNote ?? ''}
            maxLength={120}
            placeholder="Ej.: Atención L-V de 8 a 6 · Emergencias 321 359 8997"
            onChange={(e) => set('footerNote', e.target.value)}
            aria-label="Texto propio en el pie"
          />
          <input
            className="sk-input"
            value={skin.footerNoteUrl ?? ''}
            placeholder="Enlace opcional (https://…)"
            onChange={(e) => set('footerNoteUrl', e.target.value)}
            aria-label="Enlace del texto del pie"
          />
        </div>

        {hasAny ? (
          <button type="button" className="sk-reset" onClick={() => onChange({})}>
            Restablecer todo el diseño
          </button>
        ) : null}
      </div>
    </WidgetBuilderSection>
  );
}
