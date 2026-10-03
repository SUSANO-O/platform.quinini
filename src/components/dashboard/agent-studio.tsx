'use client';

/**
 * Estudio del agente: misma estética que el estudio del widget (barra superior, secciones a la
 * izquierda, área de trabajo amplia). Solo presentación: estado, guardado y pestañas siguen en la
 * página. Los formularios existentes pasan a oscuro redefiniendo las variables de tema (--card,
 * --border, --foreground…) dentro del estudio, sin tocar su lógica.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Loader2, MessageSquare, MoreHorizontal } from '@/components/ui/icons';
import './agent-studio.css';

export type AgentStudioSection = { id: string; label: string; icon: ReactNode; count?: number; hint?: string };

export function AgentStudio({
  name,
  model,
  accent,
  isDisabled,
  hubSynced,
  readOnly,
  deleting,
  saving,
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
  onToggleStatus: () => void;
  onDelete: () => void;
  sections: AgentStudioSection[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Panel lateral opcional (p. ej. probar el agente). */
  side?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className={`as${side && sideOpen ? ' as--with-side' : ''}`} style={{ ['--as-accent' as string]: accent }}>
      <header className="as-top">
        <div className="as-top__left">
          <Link href="/dashboard/agents" className="as-iconbtn" aria-label="Volver a mis agentes">
            <ArrowLeft size={16} />
          </Link>
          <span className={`as-avatar${isDisabled ? ' is-off' : ''}`} aria-hidden>
            <Bot size={17} />
          </span>
          <div className="as-top__title">
            <strong>{name || 'Agente sin nombre'}</strong>
            <span className="as-chips">
              <span className={`as-chip ${isDisabled ? 'is-off' : 'is-on'}`}>
                <i aria-hidden />
                {isDisabled ? 'Desactivado' : 'Activo'}
              </span>
              <span className="as-chip">{model}</span>
              <span className={`as-chip ${hubSynced ? 'is-ok' : 'is-warn'}`} title={hubSynced ? 'Sincronizado con el hub' : 'Pendiente de sincronizar con el hub'}>
                {hubSynced ? 'Sincronizado' : 'Sin sincronizar'}
              </span>
            </span>
          </div>
        </div>
        <div className="as-top__right">
          {saving ? (
            <span className="as-save">
              <Loader2 size={13} className="as-spin" /> Guardando…
            </span>
          ) : null}
          {side ? (
            <button
              type="button"
              className={`as-try${sideOpen ? ' is-on' : ''}`}
              aria-pressed={sideOpen}
              onClick={() => setSideOpen((o) => !o)}
            >
              <MessageSquare size={15} />
              Probar
            </button>
          ) : null}
          {!readOnly ? (
            <div className="as-menu" ref={menuRef}>
              <button type="button" className="as-iconbtn" aria-label="Más acciones" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
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

      <nav className="as-nav" aria-label="Secciones del agente">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`as-nav__item${s.id === active?.id ? ' is-active' : ''}`}
            aria-current={s.id === active?.id ? 'page' : undefined}
            onClick={() => onSelect(s.id)}
          >
            <span className="as-nav__icon">{s.icon}</span>
            <span className="as-nav__text">
              <span className="as-nav__label">{s.label}</span>
              {s.hint ? <span className="as-nav__hint">{s.hint}</span> : null}
            </span>
            {typeof s.count === 'number' && s.count > 0 ? <span className="as-nav__count">{s.count}</span> : null}
          </button>
        ))}
      </nav>

      <main className="as-main">
        <div className="as-main__head">
          <span className="as-main__icon">{active?.icon}</span>
          <div>
            <h2>{active?.label}</h2>
            {active?.hint ? <p>{active.hint}</p> : null}
          </div>
        </div>
        <div className="as-main__body">{children}</div>
      </main>

      {side && sideOpen ? <aside className="as-side" aria-label="Probar el agente">{side}</aside> : null}
    </div>
  );
}
