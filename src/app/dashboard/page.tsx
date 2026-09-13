'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { QuotaTopupBanner } from '@/components/dashboard/quota-topup-banner';
import { DashboardHomeOverview, type DashboardUsageData } from '@/components/dashboard/dashboard-home-overview';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardGreetingHeader } from '@/components/dashboard/dashboard-greeting-header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BarChart2, X, Loader2 } from '@/components/ui/icons';

import { BRAND, STATE } from '@/lib/brand-colors';
import {
  formatHourLabel,
  monthOverMonth,
  outcomeBreakdown,
  monthBarHeights,
  type MetricTone,
} from '@/lib/dashboard-metrics';
import { countOwnedMainAgents } from '@/lib/agent-plans';
import { resolveRange, type DateRange } from '@/lib/date-range';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { DashboardMetricModal } from '@/components/dashboard/dashboard-metric-modal';
import { MiniBarHistogram, MetricBarRow } from '@/components/dashboard/mini-bar-histogram';

interface UsageData extends DashboardUsageData {}

interface StatusService {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
}

interface SystemStatus {
  status: 'operational' | 'degraded' | 'down';
  services: StatusService[];
}

interface WidgetInfo { _id: string; name: string; }

interface WidgetAnalytics {
  summary: {
    totalSessions: number;
    avgMessagesPerSession: number;
    escalationRate: number;
    dropOffRate: number;
    resolutionRate: number;
  };
  sentiment?: { positive: number; neutral: number; negative: number };
  peakHour: number | null;
  hourDistribution?: number[];
  byMonth: { month: string; sessions: number; conversations: number }[];
  satisfaction?: {
    avgScore: number | null;
    totalResponses: number;
    scoredResponses: number;
    distribution: Record<number, number>;
    responseRate: number;
  };
}

interface FeedbackItem {
  _id: string;
  score: number | null;
  createdAt: string;
  answers: { questionText: string; type: string; value: unknown }[];
}

// Un solo acento en todo el panel: el de marca. Antes convivía con un azul
// suelto (#2a78d6) que solo existía en estas gráficas.
const CHART_ACCENT = BRAND.primary;
const CHART_MUTED = 'var(--muted-foreground)';
const CHART_SURFACE = 'rgba(var(--brand-primary-rgb), 0.07)';

/** Cada papel de color de `dashboard-metrics` pintado una sola vez. */
const TONE_COLOR: Record<MetricTone, string> = {
  success: '#15803d',
  brand: BRAND.primary,
  warning: '#b45309',
  danger: '#b91c1c',
  neutral: 'var(--muted-foreground)',
};

const STATUS_COLOR: Record<string, string> = {
  operational: STATE.success,
  degraded: STATE.warning,
  down: STATE.error,
};

/* ── Barra esqueleto reutilizable ─────────────────────────────────────────── */
function Skel({ w, h, r = 6 }: { w: string | number; h: number; r?: number }) {
  return (
    <div
      className="metric-skeleton"
      style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }}
    />
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { isPremium, isTrialActive, trialDaysRemaining, subscription, loading } = useSubscription();

  const [dateRange, setDateRange] = useState<DateRange>(() => resolveRange('last_30d'));
  const [usage,            setUsage]            = useState<UsageData | null>(null);
  const [conversationsToday, setConversationsToday] = useState<number | null>(null);
  const [sessionsStartedToday, setSessionsStartedToday] = useState<number | null>(null);
  const [agentCount,       setAgentCount]       = useState<number | null>(null);
  const [widgetCount,      setWidgetCount]      = useState<number | null>(null);
  const [sysStatus,        setSysStatus]        = useState<SystemStatus | null>(null);
  const [loadingSysStatus, setLoadingSysStatus] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [widgets,          setWidgets]          = useState<WidgetInfo[]>([]);
  const [selectedWidget,   setSelectedWidget]   = useState<string | null>(null);
  const [widgetAnalytics,  setWidgetAnalytics]  = useState<WidgetAnalytics | null>(null);

  // `byMonth` llega del mes más nuevo al más viejo (ver la ruta de analítica);
  // tanto la gráfica como la comparación mes a mes lo necesitan al derecho.
  const mesesEnOrden = useMemo(
    () => [...(widgetAnalytics?.byMonth ?? [])].reverse(),
    [widgetAnalytics],
  );
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackList,     setFeedbackList]     = useState<FeedbackItem[]>([]);
  const [loadingFeedback,  setLoadingFeedback]  = useState(false);
  const [inboxOpenCount,   setInboxOpenCount]   = useState<number | null>(null);
  const [hourModalOpen,    setHourModalOpen]    = useState(false);
  const [sentimentModalOpen, setSentimentModalOpen] = useState(false);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);

  const coreMetricsReady =
    usage !== null && agentCount !== null && widgetCount !== null;

  useEffect(() => {
    if (user?.role === 'admin') router.replace('/admin');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/usage').then(r => r.ok ? r.json() : null).then(d => d && setUsage(d)).catch(() => {});
    fetch('/api/inbox/count').then(r => r.ok ? r.json() : null).then(d => {
      if (d && typeof d.openCount === 'number') setInboxOpenCount(d.openCount);
    }).catch(() => {});
    fetch('/api/agents').then(r => r.ok ? r.json() : null).then(d => d && setAgentCount(countOwnedMainAgents(d.agents))).catch(() => {});
    fetch('/api/widgets').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const list: WidgetInfo[] = (d.widgets || []).map((w: { _id: string; name?: string }) => ({ _id: String(w._id), name: w.name || 'Widget' }));
      setWidgetCount(list.length);
      setWidgets(list);
      if (list.length > 0) setSelectedWidget(list[0]._id);
    }).catch(() => {});
  }, [user]);

  // Re-fetch conversaciones en rango cada vez que cambia el rango.
  useEffect(() => {
    if (!user) return;
    const qs = `from=${encodeURIComponent(dateRange.from.toISOString())}&to=${encodeURIComponent(dateRange.to.toISOString())}`;
    fetch(`/api/dashboard/conversations-today?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const turns = typeof d.billableTurns === 'number' ? d.billableTurns : d.count;
        if (typeof turns === 'number') setConversationsToday(turns);
        if (typeof d.sessionsStarted === 'number') setSessionsStartedToday(d.sessionsStarted);
      })
      .catch(() => {});
  }, [user, dateRange]);

  const openFeedbackModal = async () => {
    if (!selectedWidget) return;
    setFeedbackModalOpen(true);
    setLoadingFeedback(true);
    try {
      const res = await fetch(`/api/widgets/${selectedWidget}/feedback/list`);
      const data = await res.json();
      if (res.ok) setFeedbackList(Array.isArray(data.items) ? data.items : []);
    } catch { /* */ } finally {
      setLoadingFeedback(false);
    }
  };

  /** Estado del sistema: última petición — solo tras métricas principales (conv, agentes, widgets). */
  useEffect(() => {
    if (!user || !coreMetricsReady) return;
    let cancelled = false;
    setLoadingSysStatus(true);
    fetch('/api/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setSysStatus(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSysStatus(false); });
    return () => { cancelled = true; };
  }, [user, coreMetricsReady]);

  useEffect(() => {
    if (!selectedWidget) return;
    setLoadingAnalytics(true);
    setWidgetAnalytics(null);
    const qs = `from=${encodeURIComponent(dateRange.from.toISOString())}&to=${encodeURIComponent(dateRange.to.toISOString())}`;
    fetch(`/api/analytics/widget/${selectedWidget}?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWidgetAnalytics(d))
      .catch(() => {})
      .finally(() => setLoadingAnalytics(false));
  }, [selectedWidget, dateRange]);

  const refreshStatus = async () => {
    setRefreshingStatus(true);
    try {
      const d = await fetch('/api/status').then(r => r.ok ? r.json() : null);
      if (d) setSysStatus(d);
    } finally {
      setRefreshingStatus(false);
    }
  };

  const planLabel = subscription?.plan
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : 'Free';

  return (
    <DashboardShell width="home">
        {usage && (
          <QuotaTopupBanner
            percentUsed={usage.percentUsed}
            used={usage.used}
            limit={usage.limit}
            plan={usage.plan}
            subscriptionStatus={subscription?.status}
            activePacks={usage.activePacks}
          />
        )}

        <DashboardGreetingHeader
          displayName={user?.displayName || user?.email?.split('@')[0] || 'Usuario'}
          loadingPlan={loading}
          isPremium={isPremium}
          isTrialActive={isTrialActive}
          trialDaysRemaining={trialDaysRemaining}
          planLabel={planLabel}
          actions={<DateRangePicker value={dateRange} onChange={setDateRange} />}
        />

        <DashboardHomeOverview
          usage={usage}
          agentCount={agentCount}
          widgetCount={widgetCount}
          conversationsToday={conversationsToday}
          sessionsStartedToday={sessionsStartedToday}
          dateRange={dateRange}
          inboxOpenCount={inboxOpenCount}
          sysStatus={sysStatus}
          loadingSysStatus={loadingSysStatus}
          refreshingStatus={refreshingStatus}
          onRefreshStatus={() => void refreshStatus()}
          coreMetricsReady={coreMetricsReady}
          isPremium={isPremium}
          isTrialActive={isTrialActive}
          trialDaysRemaining={trialDaysRemaining}
          subscriptionLoading={loading}
        />

        {/* ── WIDGET ANALYTICS ─────────────────────────────────────────────── */}
        {widgetCount !== null && (
          <section className="dashboard-surface mb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: CHART_SURFACE }}>
                    <BarChart2 size={14} style={{ color: CHART_MUTED }} />
                  </div>
                  <h3 className="text-[13px] font-bold m-0">Analítica de widgets</h3>
                </div>
                {widgets.length > 1 && (
                  <select
                    value={selectedWidget || ''}
                    onChange={e => { setSelectedWidget(e.target.value); }}
                    className="text-xs rounded-lg px-2.5 py-1.5"
                    style={{ border: '1px solid rgba(var(--brand-primary-rgb),0.12)', background: 'rgba(var(--brand-primary-rgb),0.03)', color: 'var(--foreground)', outline: 'none' }}
                  >
                    {widgets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                  </select>
                )}
                {widgets.length === 1 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: CHART_SURFACE, color: CHART_ACCENT }}>
                    {widgets[0].name}
                  </span>
                )}
              </div>

              {widgetCount === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm m-0" style={{ color: 'var(--muted-foreground)' }}>
                    Crea tu primer widget para ver analíticas aquí.
                  </p>
                  <Link href="/dashboard/widget-builder"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold no-underline"
                    style={{ color: CHART_ACCENT }}>
                    Crear widget <ArrowUpRight size={12} />
                  </Link>
                </div>
              ) : loadingAnalytics || !widgetAnalytics ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(var(--brand-primary-rgb),0.04)' }}>
                      <Skel w="50%" h={11} />
                      <div className="mt-2"><Skel w="65%" h={28} /></div>
                      <div className="mt-1"><Skel w="40%" h={11} /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="metric-value-appear">
                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {(() => {
                      // La analítica no trae "periodo anterior": lo único
                      // comparable de verdad es el último mes contra el previo.
                      // `byMonth` llega del más nuevo al más viejo (ver
                      // /api/analytics/widget/[id]), así que hay que darlo vuelta.
                      const delta = monthOverMonth(mesesEnOrden);
                      return (
                        <AnalyticTile
                          label="Aperturas"
                          value={widgetAnalytics.summary.totalSessions.toLocaleString('es')}
                          sub="sesiones en 3 meses"
                          delta={delta && delta.direction !== 'flat' ? {
                            text: `${delta.deltaPct > 0 ? '+' : ''}${delta.deltaPct}% vs mes anterior`,
                            tone: delta.direction === 'up' ? 'success' : 'danger',
                          } : undefined}
                        />
                      );
                    })()}
                    <AnalyticTile
                      label="Mensajes por sesión"
                      value={String(widgetAnalytics.summary.avgMessagesPerSession)}
                      sub="promedio por conversación" />
                    <AnalyticTile
                      label="Leads a humano"
                      value={`${widgetAnalytics.summary.escalationRate}%`}
                      sub="pidieron hablar con una persona" />
                    <AnalyticTile
                      label="Abandono"
                      value={`${widgetAnalytics.summary.dropOffRate}%`}
                      sub="abrieron sin escribir" />
                  </div>

                  {/* Satisfacción — clic para ver respuestas */}
                  {widgetAnalytics.satisfaction && (
                    <button
                      type="button"
                      onClick={() => void openFeedbackModal()}
                      className="w-full text-left rounded-2xl p-5 mb-3"
                      style={{ background: 'var(--card)', border: '1px solid rgba(26,28,30,0.08)', cursor: 'pointer' }}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>Satisfacción</span>
                          <p
                            className="m-0 mt-1.5 flex items-center gap-2"
                            style={{ fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}
                          >
                            {widgetAnalytics.satisfaction.avgScore != null
                              ? `${widgetAnalytics.satisfaction.avgScore.toFixed(1)} / 5`
                              : 'Sin datos'}
                            <span style={{ color: CHART_ACCENT, fontSize: 17 }}>
                              {'★'.repeat(Math.round(widgetAnalytics.satisfaction.avgScore || 0))}
                              <span style={{ color: 'rgba(26,28,30,0.16)' }}>{'★'.repeat(5 - Math.round(widgetAnalytics.satisfaction.avgScore || 0))}</span>
                            </span>
                          </p>
                          <p className="text-[12.5px] m-0 mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                            {widgetAnalytics.satisfaction.totalResponses} respuesta{widgetAnalytics.satisfaction.totalResponses === 1 ? '' : 's'} · {widgetAnalytics.satisfaction.responseRate}% de las sesiones respondió
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold" style={{ color: CHART_ACCENT }}>Ver respuestas →</span>
                      </div>
                    </button>
                  )}

                  {/* Hora pico, meses y salidas — cada tarjeta lleva su
                      propio enlace al detalle. Antes los tres atajos vivían
                      sueltos al pie, compitiendo entre sí. */}
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid rgba(26,28,30,0.08)' }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>Hora pico</span>
                        <button
                          type="button"
                          onClick={() => setHourModalOpen(true)}
                          className="text-[13px] font-semibold bg-transparent border-0 p-0"
                          style={{ color: CHART_ACCENT, cursor: 'pointer' }}
                        >
                          Ver por hora
                        </button>
                      </div>
                      <p className="m-0" style={{ fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>
                        {formatHourLabel(widgetAnalytics.peakHour)}
                      </p>
                      <p className="text-[12.5px] m-0 mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                        {widgetAnalytics.peakHour == null ? 'sin actividad aún' : `${widgetAnalytics.hourDistribution?.[widgetAnalytics.peakHour] ?? 0} mensajes en esa hora`}
                      </p>
                    </div>

                    <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid rgba(26,28,30,0.08)' }}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>Sesiones por mes</span>
                      </div>
                      <div className="flex items-end gap-3">
                        {monthBarHeights(mesesEnOrden).map((bar) => (
                          <div key={bar.month} className="flex-1 flex flex-col items-center gap-1.5">
                            <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>{bar.sessions}</span>
                            {/* El área de barras necesita su propia altura fija: si el
                                porcentaje se resuelve contra la columna entera (que
                                además lleva número y etiqueta), las barras se aplastan. */}
                            <div className="w-full flex items-end justify-center" style={{ height: 72 }}>
                              <div
                                className="w-full"
                                style={{
                                  // Sin tope se estiran hasta parecer bloques cuando
                                  // el periodo trae pocos meses.
                                  maxWidth: 76,
                                  height: `${bar.heightPct}%`, minHeight: 4,
                                  borderRadius: '8px 8px 4px 4px',
                                  // El mes en curso a color pleno; los previos, apagados.
                                  background: bar.isCurrent ? CHART_ACCENT : 'rgba(var(--brand-primary-rgb),0.22)',
                                }}
                              />
                            </div>
                            <span
                              className="text-[12px]"
                              style={{ color: bar.isCurrent ? 'var(--foreground)' : 'var(--muted-foreground)', fontWeight: bar.isCurrent ? 600 : 400 }}
                            >
                              {bar.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl p-5 mt-3" style={{ background: 'var(--card)', border: '1px solid rgba(26,28,30,0.08)' }}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>Cómo terminaron</span>
                      <span className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setSentimentModalOpen(true)}
                          className="text-[13px] font-semibold bg-transparent border-0 p-0"
                          style={{ color: CHART_ACCENT, cursor: 'pointer' }}
                        >
                          Sentiment
                        </button>
                        <span aria-hidden style={{ color: 'var(--border)' }}>·</span>
                        <button
                          type="button"
                          onClick={() => setResultsModalOpen(true)}
                          className="text-[13px] font-semibold bg-transparent border-0 p-0"
                          style={{ color: CHART_ACCENT, cursor: 'pointer' }}
                        >
                          Detalle
                        </button>
                      </span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {outcomeBreakdown(widgetAnalytics.summary).map((row) => (
                        <div key={row.key} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-[13px]">
                            <span className="font-semibold">{row.label}</span>
                            <span style={{ color: 'var(--muted-foreground)' }}>
                              {row.count.toLocaleString('es')} · {row.pct}%
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 999, background: 'rgba(26,28,30,0.07)' }}>
                            <div style={{ width: `${row.pct}%`, height: '100%', borderRadius: 999, background: TONE_COLOR[row.tone] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
          </section>
        )}

        <DashboardMetricModal
          open={hourModalOpen}
          onClose={() => setHourModalOpen(false)}
          title="Distribución por hora"
          description="Mensajes recibidos en cada hora del día (hora Colombia), sobre el periodo del widget seleccionado."
        >
          {widgetAnalytics?.hourDistribution && (
            <MiniBarHistogram
              values={widgetAnalytics.hourDistribution}
              labels={Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? formatHourLabel(h).replace(' ', '') : ''))}
              height={140}
            />
          )}
        </DashboardMetricModal>

        <DashboardMetricModal
          open={sentimentModalOpen}
          onClose={() => setSentimentModalOpen(false)}
          title="Sentiment de las conversaciones"
          description="Tono detectado en las sesiones del periodo del widget seleccionado."
        >
          {widgetAnalytics?.sentiment && (() => {
            const s = widgetAnalytics.sentiment;
            const total = s.positive + s.neutral + s.negative;
            const rows: { label: string; value: number; color: string }[] = [
              { label: 'Positivo', value: s.positive, color: STATE.success },
              { label: 'Neutral', value: s.neutral, color: 'var(--muted-foreground)' },
              { label: 'Negativo', value: s.negative, color: STATE.error },
            ];
            return total === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
                Sin conversaciones con sentiment registrado en este periodo.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {rows.map((r) => (
                  <MetricBarRow
                    key={r.label}
                    label={r.label}
                    value={`${r.value} · ${Math.round((r.value / total) * 100)}%`}
                    pct={(r.value / total) * 100}
                    color={r.color}
                  />
                ))}
              </div>
            );
          })()}
        </DashboardMetricModal>

        <DashboardMetricModal
          open={resultsModalOpen}
          onClose={() => setResultsModalOpen(false)}
          title="Resumen de resultados"
          description="Cómo terminan las conversaciones del periodo del widget seleccionado."
        >
          {widgetAnalytics && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <MetricBarRow
                label="Resueltas"
                value={`${widgetAnalytics.summary.resolutionRate}%`}
                pct={widgetAnalytics.summary.resolutionRate}
                color={STATE.success}
              />
              <MetricBarRow
                label="Escaladas a humano"
                value={`${widgetAnalytics.summary.escalationRate}%`}
                pct={widgetAnalytics.summary.escalationRate}
                color={CHART_ACCENT}
              />
              <MetricBarRow
                label="Abandonadas"
                value={`${widgetAnalytics.summary.dropOffRate}%`}
                pct={widgetAnalytics.summary.dropOffRate}
                color={STATE.error}
              />
            </div>
          )}
        </DashboardMetricModal>

      {/* Modal: respuestas de la encuesta de satisfacción */}
      {feedbackModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(2,6,23,0.6)' }}
          onClick={() => setFeedbackModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-bold m-0">Respuestas de clientes</p>
              <button type="button" onClick={() => setFeedbackModalOpen(false)} className="p-1.5 rounded-lg" style={{ border: '1px solid var(--border)', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
            <div className="p-4 overflow-auto">
              {loadingFeedback ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  <Loader2 size={15} className="animate-spin" /> Cargando…
                </div>
              ) : feedbackList.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Aún no hay respuestas de la encuesta para este widget.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {feedbackList.map((f) => (
                    <div key={f._id} className="rounded-xl p-3" style={{ border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        {f.score != null ? (
                          <span style={{ color: CHART_ACCENT, fontSize: 15, opacity: 0.9 }}>
                            {'★'.repeat(Math.round(f.score))}
                            <span style={{ color: 'rgba(0,0,0,0.18)' }}>{'★'.repeat(5 - Math.round(f.score))}</span>
                          </span>
                        ) : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Sin rating</span>}
                        <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                          {new Date(f.createdAt).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {f.answers.map((a, ai) => (
                          <div key={ai} className="text-xs">
                            <span style={{ color: 'var(--muted-foreground)' }}>{a.questionText}: </span>
                            <span className="font-semibold">
                              {a.type === 'rating' ? `${a.value}/5 ★` : String(a.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

/* ── Analytic tile ─────────────────────────────────────────────────────────── */
/**
 * Antes: etiqueta de 10px en mayúsculas con tracking ancho, subtítulo de 10px y
 * un fondo teal al 4% que no separaba nada. Ahora la etiqueta se lee (12px en
 * caja normal), la cifra usa la tipografía de títulos y la tarjeta tiene el
 * borde fino del tema en vez de un tinte.
 */
function AnalyticTile({
  label, value, sub, delta,
}: {
  label: string;
  value: string;
  sub: string;
  delta?: { text: string; tone: MetricTone };
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-1.5"
      style={{ background: 'var(--card)', border: '1px solid rgba(26,28,30,0.08)' }}
    >
      <span className="text-[12px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      <p
        className="m-0"
        style={{
          fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
          fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em',
          color: 'var(--foreground)',
        }}
      >
        {value}
      </p>
      {delta ? (
        <span className="text-[12.5px] font-semibold" style={{ color: TONE_COLOR[delta.tone] }}>{delta.text}</span>
      ) : (
        <span className="text-[12.5px]" style={{ color: 'var(--muted-foreground)' }}>{sub}</span>
      )}
    </div>
  );
}
