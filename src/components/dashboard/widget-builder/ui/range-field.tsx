'use client';

import { WidgetBuilderField, WidgetBuilderHint, WidgetBuilderLabel } from './field';

export function WidgetBuilderRangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  accentColor,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accentColor: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));

  return (
    <WidgetBuilderField>
      <WidgetBuilderLabel htmlFor={id}>{label}</WidgetBuilderLabel>
      <div className="widget-builder-range-row">
        <button type="button" className="widget-builder-range-row__step" aria-label="Reducir" onClick={dec}>
          −
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value, 10) || value)))}
          className="widget-builder-range-row__slider"
          style={{ accentColor }}
        />
        <button type="button" className="widget-builder-range-row__step" aria-label="Aumentar" onClick={inc}>
          +
        </button>
      </div>
      {hint ? <WidgetBuilderHint>{hint}</WidgetBuilderHint> : null}
    </WidgetBuilderField>
  );
}
