'use client';

type WizardStep = {
  id: string;
  label: string;
};

type WizardStepsProps = {
  steps: WizardStep[];
  current: number;
  onStepClick?: (index: number) => void;
};

export function WizardSteps({ steps, current, onStepClick }: WizardStepsProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onStepClick?.(i)}
                disabled={!onStepClick}
                className="flex flex-col items-center gap-1 w-full min-w-0 border-0 bg-transparent p-0"
                style={{ cursor: onStepClick ? 'pointer' : 'default' }}
              >
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                  style={{
                    background: active || done ? 'var(--primary)' : 'var(--muted)',
                    color: active || done ? '#fff' : 'var(--muted-foreground)',
                    border: active ? '2px solid rgba(228,20,20,0.35)' : '2px solid transparent',
                  }}
                >
                  {done && !active ? '✓' : i + 1}
                </span>
                <span
                  className="text-[10px] font-semibold truncate w-full text-center"
                  style={{ color: active ? 'var(--primary)' : 'var(--muted-foreground)' }}
                >
                  {step.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className="h-0.5 flex-1 mx-0.5 mb-4 rounded-full"
                  style={{ background: done ? 'var(--primary)' : 'var(--border)' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
