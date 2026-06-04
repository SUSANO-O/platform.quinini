import type { ReactNode } from 'react';

export function DashboardGridToolbar({
  title,
  count,
  countLabel,
  description,
  filter,
}: {
  title: string;
  count: number;
  countLabel?: string;
  description?: string;
  filter: ReactNode;
}) {
  const suffix = countLabel ?? (count === 1 ? 'elemento' : 'elementos');

  return (
    <div className="dashboard-grid-toolbar">
      <div className="dashboard-grid-toolbar__title-wrap">
        <h2 className="dashboard-grid-toolbar__title">{title}</h2>
        <p className="dashboard-grid-toolbar__count">
          {count} {suffix}
        </p>
        {description ? (
          <p className="dashboard-grid-toolbar__description">{description}</p>
        ) : null}
      </div>
      <div className="dashboard-grid-toolbar__actions">{filter}</div>
    </div>
  );
}
