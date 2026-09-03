'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RefreshCw, Webhook } from '@/components/ui/icons';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { BackgroundRefreshIndicator } from '@/components/dashboard/background-refresh-indicator';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';
import { dashboardKeys } from '@/lib/dashboard-query-keys';
import { fetchWebhookDeliveries, type WebhookDeliveryItem } from '@/lib/dashboard-fetch';

/**
 * Entregas de webhook — responde "¿están llegando mis leads?".
 *
 * Existe por un incidente real: durante meses los leads de un agente llegaban a
 * HubSpot pero no al webhook (el destino devolvía 429 con la cuota agotada), y
 * no había forma de verlo. Cada fila es un INTENTO; el servidor hace hasta 3
 * seguidos y, si se agotan, encola para reintentar hasta 24 h.
 */

function tiempoRelativo(iso: string | null): string {
  if (!iso) return '';
  const seg = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'hace instantes';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}

function FilaEntrega({ e }: { e: WebhookDeliveryItem }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
        <span className={`dashboard-badge ${e.ok ? 'dashboard-badge--success' : 'dashboard-badge--danger'}`}>
          {e.ok ? 'Entregado' : 'Falló'}
        </span>
      </td>
      <td style={{ padding: '0.55rem 0.75rem' }}>
        <div style={{ fontWeight: 600 }}>{e.detalle}</div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
          {e.agentId || '—'}
          {e.webhookName ? ` · ${e.webhookName}` : ''}
          {e.host ? ` · ${e.host}` : ''}
          {e.attempt > 1 ? ` · intento ${e.attempt}` : ''}
        </div>
      </td>
      <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap', fontSize: '0.6875rem' }}>
        {e.leadFields.length > 0 ? e.leadFields.join(', ') : '—'}
      </td>
      <td
        style={{
          padding: '0.55rem 0.75rem',
          whiteSpace: 'nowrap',
          fontSize: '0.6875rem',
          color: 'var(--muted-foreground)',
        }}
      >
        {tiempoRelativo(e.createdAt)} · {e.durationMs} ms
      </td>
    </tr>
  );
}

export default function WebhooksPage() {
  const [filtro, setFiltro] = useState<'todas' | 'fallidas'>('todas');

  const query = useQuery({
    queryKey: dashboardKeys.webhookDeliveries(filtro),
    queryFn: () => fetchWebhookDeliveries(filtro),
    refetchInterval: 30_000,
  });

  const { resumen, cola, entregas } = query.data ?? {
    resumen: { total: 0, ok: 0, fallidas: 0, tasaExito: null, principalMotivoFallo: null },
    cola: { pendientes: 0, agotadas: 0 },
    entregas: [],
  };
  const cargando = query.isLoading && entregas.length === 0;
  const haySenalMala = resumen.fallidas > 0 || cola.agotadas > 0;

  return (
    <DashboardShell width="wide">
      <DashboardPageHeader
        badge="Integraciones"
        badgeIcon={Webhook}
        title="Entregas de"
        titleAccent="webhook"
        description="Cada envío de lead a tus webhooks, con el motivo exacto cuando falla."
        compact
        hideIcon
        actions={(
          <>
            <BackgroundRefreshIndicator active={query.isFetching && !cargando} />
            <button type="button" className="dashboard-meta-chip" onClick={() => void query.refetch()}>
              <RefreshCw size={10} />
              Actualizar
            </button>
          </>
        )}
      />

      <div className="dashboard-page-stack">
        {/* Lo primero que se ve: ¿está sano o no? */}
        <div className="dashboard-metrics-grid">
          <div className="dashboard-metric-tile">
            <div className="dashboard-metric-tile__label">Tasa de entrega</div>
            <div className="dashboard-metric-tile__value">
              {resumen.tasaExito === null ? '—' : `${resumen.tasaExito}%`}
            </div>
            <div className="dashboard-metric-tile__sub">
              {resumen.total > 0 ? `${resumen.ok} de ${resumen.total} intentos` : 'sin envíos aún'}
            </div>
          </div>

          <div className="dashboard-metric-tile">
            <div className="dashboard-metric-tile__label">Fallidas</div>
            <div
              className="dashboard-metric-tile__value"
              style={resumen.fallidas > 0 ? { color: 'var(--destructive, #dc2626)' } : undefined}
            >
              {resumen.fallidas}
            </div>
            <div className="dashboard-metric-tile__sub">
              {resumen.principalMotivoFallo ?? 'ninguna'}
            </div>
          </div>

          <div className="dashboard-metric-tile">
            <div className="dashboard-metric-tile__label">En cola de reintento</div>
            <div className="dashboard-metric-tile__value">{cola.pendientes}</div>
            <div className="dashboard-metric-tile__sub">
              {cola.agotadas > 0
                ? `⚠️ ${cola.agotadas} agotaron los reintentos`
                : 'se reintenta hasta 24 h'}
            </div>
          </div>
        </div>

        {haySenalMala ? (
          <div className="dashboard-callout dashboard-callout--warm">
            <AlertCircle size={14} />
            <div>
              <strong>Hay entregas que no están llegando.</strong>{' '}
              {resumen.principalMotivoFallo ? `Motivo más frecuente: ${resumen.principalMotivoFallo}.` : ''}{' '}
              Revisá que la URL del webhook sea la correcta y que el destino acepte peticiones.
              {cola.agotadas > 0
                ? ` ${cola.agotadas} entrega(s) agotaron todos los reintentos: esos leads se perdieron.`
                : ''}
            </div>
          </div>
        ) : null}

        <section className="dashboard-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="dashboard-surface__title m-0">Historial de envíos</h2>
              <p className="dashboard-surface__desc">
                Una fila por intento. Se conservan 90 días.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {([
                { k: 'todas' as const, l: 'Todas' },
                { k: 'fallidas' as const, l: 'Solo fallidas' },
              ]).map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  className={`dashboard-meta-chip${filtro === k ? '' : ' dashboard-meta-chip--muted'}`}
                  onClick={() => setFiltro(k)}
                  aria-pressed={filtro === k}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {cargando ? (
            <AiLoadingInline label="Cargando entregas…" style={{ padding: '2rem 0' }} />
          ) : entregas.length === 0 ? (
            <div
              style={{
                padding: '2rem 1rem',
                textAlign: 'center',
                color: 'var(--muted-foreground)',
                fontSize: '0.8125rem',
              }}
            >
              <CheckCircle2 size={28} style={{ opacity: 0.5 }} />
              <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>
                {filtro === 'fallidas' ? 'Ninguna entrega falló' : 'Todavía no hay envíos'}
              </p>
              <p style={{ margin: '0.25rem 0 0', maxWidth: '26rem', marginInline: 'auto' }}>
                {filtro === 'fallidas'
                  ? 'Todos tus leads están llegando a destino.'
                  : 'Cuando un agente capture un lead y lo envíe a un webhook, vas a verlo acá.'}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted-foreground)' }}>
                    {['Estado', 'Qué pasó', 'Datos del lead', 'Cuándo'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '0.4rem 0.75rem',
                          fontWeight: 600,
                          fontSize: '0.6875rem',
                          borderBottom: '1px solid var(--border-subtle)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entregas.map((e) => (
                    <FilaEntrega key={e.id} e={e} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
