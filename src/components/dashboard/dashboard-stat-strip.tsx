import type { LucideIcon } from 'lucide-react';

export type DashboardStatItem = {
  label: string;
  value: string | number;
};

export function DashboardStatStrip({
  title,
  icon: Icon,
  stats,
}: {
  title: string;
  icon?: LucideIcon;
  stats: DashboardStatItem[];
}) {
  return (
    <section className="dashboard-stat-strip" aria-label={title}>
      <h2 className="dashboard-stat-strip__title">
        {Icon ? <Icon size={16} className="text-[var(--brand-warm)]" aria-hidden /> : null}
        {title}
      </h2>
      {stats.map((s) => (
        <div key={s.label} className="dashboard-stat-cell">
          <p className="dashboard-stat-cell__value">{s.value}</p>
          <p className="dashboard-stat-cell__label">{s.label}</p>
        </div>
      ))}
    </section>
  );
}
