import type { ReactNode } from 'react';

export function DashboardEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="dashboard-empty">
      <div className="dashboard-empty__icon" aria-hidden>
        {icon}
      </div>
      <h2 className="font-bold text-base mb-1 m-0">{title}</h2>
      <p className="text-sm mb-6 m-0 max-w-sm mx-auto text-[var(--muted-foreground)]">{description}</p>
      {action}
    </section>
  );
}
