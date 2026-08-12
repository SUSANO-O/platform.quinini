'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Wrench } from '@/components/ui/icons';
import {
  APP_RELEASES,
  formatReleaseDate,
  LATEST_RELEASE,
  publicReleaseNotes,
} from '@/lib/app-release-notes';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';

export default function WhatsNewPage() {
  return (
    <DashboardShell width="narrow">
      <Link
        href="/dashboard"
        className="dashboard-meta-chip dashboard-meta-chip--muted dashboard-meta-chip--link mb-3 w-fit"
      >
        <ArrowLeft size={10} />
        Volver al panel
      </Link>

      <DashboardPageHeader
        badge="BotIvA"
        badgeIcon={Sparkles}
        title="Novedades"
        titleAccent={`v${LATEST_RELEASE.version}`}
        description={LATEST_RELEASE.summary}
        compact
        hideIcon
      />

      <div className="dashboard-page-stack">
        {APP_RELEASES.map((release) => {
          const { features, fixes } = publicReleaseNotes(release);
          if (!features.length && !fixes.length) return null;

          return (
            <article key={release.version} className="dashboard-surface">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h2 className="dashboard-surface__title m-0">{release.title}</h2>
                <span className="dashboard-meta-chip dashboard-meta-chip--muted">
                  v{release.version} · {formatReleaseDate(release.date)}
                </span>
              </div>
              <p className="dashboard-surface__desc">{release.summary}</p>

              {features.length > 0 && (
                <div className="mb-3">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide m-0 mb-2 text-[var(--muted-foreground)]">
                    <Sparkles size={11} className="inline mr-1" style={{ verticalAlign: -1 }} />
                    Nuevo
                  </p>
                  <ul className="m-0 pl-4 text-sm space-y-2">
                    {features.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span className="text-[var(--muted-foreground)]"> — {item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {fixes.length > 0 && (
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wide m-0 mb-2 text-[var(--muted-foreground)]">
                    <Wrench size={11} className="inline mr-1" style={{ verticalAlign: -1 }} />
                    Mejoras
                  </p>
                  <ul className="m-0 pl-4 text-sm space-y-2">
                    {fixes.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <span className="text-[var(--muted-foreground)]"> — {item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
