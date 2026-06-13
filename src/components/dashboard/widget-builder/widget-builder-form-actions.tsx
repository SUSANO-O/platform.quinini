'use client';

export function WidgetBuilderFormActions({
  showBack,
  soloPrimary,
  onBack,
  onNext,
  nextLabel = 'Siguiente',
}: {
  showBack: boolean;
  soloPrimary?: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className={`widget-builder-form-actions${soloPrimary ? ' widget-builder-form-actions--solo' : ''}`}>
      {showBack ? (
        <button type="button" onClick={onBack} className="widget-builder-btn-secondary">
          Anterior
        </button>
      ) : null}
      <button type="button" onClick={onNext} className="widget-builder-btn-primary">
        {nextLabel}
      </button>
    </div>
  );
}
