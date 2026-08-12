'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Sparkles, Wrench, ExternalLink, X, RefreshCw, Activity } from '@/components/ui/icons';
import {
  API_RELEASES,
  API_VERSION,
  formatApiReleaseDate,
  LATEST_API_RELEASE,
  publicApiReleaseNotes,
} from '@/lib/api-release-notes';
import { BRAND } from '@/lib/brand-colors';

export type ApiServiceStatus = 'checking' | 'up' | 'down';

const STATUS_META: Record<
  ApiServiceStatus,
  { label: string; color: string; title: string; body: string; hint?: string }
> = {
  checking: {
    label: 'Comprobando',
    color: '#94a3b8',
    title: 'Verificando el servicio',
    body: 'Estamos comprobando que la API REST responda correctamente. Esto suele tardar unos segundos.',
    hint: 'Si acabas de arrancar el entorno local, espera a que el contenedor esté listo.',
  },
  up: {
    label: 'Operativo',
    color: '#22c55e',
    title: 'API REST operativa',
    body: 'El servicio responde con normalidad. Puedes usar la documentación embebida y tus claves afapi_ sin problemas.',
    hint: 'Si una petición falla, revisa tu clave API o los límites de tu plan.',
  },
  down: {
    label: 'Interrupción',
    color: '#f59e0b',
    title: 'Estamos trabajando en ello',
    body: 'La API REST no responde en este momento. Puede deberse a mantenimiento, un despliegue en curso o un incidente puntual.',
    hint: 'Nuestro equipo ya monitoriza la plataforma. Vuelve a intentarlo en unos minutos o consulta el estado general.',
  },
};

type ApiReleaseModalProps = {
  open: boolean;
  onClose: () => void;
  liveVersion?: string | null;
};

function ApiModalShell({
  open,
  onClose,
  titleId,
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  accentColor = BRAND.primary,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  icon: ReactNode;
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  accentColor?: string;
}) {
  if (!open) return null;

  return (
    <div className="api-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="api-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="api-modal__header" style={{ '--modal-accent': accentColor } as CSSProperties}>
          <div className="api-modal__header-main">
            <span className="api-modal__icon">{icon}</span>
            <div className="min-w-0">
              <p className="api-modal__eyebrow">{eyebrow}</p>
              <h2 id={titleId} className="api-modal__title">
                {title}
              </h2>
              {subtitle ? <div className="api-modal__subtitle">{subtitle}</div> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="api-modal__close" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="api-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function ApiVersionBadge({
  liveVersion,
  onClick,
}: {
  liveVersion?: string | null;
  onClick: () => void;
}) {
  const versionLabel = liveVersion?.trim() || API_VERSION;

  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver novedades de la API"
      className="api-docs-chip api-docs-chip--brand"
    >
      <Sparkles size={12} aria-hidden />
      v{versionLabel}
    </button>
  );
}

export function ApiStatusBadge({
  status,
  onClick,
}: {
  status: ApiServiceStatus;
  onClick: () => void;
}) {
  const meta = STATUS_META[status];
  const tone =
    status === 'up' ? 'success' : status === 'down' ? 'warning' : 'muted';

  return (
    <button
      type="button"
      onClick={onClick}
      title="Estado del servicio API"
      className={`api-docs-chip api-docs-chip--${tone}`}
      style={
        tone === 'muted'
          ? undefined
          : ({
              '--chip-color': meta.color,
            } as CSSProperties)
      }
    >
      <span
        className={`api-docs-chip__dot${status === 'checking' ? ' api-docs-chip__dot--pulse' : ''}`}
        style={{ background: meta.color, boxShadow: status === 'up' ? `0 0 8px ${meta.color}` : undefined }}
        aria-hidden
      />
      {meta.label}
    </button>
  );
}

type ApiStatusHelpModalProps = {
  open: boolean;
  onClose: () => void;
  status: ApiServiceStatus;
  onRetry?: () => void;
  retrying?: boolean;
};

export function ApiStatusHelpModal({
  open,
  onClose,
  status,
  onRetry,
  retrying,
}: ApiStatusHelpModalProps) {
  const meta = STATUS_META[status];

  return (
    <ApiModalShell
      open={open}
      onClose={onClose}
      titleId="api-status-title"
      accentColor={meta.color}
      eyebrow="Estado del servicio"
      title={meta.title}
      icon={<Activity size={18} aria-hidden />}
    >
      <p className="text-sm m-0 leading-relaxed">{meta.body}</p>
      {meta.hint ? (
        <p className="text-xs m-0 leading-relaxed mt-3" style={{ color: 'var(--muted-foreground)' }}>
          {meta.hint}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-4">
        {status === 'down' && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="api-docs-btn api-docs-btn--ghost"
          >
            <RefreshCw size={14} className={retrying ? 'animate-spin' : undefined} />
            Reintentar comprobación
          </button>
        ) : null}
        <Link
          href="/status"
          target="_blank"
          rel="noopener noreferrer"
          className="api-docs-btn api-docs-btn--primary"
        >
          Estado de la plataforma
          <ExternalLink size={14} />
        </Link>
      </div>
    </ApiModalShell>
  );
}

export function ApiReleaseModal({ open, onClose, liveVersion }: ApiReleaseModalProps) {
  const versionLabel = liveVersion?.trim() || API_VERSION;
  const { features, fixes } = publicApiReleaseNotes(LATEST_API_RELEASE);

  return (
    <ApiModalShell
      open={open}
      onClose={onClose}
      titleId="api-release-title"
      eyebrow="API REST BotIvA"
      title={`Versión ${versionLabel}`}
      icon={<Sparkles size={18} aria-hidden />}
      subtitle={
        <>
          <p className="m-0 text-sm leading-relaxed">{LATEST_API_RELEASE.summary}</p>
          <p className="m-0 mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {formatApiReleaseDate(LATEST_API_RELEASE.date)}
          </p>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold m-0 mb-2.5">Novedades</h3>
          <div className="grid gap-2">
            {features.map((item) => (
              <article key={item.title} className="api-modal-feature">
                <p className="text-sm font-semibold m-0 mb-0.5">{item.title}</p>
                <p className="text-xs m-0 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        {fixes.length ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wrench size={14} aria-hidden style={{ color: 'var(--muted-foreground)' }} />
              <h3 className="text-sm font-bold m-0">Mejoras y correcciones</h3>
            </div>
            <ul className="m-0 pl-4 space-y-1.5">
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
          Novedades del panel en{' '}
          <Link
            href="/dashboard/whats-new"
            className="font-semibold inline-flex items-center gap-1"
            style={{ color: BRAND.primary }}
            onClick={onClose}
          >
            BotIvA
            <ExternalLink size={11} aria-hidden />
          </Link>
        </p>
      </div>
    </ApiModalShell>
  );
}
