import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function DashboardCallout({
  children,
  icon: Icon,
  variant = 'default',
}: {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: 'default' | 'warm';
}) {
  return (
    <aside className={`dashboard-callout${variant === 'warm' ? ' dashboard-callout--warm' : ''}`}>
      {Icon ? <Icon size={16} className="shrink-0 text-[var(--primary)]" aria-hidden /> : null}
      <p className="dashboard-callout__text">{children}</p>
    </aside>
  );
}
