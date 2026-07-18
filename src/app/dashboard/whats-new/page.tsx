'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Wrench } from 'lucide-react';
import {
  APP_RELEASES,
  formatReleaseDate,
  LATEST_RELEASE,
  publicReleaseNotes,
} from '@/lib/app-release-notes';
import { BRAND } from '@/lib/brand-colors';

export default function WhatsNewPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 4px 48px' }}>
      <Link
        href="/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--muted-foreground)',
          textDecoration: 'none',
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={16} aria-hidden />
        Volver al panel
      </Link>

      <div
        style={{
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.95), rgba(248,250,252,0.9))',
          padding: '28px 24px',
          marginBottom: 28,
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${BRAND.primary}18`,
              color: BRAND.primary,
            }}
          >
            <Sparkles size={18} aria-hidden />
          </span>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>
              BotIvA · Novedades
            </p>
            <h1 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--foreground)' }}>
              Versión {LATEST_RELEASE.version}
            </h1>
          </div>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.55, color: 'var(--foreground)' }}>
          {LATEST_RELEASE.summary}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
          Publicado el {formatReleaseDate(LATEST_RELEASE.date)}
        </p>
      </div>

      {APP_RELEASES.map((release) => {
        const { features, fixes } = publicReleaseNotes(release);
        if (!features.length && !fixes.length) return null;

        return (
          <section key={release.version} style={{ marginBottom: 36 }}>
            <h2
              style={{
                margin: '0 0 6px',
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--foreground)',
              }}
            >
              {release.title}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted-foreground)' }}>
              v{release.version} · {formatReleaseDate(release.date)}
            </p>

            {features.length ? (
              <div style={{ display: 'grid', gap: 12, marginBottom: fixes.length ? 20 : 0 }}>
                {features.map((item) => (
                  <article
                    key={item.title}
                    style={{
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      padding: '16px 18px',
                    }}
                  >
                    <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>{item.title}</h3>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {fixes.length ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Wrench size={16} aria-hidden style={{ color: 'var(--muted-foreground)' }} />
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Mejoras y correcciones</h3>
                </div>
                <ul
                  style={{
                    margin: 0,
                    padding: '0 0 0 18px',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  {fixes.map((item) => (
                    <li key={item.title} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                      <strong style={{ color: 'var(--foreground)' }}>{item.title}.</strong>{' '}
                      {item.description}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
