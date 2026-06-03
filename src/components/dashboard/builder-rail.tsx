'use client';

import type { ReactNode } from 'react';

export type BuilderRailItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Badge numérico (modo 'tabs') — solo se muestra si > 0. */
  count?: number;
  /** Estado del paso (modo 'steps'). */
  state?: 'done' | 'active' | 'pending';
};

type BuilderRailProps = {
  items: BuilderRailItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** 'tabs' → secciones con icono + badge (agent editor). 'steps' → pasos numerados (widget builder). */
  mode?: 'tabs' | 'steps';
  title?: string;
  ariaLabel?: string;
};

const R = 'var(--primary)';

/**
 * Sub-sidebar vertical reutilizable para los builders del dashboard.
 * - En md+ se muestra como columna vertical sticky pegada al contenido.
 * - En móvil/tablet colapsa a un strip horizontal con scroll (no rompe el ancho angosto).
 */
export function BuilderRail({
  items,
  activeId,
  onSelect,
  mode = 'tabs',
  title,
  ariaLabel,
}: BuilderRailProps) {
  if (items.length <= 1) return null;

  const countBadge = (count: number, selected: boolean) => (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        minWidth: 18,
        height: 18,
        padding: '0 5px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? `${R}18` : 'var(--muted)',
        color: selected ? R : 'var(--muted-foreground)',
      }}
    >
      {count}
    </span>
  );

  const stepBullet = (index: number, item: BuilderRailItem, selected: boolean) => {
    const done = item.state === 'done';
    const filled = done || selected;
    return (
      <span
        className="flex items-center justify-center shrink-0 text-[11px] font-bold"
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: filled ? R : 'var(--muted)',
          color: filled ? '#fff' : 'var(--muted-foreground)',
          border: selected ? '2px solid rgba(var(--brand-primary-rgb),0.35)' : '2px solid transparent',
        }}
      >
        {done && !selected ? '✓' : index + 1}
      </span>
    );
  };

  return (
    <>
      {/* ── Vertical (md+) ─────────────────────────────────────────────── */}
      <nav
        className="hidden md:flex md:flex-col gap-1 md:w-52 md:shrink-0 md:sticky md:top-4 self-start"
        role="tablist"
        aria-label={ariaLabel}
      >
        {title && (
          <span
            className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {title}
          </span>
        )}
        {items.map((item, i) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              className="group flex items-center gap-2.5 w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-all"
              style={{
                fontWeight: selected ? 700 : 500,
                fontSize: 13,
                borderColor: selected ? `${R}44` : 'transparent',
                background: selected ? 'var(--background)' : 'transparent',
                color: selected ? R : 'var(--muted-foreground)',
                boxShadow: selected ? `0 1px 0 ${R}22` : 'none',
              }}
            >
              {mode === 'steps'
                ? stepBullet(i, item, selected)
                : item.icon && (
                    <span className="flex shrink-0" style={{ opacity: selected ? 1 : 0.75 }}>
                      {item.icon}
                    </span>
                  )}
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {mode === 'tabs' && typeof item.count === 'number' && item.count > 0
                ? countBadge(item.count, selected)
                : null}
            </button>
          );
        })}
      </nav>

      {/* ── Horizontal (móvil) ─────────────────────────────────────────── */}
      <div
        className="flex md:hidden gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
        style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
        role="tablist"
        aria-label={ariaLabel}
      >
        {items.map((item, i) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              className="inline-flex items-center gap-1.5 shrink-0 py-2 px-3.5 rounded-xl border cursor-pointer text-xs transition-all"
              style={{
                fontWeight: selected ? 700 : 500,
                borderColor: selected ? `${R}44` : 'var(--border)',
                background: selected ? 'var(--background)' : 'var(--card)',
                color: selected ? R : 'var(--muted-foreground)',
                boxShadow: selected ? `0 1px 0 ${R}22` : 'none',
              }}
            >
              {mode === 'steps' ? (
                <span
                  className="flex items-center justify-center shrink-0 text-[10px] font-bold"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: item.state === 'done' || selected ? R : 'var(--muted)',
                    color: item.state === 'done' || selected ? '#fff' : 'var(--muted-foreground)',
                  }}
                >
                  {item.state === 'done' && !selected ? '✓' : i + 1}
                </span>
              ) : (
                item.icon && (
                  <span className="flex" style={{ opacity: selected ? 1 : 0.75 }}>
                    {item.icon}
                  </span>
                )
              )}
              <span className="whitespace-nowrap">{item.label}</span>
              {mode === 'tabs' && typeof item.count === 'number' && item.count > 0
                ? countBadge(item.count, selected)
                : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
