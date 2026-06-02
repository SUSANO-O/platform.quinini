'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { QuotaTopupBanner } from '@/components/dashboard/quota-topup-banner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Sparkles, Activity, MessageSquare,
  TrendingUp, Crown, Clock, Zap, ArrowUpRight, RefreshCw,
  BarChart2, Users, UserCheck, Bot, X, Loader2,
} from 'lucide-react';

import { BRAND, METRIC, STATE, R, O, B } from '@/lib/brand-colors';
import { countOwnedMainAgents } from '@/lib/agent-plans';
import { resolveRange, type DateRange } from '@/lib/date-range';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';

interface UsageData {
  used: number;
  limit: number;
  percentUsed: number;
  plan: string;
  platformFreeLimit?: number;
  platformFreeUsed?: number;
  platformFreeRemaining?: number;
  platformCycleKey?: string;
  activePacks: { packId: string; remaining: number; total: number; expiresAt: string }[];
}

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

  const coreMetricsReady =
    usage !== null && agentCount !== null && widgetCount !== null;

  useEffect(() => {
    if (user?.role === 'admin') router.replace('/admin');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/usage').then(r => r.ok ? r.json() : null).then(d => d && setUsage(d)).catch(() => {});
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
      .then(d => d && typeof d.count === 'number' && setConversationsToday(d.count))
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
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-100px' }} />

      <div className="relative px-4 py-4 max-w-5xl mx-auto">

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

        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="badge-primary mb-3 w-fit">
              <Sparkles size={13} />
              Panel de Control
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight m-0" style={{ letterSpacing: '-0.02em' }}>
              Hola,{' '}
              <span className="gradient-text">
                {user?.displayName || user?.email?.split('@')[0]}
              </span>{' '}
              👋
            </h1>
            <p className="text-sm mt-1 m-0" style={{ color: 'var(--muted-foreground)' }}>
              {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range picker — afecta tarjetas con métricas dependientes de tiempo */}
            <DateRangePicker value={dateRange} onChange={setDateRange} />

            {/* Plan badge */}
            {loading ? (
              <Skel w={120} h={28} r={999} />
            ) : isPremium ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}>
                <Crown size={12} />{planLabel} — activo
              </div>
            ) : isTrialActive ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: `${O}12`, color: O, border: `1px solid ${O}30` }}>
                <Clock size={12} />Trial — {trialDaysRemaining} días restantes
              </div>
            ) : (
              <Link href="/dashboard/settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold no-underline"
                style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}>
                <Zap size={12} />Actualizar plan →
              </Link>
            )}
          </div>
        </div>

        {/* ── METRICS ROW ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <MetricCard
            accent={`linear-gradient(90deg,${R},${O})`}
            icon={<MessageSquare size={13} style={{ color: R }} />}
            label="Conversaciones"
            value={usage ? usage.used.toLocaleString('es') : '—'}
            sub={usage ? (usage.limit === -1 ? 'ilimitadas' : `/ ${usage.limit.toLocaleString('es')} este mes`) : '—'}
            bar={usage && usage.limit !== -1 ? {
              pct: Math.min(usage.percentUsed, 100),
              color: usage.percentUsed >= 80 ? `linear-gradient(90deg,${STATE.warning},${STATE.error})` : `linear-gradient(90deg,${R},${O})`,
            } : undefined}
          />
          <MetricCard
            accent={`linear-gradient(90deg,${O},${B})`}
            icon={<Clock size={13} style={{ color: O }} />}
            label={dateRange.preset === 'today' ? 'Conversaciones hoy' : 'Conversaciones en rango'}
            value={conversationsToday === null ? '—' : conversationsToday.toLocaleString('es')}
            sub={
              conversationsToday === null
                ? '—'
                : dateRange.preset === 'today'
                  ? (conversationsToday === 0 ? 'sin actividad aún' : conversationsToday === 1 ? 'iniciada hoy' : 'iniciadas hoy')
                  : dateRange.label.toLowerCase()
            }
          />
          <MetricCard
            accent={`linear-gradient(90deg,${B},${B}88)`}
            icon={<Bot size={13} style={{ color: B }} />}
            label="Agentes"
            value={agentCount === null ? '—' : String(agentCount)}
            sub={agentCount === null ? '—' : agentCount === 0 ? 'crea tu primer agente' : agentCount === 1 ? 'agente activo' : 'agentes creados'}
          />
          <MetricCard
            accent={`linear-gradient(90deg,${B},${B}88)`}
            icon={<BarChart2 size={13} style={{ color: METRIC.neutral }} />}
            label="Widgets"
            value={widgetCount === null ? '—' : String(widgetCount)}
            sub={widgetCount === null ? '—' : widgetCount === 0 ? 'crea tu primer widget' : widgetCount === 1 ? 'widget desplegado' : 'widgets desplegados'}
          />
        </div>

        {/* ── MAIN 2-COL ───────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-5 mb-8">

          {/* ── LEFT ────────────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Usage analytics — siempre visible, skeleton cuando no hay datos */}
            <div
              className="rounded-2xl border card-texture overflow-hidden"
              style={{ borderColor: usage && usage.percentUsed >= 80 ? 'rgba(239,68,68,0.35)' : 'var(--border)' }}
            >
              <div
                className={!usage ? 'metric-accent-loading' : undefined}
                style={{
                  height: 3,
                  background: !usage
                    ? `linear-gradient(90deg,${R}40,${R},${O},${B},${R}40)`
                    : `linear-gradient(90deg,${R},${O},${B})`,
                }}
              />
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} style={{ color: R }} />
                    <h3 className="text-[13px] font-bold m-0">Uso del mes actual</h3>
                  </div>
                  {usage ? (
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full"
                      style={{
                        background: usage.percentUsed >= 80 ? STATE.errorBg : `${R}10`,
                        color: usage.percentUsed >= 80 ? STATE.error : R,
                        border: `1px solid ${usage.percentUsed >= 80 ? STATE.errorBorder : R + '30'}`,
                      }}>
                      {usage.percentUsed}% usado
                    </span>
                  ) : (
                    <Skel w={72} h={24} r={999} />
                  )}
                </div>

                {usage ? (
                  <div className="metric-value-appear">
                    <div className="flex items-end justify-between mb-3">
                      <span className="text-4xl font-extrabold" style={{ letterSpacing: '-0.04em' }}>
                        {usage.used.toLocaleString('es')}
                      </span>
                      <span className="text-sm pb-1" style={{ color: 'var(--muted-foreground)' }}>
                        {usage.limit === -1 ? 'ilimitado' : `/ ${usage.limit.toLocaleString('es')} conv.`}
                      </span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden mb-3"
                      style={{ background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.06)' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(usage.percentUsed, 100)}%`,
                        background: usage.percentUsed >= 80 ? `linear-gradient(90deg,${STATE.warning},${STATE.error})` : `linear-gradient(90deg,${R},${O},${B})`,
                        borderRadius: 999,
                        transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
                      }} />
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <span className="capitalize font-semibold">Plan {usage.plan}</span>
                      {usage.percentUsed >= 80 ? (
                        <Link href="/dashboard/settings" className="font-bold" style={{ color: R }}>Ver suscripción →</Link>
                      ) : (
                        <span>Dentro del rango mensual</span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Skeleton analytics */
                  <div className="flex flex-col gap-3">
                    <div className="flex items-end justify-between">
                      <Skel w="42%" h={40} />
                      <Skel w="28%" h={16} />
                    </div>
                    <div className="h-3 rounded-full overflow-hidden"
                      style={{ background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.06)' }}>
                      <div className="metric-skeleton" style={{ height: '100%', width: '35%', borderRadius: 999 }} />
                    </div>
                    <div className="flex justify-between">
                      <Skel w="22%" h={12} />
                      <Skel w="30%" h={12} />
                    </div>
                  </div>
                )}


                {/* Cuota de plataforma */}
                {usage && typeof usage.platformFreeLimit === 'number' && usage.platformFreeLimit > 0 && (
                  <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg text-[11px]"
                    style={{ background: `${B}06`, border: `1px solid ${B}15` }}>
                    <span style={{ color: B, fontWeight: 600 }}>Plataforma</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>
                      {(usage.platformFreeUsed ?? 0).toLocaleString('es')} / {usage.platformFreeLimit.toLocaleString('es')} conv.
                    </span>
                  </div>
                )}

                {/* Packs activos */}
                {usage && usage.activePacks.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {usage.activePacks.map((pack) => (
                      <div key={pack.packId} className="rounded-xl px-4 py-3"
                        style={{ background: `${O}08`, border: `1px solid ${O}20` }}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold" style={{ color: O }}>Pack {pack.packId}</span>
                          <span style={{ color: 'var(--muted-foreground)' }}>
                            {pack.remaining.toLocaleString('es')} / {pack.total.toLocaleString('es')}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.08)' }}>
                          <div style={{
                            height: '100%',
                            width: `${(pack.remaining / pack.total) * 100}%`,
                            background: `linear-gradient(90deg,${O},${R})`,
                            borderRadius: 999,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── RIGHT ───────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* System status — carga al final, tras métricas principales */}
            <div className="rounded-2xl border card-texture overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div
                className={!sysStatus && (loadingSysStatus || coreMetricsReady) ? 'metric-accent-loading' : undefined}
                style={{
                  height: 3,
                  background: sysStatus
                    ? `linear-gradient(90deg,${B},${B}99)`
                    : `linear-gradient(90deg,${B}40,${B},${B}88,${B}40)`,
                }}
              />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={14} style={{ color: METRIC.neutral }} />
                  <h3 className="text-[13px] font-bold m-0">Estado del sistema</h3>
                  <button
                    onClick={refreshStatus}
                    disabled={refreshingStatus || !coreMetricsReady}
                    title="Actualizar estado"
                    className="ml-auto"
                    style={{ background: 'none', border: 'none', cursor: refreshingStatus || !coreMetricsReady ? 'not-allowed' : 'pointer', padding: 2, color: 'var(--muted-foreground)', opacity: refreshingStatus || !coreMetricsReady ? 0.5 : 1 }}
                  >
                    <RefreshCw size={12} style={{ animation: refreshingStatus ? 'spin 0.7s linear infinite' : undefined }} />
                  </button>
                </div>
                {sysStatus ? (
                  <div className="metric-value-appear">
                    {sysStatus.status === 'operational' ? (
                      <p className="text-sm font-semibold m-0" style={{ color: STATE.success }}>
                        ✅ Todo funciona correctamente
                      </p>
                    ) : sysStatus.status === 'degraded' ? (
                      <>
                        <p className="text-sm font-semibold m-0" style={{ color: STATE.warning }}>
                          ⚠️ Estamos trabajando en ello
                        </p>
                        <p className="text-[11px] mt-1 m-0" style={{ color: 'var(--muted-foreground)' }}>
                          Puede haber demoras. Vuelve a intentarlo en unos minutos.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold m-0" style={{ color: STATE.error }}>
                          🔴 Servicio temporalmente no disponible
                        </p>
                        <p className="text-[11px] mt-1 m-0" style={{ color: 'var(--muted-foreground)' }}>
                          Nuestro equipo ya está al tanto. Disculpa los inconvenientes.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Skel w="70%" h={14} />
                    <Skel w="90%" h={11} />
                  </div>
                )}
              </div>
            </div>

            {/* Upgrade CTA — skeleton mientras carga, real cuando resuelve */}
            {loading ? (
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <div className="metric-accent-loading" style={{ height: 3, background: `linear-gradient(90deg,${R}40,${R},${O},${R}40)` }} />
                <div className="p-5 flex flex-col gap-3">
                  <Skel w="60%" h={14} />
                  <Skel w="90%" h={11} />
                  <Skel w="85%" h={11} />
                  <Skel w="100%" h={34} r={12} />
                </div>
              </div>
            ) : !isPremium ? (
              <div className="rounded-2xl overflow-hidden border"
                style={{ borderColor: `${R}30`, background: `linear-gradient(145deg,${R}08,${O}06)` }}>
                <div style={{ height: 3, background: `linear-gradient(90deg,${R},${O})` }} />
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} style={{ color: R }} />
                    <h3 className="text-[13px] font-bold m-0">
                      {isTrialActive ? `Trial — ${trialDaysRemaining} días` : 'Actualizar plan'}
                    </h3>
                  </div>
                  <p className="text-xs m-0 mb-4 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                    {isTrialActive
                      ? 'Activa tu plan antes de que venza el trial para mantener el acceso sin interrupciones.'
                      : 'Desbloquea más agentes, herramientas y conversaciones con un plan de pago.'}
                  </p>
                  <Link href="/dashboard/settings"
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white no-underline"
                    style={{ background: R, boxShadow: `0 4px 14px ${R}30` }}>
                    Ver planes <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Ajustes — siempre visible */}
            <Link href="/dashboard/settings"
              className="rounded-2xl border p-4 no-underline text-inherit card-hover flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              <div>
                <p className="text-[13px] font-bold m-0">Suscripción y cuenta</p>
                <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Facturas · plan · método de pago
                </p>
              </div>
              <ArrowUpRight size={15} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            </Link>

          </div>
        </div>
        {/* ── WIDGET ANALYTICS ─────────────────────────────────────────────── */}
        {widgetCount !== null && (
          <div className="rounded-2xl border card-texture overflow-hidden mb-8" style={{ borderColor: 'var(--border)' }}>
            <div style={{ height: 3, background: `linear-gradient(90deg,${O},${B})` }} />
            <div className="p-5 md:p-6">

              {/* Header */}
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <BarChart2 size={15} style={{ color: O }} />
                  <h3 className="text-[13px] font-bold m-0">Analítica de widgets</h3>
                </div>
                {widgets.length > 1 && (
                  <select
                    value={selectedWidget || ''}
                    onChange={e => { setSelectedWidget(e.target.value); }}
                    className="text-xs rounded-lg px-2.5 py-1.5"
                    style={{ border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', outline: 'none' }}
                  >
                    {widgets.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                  </select>
                )}
                {widgets.length === 1 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: `${O}10`, color: O, border: `1px solid ${O}25` }}>
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
                    style={{ color: O }}>
                    Crear widget <ArrowUpRight size={12} />
                  </Link>
                </div>
              ) : loadingAnalytics || !widgetAnalytics ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.04)', border: '1px solid var(--border)' }}>
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
                    <AnalyticTile color={R} icon={<Users size={12} style={{ color: R }} />}
                      label="Aperturas" value={widgetAnalytics.summary.totalSessions.toLocaleString('es')}
                      sub="sesiones en 3 meses" />
                    <AnalyticTile color={B} icon={<MessageSquare size={12} style={{ color: B }} />}
                      label="Mensajes / sesión" value={String(widgetAnalytics.summary.avgMessagesPerSession)}
                      sub="promedio por conversación" />
                    <AnalyticTile color={O} icon={<UserCheck size={12} style={{ color: O }} />}
                      label="Leads (handoff)" value={`${widgetAnalytics.summary.escalationRate}%`}
                      sub="pidieron hablar con humano" />
                    <AnalyticTile color={METRIC.neutral} icon={<TrendingUp size={12} style={{ color: METRIC.neutral }} />}
                      label="Abandono" value={`${widgetAnalytics.summary.dropOffRate}%`}
                      sub="abrieron sin escribir" />
                  </div>

                  {/* Satisfacción — clic para ver respuestas */}
                  {widgetAnalytics.satisfaction && (
                    <button
                      type="button"
                      onClick={() => void openFeedbackModal()}
                      className="w-full text-left rounded-xl p-4 mb-4 transition-opacity hover:opacity-90"
                      style={{ background: 'rgba(245,179,1,0.07)', border: '1px solid rgba(245,179,1,0.3)', cursor: 'pointer' }}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-[10px] font-bold uppercase" style={{ color: '#b58100', letterSpacing: '0.05em' }}>Satisfacción</span>
                          <p className="text-2xl font-extrabold m-0 mt-1">
                            {widgetAnalytics.satisfaction.avgScore != null
                              ? `${widgetAnalytics.satisfaction.avgScore.toFixed(1)} / 5`
                              : 'Sin datos'}
                            <span style={{ color: '#f5b301', marginLeft: 8, fontSize: 18 }}>
                              {'★'.repeat(Math.round(widgetAnalytics.satisfaction.avgScore || 0))}
                              <span style={{ color: '#d9d9d9' }}>{'★'.repeat(5 - Math.round(widgetAnalytics.satisfaction.avgScore || 0))}</span>
                            </span>
                          </p>
                          <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                            {widgetAnalytics.satisfaction.totalResponses} respuesta{widgetAnalytics.satisfaction.totalResponses === 1 ? '' : 's'} · {widgetAnalytics.satisfaction.responseRate}% de las sesiones respondió
                          </p>
                        </div>
                        <span className="text-xs font-bold" style={{ color: '#b58100' }}>Ver respuestas →</span>
                      </div>
                    </button>
                  )}

                  {/* Peak hour + monthly bars */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.03)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock size={12} style={{ color: O }} />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Hora pico</span>
                      </div>
                      <p className="text-3xl font-extrabold m-0" style={{ letterSpacing: '-0.03em', color: O }}>
                        {widgetAnalytics.peakHour == null ? '—' : formatHour(widgetAnalytics.peakHour)}
                      </p>
                      <p className="text-[11px] m-0 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        {widgetAnalytics.peakHour == null ? 'sin actividad aún' : 'mayor actividad del widget'}
                      </p>
                    </div>

                    <div className="rounded-xl p-4" style={{ background: 'rgba(15,23,42,0.03)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 size={12} style={{ color: B }} />
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
                                background: `linear-gradient(180deg,${B},${B}88)`, opacity: 0.85,
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
            </div>
          </div>
        )}

      </div>

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
                          <span style={{ color: '#f5b301', fontSize: 15 }}>
                            {'★'.repeat(Math.round(f.score))}
                            <span style={{ color: '#d9d9d9' }}>{'★'.repeat(5 - Math.round(f.score))}</span>
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
    </div>
  );
}

/* ── Analytic tile ─────────────────────────────────────────────────────────── */
function AnalyticTile({ color, icon, label, value, sub }: { color: string; icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: `${color}08`, border: `1px solid ${color}22` }}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
      </div>
      <p className="text-2xl font-extrabold m-0" style={{ letterSpacing: '-0.03em', color }}>{value}</p>
      <p className="text-[10px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
    </div>
  );
}

/* ── Métrica pequeña reutilizable ─────────────────────────────────────────── */
function MetricCard({
  accent, icon, label, value, sub, bar,
}: {
  accent: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  bar?: { pct: number; color: string };
}) {
  const isLoading = value === '—';

  return (
    <div className="rounded-2xl border card-texture overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div
        className={isLoading ? 'metric-accent-loading' : undefined}
        style={{
          height: 2,
          background: isLoading
            ? `linear-gradient(90deg,${accent}30,${accent},${accent}cc,${accent}30)`
            : accent,
        }}
      />
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
            {label}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 mt-1">
            <div className="metric-skeleton" style={{ height: 28, width: '55%', borderRadius: 6 }} />
            <div className="metric-skeleton" style={{ height: 11, width: '75%', borderRadius: 4 }} />
          </div>
        ) : (
          <div key={value} className="metric-value-appear">
            <p className="text-2xl font-extrabold m-0" style={{ letterSpacing: '-0.03em' }}>{value}</p>
            <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
          </div>
        )}

        {bar && (
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            {isLoading ? (
              <div className="metric-skeleton" style={{ height: '100%', width: '40%', borderRadius: 999 }} />
            ) : (
              <div style={{ height: '100%', width: `${bar.pct}%`, background: bar.color, borderRadius: 999, transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
