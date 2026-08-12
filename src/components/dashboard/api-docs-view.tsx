'use client';

import { Braces, Code2, Download, KeyRound, Loader2, RefreshCw, ShieldCheck } from '@/components/ui/icons';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { ApiExplorer } from '@/components/dashboard/api-explorer/api-explorer';
import { BRAND, STATE } from '@/lib/brand-colors';
import { AGENTFLOW_API_EMBED_PREFIX } from '@/lib/agentflow-api-url';
import {
  ApiReleaseModal,
  ApiStatusBadge,
  ApiStatusHelpModal,
  ApiVersionBadge,
  type ApiServiceStatus,
} from '@/components/dashboard/api-release-modal';

type ApiDocsViewProps = {
  apiBase: string;
  docsUrl: string;
  apiStatus: ApiServiceStatus;
  apiVersion: string | null;
  releaseOpen: boolean;
  statusHelpOpen: boolean;
  retryingStatus: boolean;
  onOpenRelease: () => void;
  onCloseRelease: () => void;
  onOpenStatusHelp: () => void;
  onCloseStatusHelp: () => void;
  onRetryHealth: () => void;
};

export function ApiDocsView({
  apiBase,
  docsUrl,
  apiStatus,
  apiVersion,
  releaseOpen,
  statusHelpOpen,
  retryingStatus,
  onOpenRelease,
  onCloseRelease,
  onOpenStatusHelp,
  onCloseStatusHelp,
  onRetryHealth,
}: ApiDocsViewProps) {
  const explorerReady = apiStatus === 'up';
  const openApiUrl = `${AGENTFLOW_API_EMBED_PREFIX}/openapi.json`;

  return (
    <div className="api-docs-page">
      <DashboardPageHeader
        badge="Desarrolladores"
        badgeIcon={Braces}
        titleIcon={Code2}
        title="API"
        titleAccent="REST"
        description="Explora endpoints, prueba peticiones y gestiona tus claves desde el explorador integrado."
        actions={
          <div className="api-docs-meta-chips">
            <ApiVersionBadge liveVersion={apiVersion} onClick={onOpenRelease} />
            <ApiStatusBadge status={apiStatus} onClick={onOpenStatusHelp} />
          </div>
        }
      />

      <ApiReleaseModal open={releaseOpen} onClose={onCloseRelease} liveVersion={apiVersion} />
      <ApiStatusHelpModal
        open={statusHelpOpen}
        onClose={onCloseStatusHelp}
        status={apiStatus}
        onRetry={onRetryHealth}
        retrying={retryingStatus}
      />

      <section className="dashboard-panel api-docs-panel">
        <div className="api-docs-panel__toolbar">
          <div className="api-docs-panel__toolbar-left">
            <span className="api-docs-panel__toolbar-icon" aria-hidden>
              <Code2 size={15} strokeWidth={2} />
            </span>
            <div>
              <p className="api-docs-panel__toolbar-title">Explorador de API</p>
              <p className="api-docs-panel__toolbar-sub">
                {explorerReady
                  ? 'Sidebar por categorías · request builder · respuesta en vivo'
                  : 'Conectando con el servicio…'}
              </p>
            </div>
          </div>
          <div className="api-docs-panel__toolbar-actions">
            {apiStatus === 'down' ? (
              <button type="button" className="api-docs-btn api-docs-btn--ghost" onClick={onRetryHealth}>
                <RefreshCw size={14} className={retryingStatus ? 'animate-spin' : undefined} />
                Reintentar
              </button>
            ) : null}
            <a href={openApiUrl} download="botiva-api.json" className="api-docs-btn api-docs-btn--primary">
              <Download size={14} />
              BotIvA API
            </a>
          </div>
        </div>

        <div className="api-docs-panel__body api-docs-panel__body--explorer">
          {explorerReady ? (
            <ApiExplorer apiBase={apiBase} />
          ) : (
            <ApiDocsPanelState status={apiStatus} docsUrl={docsUrl} apiBase={apiBase} onRetry={onRetryHealth} />
          )}
        </div>
      </section>

      <details className="api-docs-tips">
        <summary className="api-docs-tips__summary">
          <KeyRound size={15} aria-hidden />
          Primer acceso — claves API
        </summary>
        <div className="api-docs-tips__grid">
          <article className="api-docs-tip-card">
            <span className="api-docs-tip-card__step">1</span>
            <p className="api-docs-tip-card__title">Obtén tu clave</p>
            <p className="api-docs-tip-card__text">
              Pulsa <strong>Generar</strong> en Autenticación o usa <code>POST /auth/token</code>.
            </p>
          </article>
          <article className="api-docs-tip-card">
            <span className="api-docs-tip-card__step">2</span>
            <p className="api-docs-tip-card__title">Prueba un endpoint</p>
            <p className="api-docs-tip-card__text">
              Elige un endpoint en la sidebar, completa parámetros si hace falta y pulsa{' '}
              <strong>Enviar</strong>.
            </p>
          </article>
          <article className="api-docs-tip-card">
            <span className="api-docs-tip-card__step">3</span>
            <p className="api-docs-tip-card__title">Integra en tu backend</p>
            <p className="api-docs-tip-card__text">
              Usa el header <code>X-Api-Key</code> en tus servicios con base{' '}
              <code>{apiBase}/api/v1</code>.
            </p>
          </article>
        </div>
        <p className="api-docs-tips__footnote">
          <ShieldCheck size={13} aria-hidden style={{ color: BRAND.primary }} />
          Las peticiones del explorador pasan por el proxy seguro del dashboard (same-origin).
        </p>
      </details>
    </div>
  );
}

function ApiDocsPanelState({
  status,
  docsUrl,
  apiBase,
  onRetry,
}: {
  status: ApiServiceStatus;
  docsUrl: string;
  apiBase: string;
  onRetry: () => void;
}) {
  const openApiUrl = `${AGENTFLOW_API_EMBED_PREFIX}/openapi.json`;
  if (status === 'checking') {
    return (
      <div className="api-docs-state">
        <Loader2 size={28} className="animate-spin" style={{ color: BRAND.primary }} />
        <p className="api-docs-state__title">Preparando explorador</p>
        <p className="api-docs-state__text">Verificando que el servicio API REST esté disponible…</p>
      </div>
    );
  }

  return (
    <div className="api-docs-state api-docs-state--warn">
      <div className="api-docs-state__icon" style={{ background: STATE.warningBg, color: STATE.warning }}>
        !
      </div>
      <p className="api-docs-state__title">No se pudo conectar con la API</p>
      <p className="api-docs-state__text">
        El servicio en <code>{apiBase}</code> no responde. Si trabajas en local, asegúrate de que el API REST esté en marcha.
      </p>
      <div className="api-docs-panel__toolbar-actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="api-docs-btn api-docs-btn--ghost" onClick={onRetry}>
          <RefreshCw size={14} />
          Reintentar
        </button>
        <a href={openApiUrl} download="botiva-api.json" className="api-docs-btn api-docs-btn--primary">
          BotIvA API
          <Download size={14} />
        </a>
      </div>
    </div>
  );
}

export function ApiDocsPageSkeleton() {
  return (
    <div className="api-docs-page">
      <div className="dashboard-page-header">
        <div className="w-full max-w-md space-y-3">
          <div className="h-6 w-28 rounded-full api-docs-skeleton" />
          <div className="h-9 w-56 rounded-xl api-docs-skeleton" />
          <div className="h-4 w-full max-w-sm rounded-lg api-docs-skeleton" />
        </div>
      </div>
      <div className="dashboard-panel api-docs-panel">
        <div className="api-docs-panel__toolbar">
          <div className="h-10 w-48 rounded-lg api-docs-skeleton" />
          <div className="h-9 w-36 rounded-lg api-docs-skeleton" />
        </div>
        <div className="api-docs-panel__body api-docs-skeleton" style={{ minHeight: 640 }} />
      </div>
    </div>
  );
}
