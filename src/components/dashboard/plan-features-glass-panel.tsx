'use client';

import Link from 'next/link';
import { Check, Lock } from '@/components/ui/icons';
import type { DashboardPlanFeature } from '@/lib/dashboard-plan-features';

function FeatureChip({ feature }: { feature: DashboardPlanFeature }) {
  const title = feature.enabled
    ? feature.description
    : `Requiere ${feature.unlockLabel}. ${feature.description}`;

  const inner = (
    <>
      {feature.enabled ? (
        <Check size={10} strokeWidth={3} aria-hidden />
      ) : (
        <Lock size={9} aria-hidden />
      )}
      <span>{feature.label}</span>
      {!feature.enabled && (
        <span className="plan-features-compact__unlock">{feature.unlockLabel}</span>
      )}
      {feature.enabled && feature.viaOverride && (
        <span className="plan-features-compact__admin">admin</span>
      )}
    </>
  );

  const className = `plan-features-compact__chip ${feature.enabled ? 'plan-features-compact__chip--on' : 'plan-features-compact__chip--off'}`;

  if (feature.enabled && feature.href) {
    return (
      <Link href={feature.href} className={`${className} plan-features-compact__chip--link`} title={title}>
        {inner}
      </Link>
    );
  }

  return (
    <span className={className} title={title}>
      {inner}
    </span>
  );
}

export function PlanFeaturesGlassPanel({
  planLabel,
  planPriceLabel,
  features,
  enabledCount,
  loading,
}: {
  planLabel: string;
  planPriceLabel?: string;
  features: DashboardPlanFeature[];
  enabledCount: number;
  loading?: boolean;
}) {
  const enabled = features.filter((f) => f.enabled);
  const locked = features.filter((f) => !f.enabled);

  return (
    <section className="plan-features-compact" aria-label="Capacidades del plan">
      <div className="plan-features-compact__head">
        <div className="plan-features-compact__plan-line">
          <span className="plan-features-compact__plan">{loading ? '…' : planLabel}</span>
          {planPriceLabel && !loading && (
            <span className="plan-features-compact__price">{planPriceLabel}</span>
          )}
          {!loading && (
            <span className="plan-features-compact__count">
              {enabledCount}/{features.length} activas
            </span>
          )}
        </div>
        <Link href="/dashboard/settings" className="plan-features-compact__link">
          Planes →
        </Link>
      </div>

      {loading ? (
        <div className="plan-features-compact__skeleton metric-skeleton" />
      ) : (
        <>
          {enabled.length > 0 && (
            <div className="plan-features-compact__row">
              {enabled.map((f) => (
                <FeatureChip key={f.key} feature={f} />
              ))}
            </div>
          )}
          {locked.length > 0 && (
            <div className="plan-features-compact__row plan-features-compact__row--locked">
              {locked.map((f) => (
                <FeatureChip key={f.key} feature={f} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
