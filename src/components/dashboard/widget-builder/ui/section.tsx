'use client';

import type { ReactNode } from 'react';

export function WidgetBuilderSections({ children }: { children: ReactNode }) {
  return <div className="widget-builder-sections">{children}</div>;
}

export function WidgetBuilderSection({
  title,
  description,
  children,
  tourId,
  bodyClassName = '',
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  tourId?: string;
  bodyClassName?: string;
}) {
  return (
    <section className="widget-builder-section" data-tour={tourId}>
      <div className="widget-builder-section__head">
        <h2 className="widget-builder-section__title">{title}</h2>
        {description ? <p className="widget-builder-section__desc">{description}</p> : null}
      </div>
      <div className={`widget-builder-section__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>
        {children}
      </div>
    </section>
  );
}
