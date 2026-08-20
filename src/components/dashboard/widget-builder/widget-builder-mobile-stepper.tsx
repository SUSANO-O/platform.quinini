'use client';

import { WIDGET_WIZARD_STEPS } from '@/lib/widget-builder';

/** Stepper solo para móvil. Siempre montado (todos los pasos) para no saltar el layout. */
export function WidgetBuilderMobileStepper({ wizardStep }: { wizardStep: number }) {
  return (
    <div className="widget-builder-stepper" aria-hidden>
      {WIDGET_WIZARD_STEPS.map((s, i) => (
        <span
          key={s.id}
          className={`widget-builder-stepper__dot${i === wizardStep ? ' is-active' : ''}${i < wizardStep ? ' is-done' : ''}`}
        >
          {i < wizardStep ? '✓' : i + 1}
        </span>
      ))}
    </div>
  );
}
