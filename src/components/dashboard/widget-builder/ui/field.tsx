'use client';

import type { ReactNode } from 'react';

export function WidgetBuilderField({
  children,
  className = '',
  htmlFor,
}: {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={`widget-builder-field${className ? ` ${className}` : ''}`} data-field-for={htmlFor}>
      {children}
    </div>
  );
}

export function WidgetBuilderLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="widget-builder-label" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function WidgetBuilderHint({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: 'default' | 'error';
}) {
  return (
    <p className={`widget-builder-hint${variant === 'error' ? ' widget-builder-hint--error' : ''}`}>
      {children}
    </p>
  );
}
