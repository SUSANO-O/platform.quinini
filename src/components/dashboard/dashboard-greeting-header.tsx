'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Crown, Clock, Sparkles, Zap } from 'lucide-react';

/** Header del home — saludo + acciones (date range, plan badge). */
export function DashboardGreetingHeader({
  displayName,
  actions,
  loadingPlan,
  isPremium,
  isTrialActive,
  trialDaysRemaining,
  planLabel,
}: {
  displayName: string;
  actions?: ReactNode;
  loadingPlan?: boolean;
  isPremium?: boolean;
  isTrialActive?: boolean;
  trialDaysRemaining?: number;
  planLabel?: string;
}) {
  return (
    <header className="dashboard-page-header dashboard-page-header--compact dashboard-greeting-header">
      <div>
        <div className="badge-primary mb-2 w-fit">
          <Sparkles size={13} />
          Panel de Control
        </div>
        <h1 className="dashboard-greeting-header__title m-0">
          Hola, <span className="gradient-text">{displayName}</span> 👋
        </h1>
        <p className="dashboard-greeting-header__date m-0">
          {new Date().toLocaleDateString('es', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>
      <div className="dashboard-greeting-header__actions">
        {actions}
        {loadingPlan ? (
          <span className="dashboard-meta-chip dashboard-meta-chip--muted" aria-hidden>
            …
          </span>
        ) : isPremium ? (
          <span className="dashboard-meta-chip dashboard-meta-chip--accent">
            <Crown size={11} />
            {planLabel} — activo
          </span>
        ) : isTrialActive ? (
          <span className="dashboard-meta-chip dashboard-meta-chip--accent">
            <Clock size={11} />
            Trial — {trialDaysRemaining} días
          </span>
        ) : (
          <Link href="/dashboard/settings" className="dashboard-meta-chip dashboard-meta-chip--accent dashboard-meta-chip--link">
            <Zap size={11} />
            Actualizar plan →
          </Link>
        )}
      </div>
    </header>
  );
}
