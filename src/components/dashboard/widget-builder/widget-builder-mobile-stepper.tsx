'use client';

import { WIDGET_WIZARD_STEPS } from '@/lib/widget-builder';

export function WidgetBuilderMobileStepper({ wizardStep }: { wizardStep: number }) {
  if (wizardStep === WIDGET_WIZARD_STEPS.length - 1) return null;

  return (
    <div className="widget-builder-stepper md:hidden" aria-hidden>
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
