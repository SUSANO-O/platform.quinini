'use client';

/**
 * Estudio del widget: barra superior, secciones a la izquierda, escenario con el widget REAL en el
 * centro y el inspector de propiedades a la derecha. Solo presentación: el estado y el guardado
 * siguen en la página del editor.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ArrowLeft, Check, Loader2, Redo2, Undo2 } from '@/components/ui/icons';
import type { WidgetConfig, WidgetShortcut } from '@/lib/widget-builder';
import { WidgetLivePreview, type PreviewBackdrop, type PreviewDevice } from './live-preview';
import './widget-studio.css';

export type StudioSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type StudioSection = {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
};

function SaveBadge({ state }: { state: StudioSaveState }) {
  const map: Record<StudioSaveState, { text: string; cls: string; icon?: ReactNode }> = {
    idle: { text: 'Sin cambios', cls: 'is-idle' },
    dirty: { text: 'Cambios sin guardar', cls: 'is-dirty' },
    saving: { text: 'Guardando…', cls: 'is-saving', icon: <Loader2 size={13} className="ws-spin" /> },
    saved: { text: 'Guardado', cls: 'is-saved', icon: <Check size={13} /> },
    error: { text: 'No se pudo guardar', cls: 'is-error' },
  };
  const m = map[state];
  return (
    <span className={`ws-save ${m.cls}`} role="status" aria-live="polite">
      {m.icon}
      {m.text}
    </span>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="ws-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'is-on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function WidgetStudio({
  widgetName,
  accent,
  sections,
  activeId,
  onSelect,
  saveState,
  primaryLabel,
  onPrimary,
  primaryBusy,
  cfg,
  shortcuts,
  children,
  onPickZone,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  onPickZone?: (zone: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  widgetName: string;
  accent: string;
  sections: StudioSection[];
  activeId: string;
  onSelect: (id: string) => void;
  saveState: StudioSaveState;
  primaryLabel: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  cfg: WidgetConfig;
  shortcuts: WidgetShortcut[];
  children: ReactNode;
}) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('site');
  const [open, setOpen] = useState(true);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className="ws" data-theme="dark" style={{ ['--ws-accent' as string]: accent }}>
      <header className="ws-top">
        <div className="ws-top__left">
          <Link href="/dashboard/widgets" className="ws-iconbtn" aria-label="Volver a widgets">
            <ArrowLeft size={16} />
          </Link>
          <span className="ws-top__sep" aria-hidden />
          <button type="button" className="ws-iconbtn" onClick={onUndo} disabled={!canUndo} aria-label="Deshacer" title="Deshacer (⌘Z)">
            <Undo2 size={15} />
          </button>
          <button type="button" className="ws-iconbtn" onClick={onRedo} disabled={!canRedo} aria-label="Rehacer" title="Rehacer (⇧⌘Z)">
            <Redo2 size={15} />
          </button>
          <div className="ws-top__title">
            <span className="ws-top__eyebrow">Estudio del widget</span>
            <strong>{widgetName || 'Widget sin nombre'}</strong>
          </div>
        </div>
        <div className="ws-top__center">
          <Segmented
            label="Dispositivo"
            value={device}
            onChange={setDevice}
            options={[
              { value: 'desktop', label: 'Escritorio' },
              { value: 'mobile', label: 'Móvil' },
            ]}
          />
          <Segmented
            label="Fondo"
            value={backdrop}
            onChange={setBackdrop}
            options={[
              { value: 'site', label: 'Web' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Oscuro' },
            ]}
          />
          <Segmented
            label="Estado del chat"
            value={open ? 'open' : 'closed'}
            onChange={(v) => setOpen(v === 'open')}
            options={[
              { value: 'open', label: 'Abierto' },
              { value: 'closed', label: 'Cerrado' },
            ]}
          />
        </div>
        <div className="ws-top__right">
          <SaveBadge state={saveState} />
          <button type="button" className="ws-primary" onClick={onPrimary} disabled={primaryBusy}>
            {primaryBusy ? <Loader2 size={14} className="ws-spin" /> : null}
            {primaryLabel}
          </button>
        </div>
      </header>

      <nav className="ws-nav" aria-label="Secciones del widget">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ws-nav__item${s.id === active.id ? ' is-active' : ''}`}
            onClick={() => onSelect(s.id)}
            aria-current={s.id === active.id ? 'step' : undefined}
          >
            <span className="ws-nav__icon">{s.icon}</span>
            <span className="ws-nav__text">
              <span className="ws-nav__label">
                <em>{String(i + 1).padStart(2, '0')}</em> {s.label}
              </span>
              <span className="ws-nav__hint">{s.hint}</span>
            </span>
          </button>
        ))}
      </nav>

      <main className="ws-stage" aria-label="Vista previa">
        <div className="ws-stage__aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="ws-stage__frame">
          <WidgetLivePreview cfg={cfg} shortcuts={shortcuts} device={device} backdrop={backdrop} open={open} onPick={onPickZone} />
        </div>
        <p className="ws-stage__caption">Vista previa en vivo · haz clic en una parte del widget para editarla</p>
      </main>

      <aside className="ws-inspector" aria-label={`Ajustes: ${active.label}`}>
        <div className="ws-inspector__head">
          <span className="ws-inspector__icon">{active.icon}</span>
          <div>
            <h2>{active.label}</h2>
            <p>{active.hint}</p>
          </div>
        </div>
        <div className="ws-inspector__body">{children}</div>
      </aside>
    </div>
  );
}
