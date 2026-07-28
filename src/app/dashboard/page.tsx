'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { QuotaTopupBanner } from '@/components/dashboard/quota-topup-banner';
import { DashboardHomeOverview, type DashboardUsageData } from '@/components/dashboard/dashboard-home-overview';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardGreetingHeader } from '@/components/dashboard/dashboard-greeting-header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  MessageSquare,
  TrendingUp, ArrowUpRight, Clock,
  BarChart2, Users, UserCheck, X, Loader2,
} from 'lucide-react';

import { BRAND, STATE, R } from '@/lib/brand-colors';
import { countOwnedMainAgents } from '@/lib/agent-plans';
import { resolveRange, type DateRange } from '@/lib/date-range';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';

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
  };
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

function formatHour(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

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
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackList,     setFeedbackList]     = useState<FeedbackItem[]>([]);
  const [loadingFeedback,  setLoadingFeedback]  = useState(false);
  const [inboxOpenCount,   setInboxOpenCount]   = useState<number | null>(null);

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
                  <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: `${R}12` }}>
                    <BarChart2 size={14} style={{ color: R }} />
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
                    style={{ background: `${R}10`, color: R }}>
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
                    style={{ color: R }}>
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
                    <AnalyticTile
                      icon={<Users size={12} style={{ color: R }} />}
                      label="Aperturas" value={widgetAnalytics.summary.totalSessions.toLocaleString('es')}
                      sub="sesiones en 3 meses" />
                    <AnalyticTile
                      icon={<MessageSquare size={12} style={{ color: R }} />}
                      label="Mensajes / sesión" value={String(widgetAnalytics.summary.avgMessagesPerSession)}
                      sub="promedio por conversación" />
                    <AnalyticTile
                      icon={<UserCheck size={12} style={{ color: R }} />}
                      label="Leads (handoff)" value={`${widgetAnalytics.summary.escalationRate}%`}
                      sub="pidieron hablar con humano" />
                    <AnalyticTile
                      icon={<TrendingUp size={12} style={{ color: R }} />}
                      label="Abandono" value={`${widgetAnalytics.summary.dropOffRate}%`}
                      sub="abrieron sin escribir" />
                  </div>

                  {/* Satisfacción — clic para ver respuestas */}
                  {widgetAnalytics.satisfaction && (
                    <button
                      type="button"
                      onClick={() => void openFeedbackModal()}
                      className="w-full text-left rounded-xl p-4 mb-4 transition-opacity hover:opacity-90"
                      style={{ background: 'rgba(var(--brand-primary-rgb),0.05)', border: '1px solid rgba(var(--brand-primary-rgb),0.12)', cursor: 'pointer' }}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-[10px] font-bold uppercase" style={{ color: R, letterSpacing: '0.05em' }}>Satisfacción</span>
                          <p className="text-2xl font-extrabold m-0 mt-1">
                            {widgetAnalytics.satisfaction.avgScore != null
                              ? `${widgetAnalytics.satisfaction.avgScore.toFixed(1)} / 5`
                              : 'Sin datos'}
                            <span style={{ color: R, marginLeft: 8, fontSize: 18, opacity: 0.85 }}>
                              {'★'.repeat(Math.round(widgetAnalytics.satisfaction.avgScore || 0))}
                              <span style={{ color: 'rgba(var(--brand-primary-rgb),0.2)' }}>{'★'.repeat(5 - Math.round(widgetAnalytics.satisfaction.avgScore || 0))}</span>
                            </span>
                          </p>
                          <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                            {widgetAnalytics.satisfaction.totalResponses} respuesta{widgetAnalytics.satisfaction.totalResponses === 1 ? '' : 's'} · {widgetAnalytics.satisfaction.responseRate}% de las sesiones respondió
                          </p>
                        </div>
                        <span className="text-xs font-bold" style={{ color: R }}>Ver respuestas →</span>
                      </div>
                    </button>
                  )}

                  {/* Peak hour + monthly bars */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl p-4" style={{ background: 'rgba(var(--brand-primary-rgb),0.03)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock size={12} style={{ color: R }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Hora pico</span>
                      </div>
                      <p className="text-3xl font-extrabold m-0" style={{ letterSpacing: '-0.03em', color: R }}>
                        {widgetAnalytics.peakHour == null ? '—' : formatHour(widgetAnalytics.peakHour)}
                      </p>
                      <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        {widgetAnalytics.peakHour == null ? 'sin actividad aún' : `${widgetAnalytics.hourDistribution?.[widgetAnalytics.peakHour] ?? 0} mensajes en esa hora`}
                      </p>
                    </div>

                    <div className="rounded-xl p-4" style={{ background: 'rgba(var(--brand-primary-rgb),0.03)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 size={12} style={{ color: R }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Sesiones por mes</span>
                      </div>
                      <div className="flex items-end gap-2" style={{ height: 56 }}>
                        {[...widgetAnalytics.byMonth].reverse().map((m) => {
                          const max = Math.max(...widgetAnalytics.byMonth.map(x => x.sessions), 1);
                          const pct = Math.max((m.sessions / max) * 100, 6);
                          return (
                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                              <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{m.sessions}</span>
                              <div className="w-full rounded-t-md" style={{
                                height: `${pct}%`, minHeight: 4,
                                background: `linear-gradient(180deg,${BRAND.primaryLight},${R})`, opacity: 0.9,
                              }} />
                              <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{m.month.slice(5)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
          </section>
        )}

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
                          <span style={{ color: R, fontSize: 15, opacity: 0.9 }}>
                            {'★'.repeat(Math.round(f.score))}
                            <span style={{ color: 'rgba(var(--brand-primary-rgb),0.22)' }}>{'★'.repeat(5 - Math.round(f.score))}</span>
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
function AnalyticTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(var(--brand-primary-rgb),0.04)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      </div>
      <p className="text-2xl font-extrabold m-0" style={{ letterSpacing: '-0.03em', color: 'var(--foreground)' }}>{value}</p>
      <p className="text-[10px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
    </div>
  );
}
