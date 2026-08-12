'use client';

import type { CSSProperties } from 'react';
import { Moon, Sun } from '@/components/ui/icons';
import { WidgetBuilderField, WidgetBuilderLabel } from './field';
import { WidgetBuilderInput } from './input';

export function WidgetBuilderColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <WidgetBuilderField>
      {label ? <WidgetBuilderLabel htmlFor={`${id}-hex`}>{label}</WidgetBuilderLabel> : null}
      <div className="widget-builder-color-row">
        <input
          id={`${id}-picker`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="widget-builder-color-row__swatch"
          aria-label={label ?? 'Selector de color'}
        />
        <WidgetBuilderInput
          id={`${id}-hex`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </WidgetBuilderField>
  );
}

export function WidgetBuilderThemeToggle({
  value,
  accentColor,
  onChange,
}: {
  value: 'light' | 'dark';
  accentColor: string;
  onChange: (theme: 'light' | 'dark') => void;
}) {
  return (
    <WidgetBuilderField>
      <WidgetBuilderLabel>Tema</WidgetBuilderLabel>
      <div className="widget-builder-theme-toggle" role="group" aria-label="Tema del widget">
        {(['light', 'dark'] as const).map((t) => {
          const active = value === t;
          return (
            <button
              key={t}
              type="button"
              className={`widget-builder-theme-toggle__btn${active ? ' is-active' : ''}`}
              onClick={() => onChange(t)}
              style={active ? ({ '--wb-accent': accentColor } as CSSProperties) : undefined}
            >
              {t === 'light' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
              {t === 'light' ? 'Claro' : 'Oscuro'}
            </button>
          );
        })}
      </div>
    </WidgetBuilderField>
  );
}
