'use client';

import type { CSSProperties, ReactNode } from 'react';

export function WidgetBuilderSwitch({
  checked,
  accentColor,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  accentColor?: string;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="widget-builder-switch"
      onClick={() => onChange(!checked)}
      style={{ background: checked ? accentColor ?? 'var(--primary)' : undefined }}
    >
      <span className="widget-builder-switch__thumb" data-on={checked ? '1' : '0'} aria-hidden />
    </button>
  );
}

export function WidgetBuilderTogglePanel({
  active,
  accentColor,
  title,
  description,
  onToggle,
  children,
  tourId,
  badge,
  control = 'switch',
  checkboxId,
}: {
  active: boolean;
  accentColor: string;
  title: string;
  description: string;
  onToggle: (active: boolean) => void;
  children?: ReactNode;
  tourId?: string;
  badge?: string;
  control?: 'switch' | 'checkbox';
  checkboxId?: string;
}) {
  return (
    <div
      className={`widget-builder-toggle-panel${active ? ' is-active' : ''}`}
      data-tour={tourId}
      style={active ? ({ '--wb-accent': accentColor } as CSSProperties) : undefined}
    >
      <div className={`widget-builder-toggle-panel__head${active && children ? ' has-border' : ''}`}>
        {control === 'checkbox' && checkboxId ? (
          <input
            type="checkbox"
            id={checkboxId}
            checked={active}
            onChange={(e) => onToggle(e.target.checked)}
            className="widget-builder-toggle-panel__checkbox"
            style={{ accentColor }}
          />
        ) : (
          <WidgetBuilderSwitch
            checked={active}
            accentColor={accentColor}
            onChange={onToggle}
            ariaLabel={title}
          />
        )}
        <div
          className="widget-builder-toggle-panel__copy"
          onClick={() => onToggle(!active)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle(!active);
            }
          }}
          role={control === 'switch' ? undefined : 'button'}
          tabIndex={control === 'switch' ? -1 : 0}
        >
          {control === 'checkbox' && checkboxId ? (
            <div className="widget-builder-toggle-panel__title-row">
              <label htmlFor={checkboxId} className="widget-builder-toggle-panel__title">
                {title}
              </label>
              {badge ? <span className="widget-builder-plan-badge">{badge}</span> : null}
            </div>
          ) : (
            <div className="widget-builder-toggle-panel__title-row">
              <p className="widget-builder-toggle-panel__title">{title}</p>
              {badge ? <span className="widget-builder-plan-badge">{badge}</span> : null}
            </div>
          )}
          <p className="widget-builder-toggle-panel__desc">{description}</p>
        </div>
      </div>
      {active && children ? <div className="widget-builder-toggle-panel__body">{children}</div> : null}
    </div>
  );
}
