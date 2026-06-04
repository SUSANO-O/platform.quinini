import type { ReactNode } from 'react';
import { DashboardPanel } from '@/components/dashboard/dashboard-panel';

export function DashboardResourceCard({
  inactive,
  avatar,
  status,
  title,
  subtitle,
  subtitleTitle,
  meta,
  actions,
  headerAction,
  footer,
}: {
  inactive?: boolean;
  avatar: ReactNode;
  status: ReactNode;
  title: string;
  subtitle?: string;
  subtitleTitle?: string;
  meta: ReactNode;
  actions: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DashboardPanel
      showAccent={false}
      inactive={inactive}
      interactive
      className="dashboard-resource-card h-full flex flex-col"
    >
      <div className="dashboard-panel__body dashboard-resource-card__body flex flex-col flex-1">
        <div className="dashboard-resource-card__header">
          {avatar}
          <div className="dashboard-resource-card__header-end">
            {status}
            {headerAction}
          </div>
        </div>

        <h2 className="dashboard-resource-card__title">{title}</h2>
        {subtitle ? (
          <p className="dashboard-resource-card__subtitle" title={subtitleTitle}>
            {subtitle}
          </p>
        ) : null}

        <div className="dashboard-resource-card__meta">{meta}</div>

        <div className="dashboard-resource-card__actions">{actions}</div>
      </div>

      {footer ? <div className="dashboard-resource-card__footer">{footer}</div> : null}
    </DashboardPanel>
  );
}
