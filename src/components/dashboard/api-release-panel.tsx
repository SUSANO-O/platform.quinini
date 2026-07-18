'use client';

import Link from 'next/link';
import { Sparkles, Wrench, ExternalLink } from 'lucide-react';
import {
  API_RELEASES,
  API_VERSION,
  formatApiReleaseDate,
  LATEST_API_RELEASE,
  publicApiReleaseNotes,
} from '@/lib/api-release-notes';
import { BRAND } from '@/lib/brand-colors';

type ApiReleasePanelProps = {
  /** Versión reportada por GET /api/v1/health (si el servicio responde). */
  liveVersion?: string | null;
};

export function ApiReleasePanel({ liveVersion }: ApiReleasePanelProps) {
  const versionLabel = liveVersion?.trim() || API_VERSION;
  const { features, fixes } = publicApiReleaseNotes(LATEST_API_RELEASE);

  return (
    <section
      className="rounded-2xl overflow-hidden mb-6"
      style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
    >
      <div
        className="px-4 py-4 md:px-5 md:py-5"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${BRAND.primary}18`,
                color: BRAND.primary,
              }}
            >
              <Sparkles size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold m-0 mb-1" style={{ color: 'var(--muted-foreground)' }}>
                API REST BotIvA
              </p>
              <h2 className="text-lg font-bold m-0 leading-tight">Versión {versionLabel}</h2>
              <p className="text-sm m-0 mt-2 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                {LATEST_API_RELEASE.summary}
              </p>
              <p className="text-xs m-0 mt-2" style={{ color: 'var(--muted-foreground)' }}>
                Release {LATEST_API_RELEASE.version} · {formatApiReleaseDate(LATEST_API_RELEASE.date)}
                {liveVersion && liveVersion !== API_VERSION ? (
                  <span> · servicio en vivo: v{liveVersion}</span>
                ) : null}
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold shrink-0"
            style={{
              background: `${BRAND.primary}14`,
              color: BRAND.primary,
              border: `1px solid ${BRAND.primary}33`,
            }}
          >
            v{versionLabel}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 md:px-5 md:py-5 space-y-5">
        <div>
          <h3 className="text-sm font-bold m-0 mb-3">Novedades para todos los usuarios API</h3>
          <div className="grid gap-2.5">
            {features.map((item) => (
              <article
                key={item.title}
                className="rounded-xl px-3.5 py-3"
                style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
              >
                <p className="text-sm font-semibold m-0 mb-1">{item.title}</p>
                <p className="text-xs m-0 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        {fixes.length ? (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Wrench size={14} aria-hidden style={{ color: 'var(--muted-foreground)' }} />
              <h3 className="text-sm font-bold m-0">Mejoras y correcciones</h3>
            </div>
            <ul className="m-0 pl-4 space-y-2">
              {fixes.map((item) => (
                <li key={item.title} className="text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  <strong style={{ color: 'var(--foreground)' }}>{item.title}.</strong> {item.description}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {API_RELEASES.length > 1 ? (
          <details className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <summary className="cursor-pointer font-semibold" style={{ color: 'var(--foreground)' }}>
              Versiones anteriores
            </summary>
            <ul className="mt-2 pl-4 space-y-1">
              {API_RELEASES.slice(1).map((release) => (
                <li key={release.version}>
                  v{release.version} · {formatApiReleaseDate(release.date)} — {release.title}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <p className="text-xs m-0 pt-1" style={{ color: 'var(--muted-foreground)' }}>
          También puedes ver novedades generales del panel en{' '}
          <Link href="/dashboard/whats-new" className="font-semibold inline-flex items-center gap-1" style={{ color: BRAND.primary }}>
            Novedades BotIvA
            <ExternalLink size={12} aria-hidden />
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
