import Link from 'next/link';

/** Barra de cupo minimal — alineada con pool cards del home. */
export function DashboardPlanUsageBar({
  label,
  used,
  limitLabel,
  percent,
  atLimit,
  plan,
  upgradeHref = '/dashboard/settings#settings-billing',
}: {
  label: string;
  used: number;
  limitLabel: string;
  percent: number;
  atLimit?: boolean;
  plan?: string;
  upgradeHref?: string;
}) {
  const hideBar = limitLabel === 'Ilimitados' || limitLabel === 'ilimitado';

  return (
    <div className="dashboard-plan-usage dashboard-plan-usage--compact">
      <div className="dashboard-plan-usage__row">
        <span className="dashboard-plan-usage__label">{label}</span>
        <span className={`dashboard-plan-usage__value${atLimit ? ' dashboard-plan-usage__value--warn' : ''}`}>
          {used.toLocaleString('es')} / {limitLabel}
        </span>
        {plan ? (
          <span className="dashboard-plan-usage__plan">
            Plan <strong>{plan}</strong>
          </span>
        ) : null}
        {atLimit ? (
          <Link href={upgradeHref} className="dashboard-meta-chip dashboard-meta-chip--accent dashboard-meta-chip--link">
            Actualizar plan →
          </Link>
        ) : null}
      </div>
      {!hideBar ? (
        <div className="dashboard-plan-usage__bar">
          <div
            className={`dashboard-plan-usage__fill${atLimit ? ' dashboard-plan-usage__fill--limit' : ''}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
