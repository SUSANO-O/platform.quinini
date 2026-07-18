import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';

export type DashboardStatItem = {
  label: string;
  value: string | number;
  /** Texto del tooltip al pasar el cursor o enfocar el icono ℹ️ */
  hint?: string;
};

export function DashboardStatStrip({
  title,
  titleHint,
  icon: Icon,
  stats,
}: {
  title: string;
  titleHint?: string;
  icon?: LucideIcon;
  stats: DashboardStatItem[];
}) {
  return (
    <section className="dashboard-stat-strip" aria-label={title}>
      <div className="dashboard-stat-strip__head">
        <h2 className="dashboard-stat-strip__title">
          {Icon ? <Icon size={16} className="dashboard-stat-strip__title-icon" aria-hidden /> : null}
          {title}
        </h2>
        {titleHint ? <p className="dashboard-stat-strip__subtitle">{titleHint}</p> : null}
      </div>
      {stats.map((s) => (
        <div key={s.label} className="dashboard-stat-cell" title={s.hint}>
          <p className="dashboard-stat-cell__value">{s.value}</p>
          <div className="dashboard-stat-cell__label-row">
            <p className="dashboard-stat-cell__label">{s.label}</p>
            {s.hint ? (
              <span
                className="dashboard-stat-cell__info"
                tabIndex={0}
                role="note"
                aria-label={s.hint}
                data-tooltip={s.hint}
              >
                <Info size={11} strokeWidth={2.25} aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
