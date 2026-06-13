'use client';

import type { ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { BuilderRail } from '@/components/dashboard/builder-rail';
import { WIDGET_STEP_TIPS, WIDGET_WIZARD_STEPS } from '@/lib/widget-builder';
import type { BuilderRailItem } from '@/components/dashboard/builder-rail';

export function WidgetBuilderShell({
  wizardStep,
  accentColor,
  railItems,
  onStepSelect,
  children,
}: {
  wizardStep: number;
  accentColor: string;
  railItems: BuilderRailItem[];
  onStepSelect: (stepId: string) => void;
  children: ReactNode;
}) {
  const activeStep = WIDGET_WIZARD_STEPS[wizardStep];

  return (
    <div className="widget-builder-page dashboard-shell relative overflow-hidden min-h-full">
      <div
        className="hero-glow pointer-events-none"
        style={{ background: accentColor, top: '-200px', right: '-80px' }}
      />

      <div className="widget-builder-page__grid relative">
        <BuilderRail
          mode="steps"
          ariaLabel="Pasos del widget"
          title={activeStep.label}
          subtitle={`Paso ${wizardStep + 1} de ${WIDGET_WIZARD_STEPS.length}`}
          items={railItems}
          activeId={activeStep.id}
          onSelect={onStepSelect}
          footer={
            <div className="dashboard-builder-rail__tip">
              <p className="dashboard-builder-rail__tip-label">
                <Lightbulb size={12} className="inline mr-1" aria-hidden />
                Tip de diseño
              </p>
              <p className="dashboard-builder-rail__tip-text">{WIDGET_STEP_TIPS[activeStep.id]}</p>
            </div>
          }
        />

        <div className="widget-builder-page__main w-full min-w-0 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
