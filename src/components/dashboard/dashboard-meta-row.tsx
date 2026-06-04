import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function DashboardMetaRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <p className="dashboard-meta-row">
      <Icon size={14} className="dashboard-meta-row__icon" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
