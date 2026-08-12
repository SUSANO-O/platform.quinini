'use client';

import Link from 'next/link';
import type { LucideIcon } from '@/components/ui/icons';

export function WidgetBuilderFormHeader({
  wizardStep,
  totalSteps,
  editWidgetId,
  stepIcon: StepIcon,
  stepLabel,
  stepDescription,
  accentColor,
}: {
  wizardStep: number;
  totalSteps: number;
  editWidgetId: string | null;
  stepIcon?: LucideIcon;
  stepLabel?: string;
  stepDescription?: string;
  accentColor: string;
}) {
  if (wizardStep === 0) {
    return (
      <>
        <div className="badge-primary mb-3 w-fit">Widget</div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight m-0 mb-1" data-tour="widget-builder-header">
          {editWidgetId ? (
            <>
              Editar <span className="gradient-text">widget</span>
            </>
          ) : (
            <>
              Widget <span className="gradient-text">Builder</span>
            </>
          )}
        </h1>
        <p className="text-[13px] m-0 mb-6" style={{ color: 'var(--muted-foreground)' }}>
          {editWidgetId
            ? 'Cambios guardados con el mismo token de integración.'
            : 'Diseña tu chat widget paso a paso y publícalo en tu sitio.'}
        </p>
        {editWidgetId ? (
          <p className="mb-6 m-0">
            <Link href="/dashboard/widgets" className="text-xs font-semibold landing-link-accent no-underline">
              ← Volver a Mis widgets
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  if (!StepIcon || !stepLabel) return null;

  return (
    <header className="widget-builder-step-intro">
      <div className="widget-builder-step-intro__icon" style={{ background: `${accentColor}14`, color: accentColor }}>
        <StepIcon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="widget-builder-step-intro__eyebrow">
          Paso {wizardStep + 1} de {totalSteps}
        </p>
        <h1 className="widget-builder-step-intro__title">{stepLabel}</h1>
        {stepDescription ? <p className="widget-builder-step-intro__desc">{stepDescription}</p> : null}
      </div>
    </header>
  );
}
