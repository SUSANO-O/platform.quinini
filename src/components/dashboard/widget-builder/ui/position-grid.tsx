'use client';

import type { CSSProperties } from 'react';
import { WIDGET_POSITIONS, WIDGET_POSITION_LABELS } from '@/lib/widget-builder';

export function WidgetBuilderPositionGrid({
  value,
  accentColor,
  onChange,
}: {
  value: string;
  accentColor: string;
  onChange: (position: string) => void;
}) {
  return (
    <div className="widget-builder-position-grid" role="group" aria-label="Posición del botón flotante">
      {WIDGET_POSITIONS.flat().map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            className={`widget-builder-position-grid__cell${active ? ' is-active' : ''}`}
            onClick={() => onChange(p)}
            title={WIDGET_POSITION_LABELS[p]}
            aria-label={WIDGET_POSITION_LABELS[p]}
            aria-pressed={active}
            style={active ? ({ '--wb-accent': accentColor } as CSSProperties) : undefined}
          >
            <span className="widget-builder-position-grid__dot" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export function widgetPositionLabel(position: string): string {
  return WIDGET_POSITION_LABELS[position] ?? position;
}
