'use client';

import type { ReactNode } from 'react';

export type DashboardSectionNavItem = {
  id: string;
  label: string;
  href?: string;
};

/** Navegación por anclas — estilo meta-chip del home (minimal). */
export function DashboardSectionNav({
  items,
  ariaLabel = 'Secciones',
  trailing,
}: {
  items: DashboardSectionNavItem[];
  ariaLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <nav className="dashboard-section-nav" aria-label={ariaLabel}>
      <div className="dashboard-section-nav__chips">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href ?? `#${item.id}`}
            className="dashboard-meta-chip dashboard-meta-chip--link"
          >
            {item.label}
          </a>
        ))}
      </div>
      {trailing ? <div className="dashboard-section-nav__trailing">{trailing}</div> : null}
    </nav>
  );
}
