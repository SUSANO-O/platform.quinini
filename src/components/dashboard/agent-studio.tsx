'use client';

/**
 * Estudio del agente: mismo lenguaje que el estudio del widget (barra, secciones numeradas, paneles;
 * reutiliza widget-studio.css), pero el centro es el editor del agente y a la derecha va la consola
 * de prueba, que se puede ocultar. Solo presentación: estado, guardado y pestañas siguen en la página.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, Loader2, MessageSquare, MoreHorizontal } from '@/components/ui/icons';
import '@/components/dashboard/widget-builder/widget-studio.css';
import './agent-studio.css';

export type AgentStudioSection = { id: string; label: string; icon: ReactNode; count?: number; hint?: string };

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Zonas del escenario que llevan a un ajuste: sección + selector del campo dentro del inspector. */
export const AGENT_ZONES: Record<string, { section: string; selector: string }> = {
  name: { section: 'general', selector: '[data-zone="name"]' },
  prompt: { section: 'general', selector: '[data-zone="prompt"]' },
  model: { section: 'general', selector: '[data-tour="agent-edit-model"]' },
  tools: { section: 'tools', selector: '' },
};

function SaveBadge({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string; icon?: ReactNode }> = {
    idle: { text: 'Sin cambios', cls: 'is-idle' },
    dirty: { text: 'Cambios sin guardar', cls: 'is-dirty', icon: <i className="as-dot" aria-hidden /> },
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

export function AgentStudio({
  name,
  model,
  accent,
  isDisabled,
  hubSynced,
  readOnly,
  deleting,
  saving,
  saveError,
  saveActions,
  onToggleStatus,
  onDelete,
  sections,
  activeId,
  onSelect,
  side,
  children,
}: {
  name: string;
  model: string;
  accent: string;
  isDisabled: boolean;
  hubSynced: boolean;
  readOnly: boolean;
  deleting: boolean;
  saving: boolean;
  /** Hubo error en el último guardado. */
  saveError?: boolean;
  /** Guardado de cada sección que lo tiene (el botón principal de la barra usa el de la activa). */
  saveActions?: Record<string, () => void>;
  onToggleStatus: () => void;
  onDelete: () => void;
  sections: AgentStudioSection[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Consola de prueba (derecha): recibe `pick(zona)` para saltar al ajuste de lo que se pulsa. */
  side?: (pick: (zone: string) => void) => ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [justSaved, setJustSaved] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Secciones con ediciones sin guardar (se detectan por input/change dentro del inspector). */
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const errorRef = useRef(saveError);
  errorRef.current = saveError;

  const wasSaving = useRef(saving);
  useEffect(() => {
    const finished = wasSaving.current && !saving;
    wasSaving.current = saving;
    // Al terminar un guardado correcto, la sección activa queda limpia y se muestra "Guardado".
    if (!finished || errorRef.current) return;
    setDirty((d) => {
      if (!d.has(activeRef.current)) return d;
      const n = new Set(d);
      n.delete(activeRef.current);
      return n;
    });
    setJustSaved(true);
    const t = window.setTimeout(() => setJustSaved(false), 2400);
    return () => window.clearTimeout(t);
  }, [saving]);

  useEffect(() => {
    if (!dirty.size) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.size]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const primary = !readOnly ? saveActions?.[active?.id ?? ''] : undefined;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;

  // ⌘S / Ctrl+S guarda la sección activa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (!primaryRef.current) return;
        e.preventDefault();
        primaryRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const markDirty = (e: { target: EventTarget }) => {
    const t = e.target as HTMLElement;
    // Buscadores y filtros no cuentan como edición.
    if (readOnly || t.closest('[data-no-dirty]') || (t as HTMLInputElement).type === 'search') return;
    if (dirty.has(activeRef.current)) return;
    setDirty((d) => new Set(d).add(activeRef.current));
  };

  /** Lleva a la sección del ajuste y resalta el campo (como hacer clic en el widget del estudio). */
  const pick = useCallback(
    (zone: string) => {
      const z = AGENT_ZONES[zone];
      if (!z) return;
      onSelect(z.section);
      let tries = 0;
      const find = () => {
        const body = bodyRef.current;
        const el = z.selector ? body?.querySelector<HTMLElement>(z.selector) : null;
        if (!z.selector) {
          body?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (!el) {
          if (tries++ < 20) requestAnimationFrame(find);
          return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('as-flash');
        void el.offsetWidth;
        el.classList.add('as-flash');
        const field = el.matches('input, textarea, select') ? el : el.querySelector<HTMLElement>('input, textarea, select');
        field?.focus({ preventScroll: true });
      };
      requestAnimationFrame(find);
    },
    [onSelect],
  );

  const state: SaveState = saving
    ? 'saving'
    : saveError
      ? 'error'
      : dirty.size
        ? 'dirty'
        : justSaved
          ? 'saved'
          : 'idle';

  return (
    <div
      className={`ws as${side && sideOpen ? ' has-side' : ''}${dirty.has(activeId) ? ' is-dirty' : ''}`}
      style={{ ['--ws-accent' as string]: accent }}
    >
      <header className="ws-top">
        <div className="ws-top__left">
          <Link href="/dashboard/agents" className="ws-iconbtn" aria-label="Volver a mis agentes">
            <ArrowLeft size={16} />
          </Link>
          <span className="ws-top__sep" aria-hidden />
          <button type="button" className={`as-avatar${isDisabled ? ' is-off' : ''}`} onClick={() => pick('name')} title="Editar nombre">
            <Bot size={16} />
          </button>
          <div className="ws-top__title">
            <span className="ws-top__eyebrow">Estudio del agente</span>
            <strong>{name || 'Agente sin nombre'}</strong>
          </div>
          <span className="as-chips">
            <span className={`as-chip ${isDisabled ? 'is-off' : 'is-on'}`}>
              <i aria-hidden />
              {isDisabled ? 'Desactivado' : 'Activo'}
            </span>
            <button type="button" className="as-chip as-chip--btn" onClick={() => pick('model')} title="Cambiar modelo">
              {model}
            </button>
            <span className={`as-chip ${hubSynced ? 'is-ok' : 'is-warn'}`} title={hubSynced ? 'Sincronizado con el hub' : 'Pendiente de sincronizar con el hub'}>
              {hubSynced ? 'Sincronizado' : 'Sin sincronizar'}
            </span>
          </span>
        </div>
        <div className="ws-top__right">
          <SaveBadge state={state} />
          {side ? (
            <button
              type="button"
              className={`as-try${sideOpen ? ' is-on' : ''}`}
              aria-pressed={sideOpen}
              onClick={() => setSideOpen((o) => !o)}
              title={sideOpen ? 'Ocultar la consola de prueba' : 'Mostrar la consola de prueba'}
            >
              <MessageSquare size={15} />
              Probar
            </button>
          ) : null}
          {primary ? (
            <button type="button" className="ws-primary" data-tour="agent-edit-save" onClick={primary} disabled={saving} title="Guardar (⌘S)">
              {saving ? <Loader2 size={14} className="ws-spin" /> : null}
              Guardar
            </button>
          ) : null}
          {!readOnly ? (
            <div className="as-menu" ref={menuRef}>
              <button type="button" className="ws-iconbtn" aria-label="Más acciones" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                <MoreHorizontal size={17} />
              </button>
              {menuOpen ? (
                <div className="as-menu__pop" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onToggleStatus(); }}>
                    {isDisabled ? 'Activar agente' : 'Desactivar agente'}
                  </button>
                  <button type="button" role="menuitem" className="is-danger" disabled={deleting} onClick={() => { setMenuOpen(false); onDelete(); }}>
                    {deleting ? 'Eliminando…' : 'Eliminar agente'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <nav className="ws-nav" aria-label="Secciones del agente">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`ws-nav__item${s.id === active?.id ? ' is-active' : ''}`}
            aria-current={s.id === active?.id ? 'step' : undefined}
            onClick={() => onSelect(s.id)}
          >
            <span className="ws-nav__icon">{s.icon}</span>
            <span className="ws-nav__text">
              <span className="ws-nav__label">
                <em>{String(i + 1).padStart(2, '0')}</em> {s.label}
              </span>
              {s.hint ? <span className="ws-nav__hint">{s.hint}</span> : null}
            </span>
            {dirty.has(s.id) ? (
              <span className="as-nav__dirty" title="Cambios sin guardar" aria-label="Cambios sin guardar" />
            ) : typeof s.count === 'number' && s.count > 0 ? (
              <span className="as-nav__count">{s.count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <main className="ws-inspector as-editor" aria-label={`Ajustes: ${active?.label ?? ''}`}>
        <div className="ws-inspector__head">
          <span className="ws-inspector__icon">{active?.icon}</span>
          <div>
            <h2>{active?.label}</h2>
            {active?.hint ? <p>{active.hint}</p> : null}
          </div>
        </div>
        <div className="as-body" ref={bodyRef} onInput={markDirty} onChange={markDirty}>
          {children}
        </div>
      </main>

      {side && sideOpen ? (
        <aside className="as-side" aria-label="Probar el agente">
          {side(pick)}
        </aside>
      ) : null}
    </div>
  );
}
