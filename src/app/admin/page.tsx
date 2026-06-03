'use client';

import { useEffect, useState } from 'react';
import { BRAND, STATE, PLAN_ACCENTS, METRIC } from '@/lib/brand-colors';
import Link from 'next/link';
import { Users, Boxes, TrendingUp, Clock, XCircle, CheckCircle, AlertTriangle, Ban, Activity, ShoppingBag, LayoutDashboard, Database, Cpu, Network, HardDrive } from 'lucide-react';

interface UserQuota {
  userId: string;
  email: string;
  plan: string;
  used: number;
  limit: number;
  percent: number;
}

interface Stats {
  totalUsers: number;
  totalWidgets: number;
  trialing: number;
  active: number;
  canceled: number;
  mrr: number;
  requestsThisMonth: number;
  usersOverQuota: number;
  usersNearQuota: number;
  totalCapacity: number;
  perUserRequests: UserQuota[];
}

interface PackRow {
  id: string;
  userId: string;
  email: string;
  packId: string;
  label: string;
  conversations: number;
  used: number;
  remaining: number;
  status: string;
  price: number;
  expiresAt: string;
  purchasedAt: string | null;
  stripeSessionId: string | null;
}

interface PacksData {
  totalRevenue: number;
  totalConversationsSold: number;
  totalPacks: number;
  packs: PackRow[];
}

interface ReminderResult {
  ok: boolean;
  dryRun: boolean;
  checkedSubscriptions: number;
  remindersFound: number;
  remindersSent: number;
  filters?: {
    kinds: Array<'trial' | 'renewal'>;
    plans: Array<'free' | 'solo' | 'team' | 'plus' | 'business' | 'enterprise'>;
    limit: number;
  };
  report?: Array<{ email: string; kind: 'trial' | 'renewal'; daysLeft: number }>;
  error?: string;
}

interface WidgetAnalyticsSupervision {
  subAgentsTotal: number;
  subAgentsActive: number;
  inventory: Array<{
    id: string;
    name: string;
    parentAgentId: string | null;
    parentName: string | null;
    userId: string;
    userEmail: string;
    status: string;
    hubSlug: string | null;
    syncStatus: string;
    updatedAt: string | null;
  }>;
}

interface WidgetAnalyticsPayload {
  supervision?: WidgetAnalyticsSupervision;
}

interface ServiceCheck {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latencyMs: number | null;
  message?: string;
}

interface SystemStatus {
  status: 'operational' | 'degraded' | 'down';
  timestamp: string;
  services: ServiceCheck[];
}

const SVC_STATUS_COLOR: Record<string, string> = {
  operational: STATE.success,
  degraded: STATE.warning,
  down: STATE.error,
};

const SVC_ICON: Record<string, React.ComponentType<{ size: number; style?: React.CSSProperties }>> = {
  'Plataforma': Cpu,
  'Base de datos': Database,
  'Procesamiento': Network,
  'Coordinación': Network,
  'Caché': HardDrive,
};

const PLAN_COLOR: Record<string, string> = {
  free: METRIC.neutral,
  ...PLAN_ACCENTS,
  enterprise: '#a855f7',
};

function QuotaBar({ percent }: { percent: number }) {
  const clamped = Math.min(percent, 100);
  const color = percent >= 100 ? STATE.error : percent >= 80 ? STATE.warning : STATE.success;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '36px', textAlign: 'right' }}>
        {percent}%
      </span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  exhausted: '#ef4444',
  expired: '#64748b',
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [quotaFilter, setQuotaFilter] = useState<'all' | 'over' | 'near'>('all');
  const [packs, setPacks] = useState<PacksData | null>(null);
  const [packFilter, setPackFilter] = useState<'all' | 'active' | 'exhausted' | 'expired'>('all');
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<ReminderResult | null>(null);
  const [reminderKinds, setReminderKinds] = useState<Array<'trial' | 'renewal'>>(['trial', 'renewal']);
  const [reminderPlans, setReminderPlans] = useState<Array<'free' | 'solo' | 'team' | 'plus' | 'business' | 'enterprise'>>(['free', 'solo', 'team', 'plus', 'business', 'enterprise']);
  const [reminderLimit, setReminderLimit] = useState(500);
  const [widgetAnalytics, setWidgetAnalytics] = useState<WidgetAnalyticsPayload | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats').then((r) => r.json()).then(setStats);
    fetch('/api/admin/packs').then((r) => r.ok ? r.json() : null).then((d) => d && setPacks(d));
    fetch('/api/admin/widget-analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setWidgetAnalytics(d as WidgetAnalyticsPayload));
    fetch('/api/status').then((r) => r.ok ? r.json() : null).then((d) => d && setSysStatus(d));
  }, []);

  /** Misma base que dashboard MCP; enlaces del panel Admin solo exponen vars NEXT_PUBLIC_* en el cliente. */
  const hubUiBase = (process.env.NEXT_PUBLIC_AGENTFLOWHUB_URL || 'http://127.0.0.1:9010').replace(/\/$/, '');

  const metricCards = stats ? [
    { label: 'Usuarios totales',       value: stats.totalUsers,         icon: Users,         color: METRIC.neutral },
    { label: 'Widgets creados',        value: stats.totalWidgets,        icon: Boxes,         color: METRIC.neutral },
    { label: 'En trial',               value: stats.trialing,            icon: Clock,         color: STATE.warning },
    { label: 'Suscripciones activas',  value: stats.active,              icon: CheckCircle,   color: STATE.success },
    { label: 'Canceladas',             value: stats.canceled,            icon: XCircle,       color: STATE.error },
    { label: 'MRR estimado',           value: `$${stats.mrr}`,           icon: TrendingUp,    color: BRAND.warm },
    { label: 'Conversaciones este mes',value: stats.requestsThisMonth.toLocaleString('es'), icon: Activity, color: BRAND.primary },
    { label: 'Usuarios sobre límite',  value: stats.usersOverQuota,      icon: Ban,           color: STATE.error },
    { label: 'Usuarios al 80 %+',      value: stats.usersNearQuota,      icon: AlertTriangle, color: STATE.warning },
  ] : [];

  const filteredUsers = (stats?.perUserRequests ?? []).filter((u) => {
    if (quotaFilter === 'over') return u.limit !== -1 && u.percent >= 100;
    if (quotaFilter === 'near') return u.limit !== -1 && u.percent >= 80 && u.percent < 100;
    return true;
  });

  const spin = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--muted-foreground)' }}>
      <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Cargando...
    </div>
  );

  const runReminders = async (dryRun: boolean) => {
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const r = await fetch('/api/admin/subscription-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun,
          kinds: reminderKinds,
          plans: reminderPlans,
          limit: reminderLimit,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setReminderResult({
          ok: false,
          dryRun,
          checkedSubscriptions: 0,
          remindersFound: 0,
          remindersSent: 0,
          error: data?.error || 'No se pudo ejecutar el envio de recordatorios.',
        });
        return;
      }
      setReminderResult(data as ReminderResult);
    } catch {
      setReminderResult({
        ok: false,
        dryRun,
        checkedSubscriptions: 0,
        remindersFound: 0,
        remindersSent: 0,
        error: 'Error de red al ejecutar recordatorios.',
      });
    } finally {
      setSendingReminders(false);
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Panel Admin</h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '32px' }}>
        Resumen general · Mes actual: {new Date().toISOString().slice(0, 7)}
      </p>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 18px', marginBottom: '24px' }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Recordatorios de vencimiento</p>
        <p style={{ margin: '4px 0 12px', color: 'var(--muted-foreground)', fontSize: '12px' }}>
          Ejecuta notificaciones de trial/renovacion para 15, 7, 3, 1 y 0 dias.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <select
            value={reminderKinds.length === 2 ? 'both' : reminderKinds[0]}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'both') setReminderKinds(['trial', 'renewal']);
              else if (v === 'trial' || v === 'renewal') setReminderKinds([v]);
            }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            <option value="both">Tipos: trial + renovacion</option>
            <option value="trial">Tipos: solo trial</option>
            <option value="renewal">Tipos: solo renovacion</option>
          </select>
          <select
            value={reminderPlans.length === 5 ? 'all' : reminderPlans[0]}
            onChange={(e) => {
              const v = e.target.value as 'all' | 'free' | 'solo' | 'team' | 'plus' | 'business' | 'enterprise';
              if (v === 'all') setReminderPlans(['free', 'solo', 'team', 'plus', 'business', 'enterprise']);
              else setReminderPlans([v]);
            }}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            <option value="all">Planes: todos</option>
            <option value="free">Plan: free</option>
            <option value="starter">Plan: starter</option>
            <option value="growth">Plan: growth</option>
            <option value="business">Plan: business</option>
            <option value="enterprise">Plan: enterprise</option>
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted-foreground)' }}>
            Lote
            <input
              type="number"
              min={1}
              max={5000}
              value={reminderLimit}
              onChange={(e) => setReminderLimit(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))}
              style={{ width: '84px', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: '12px' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => runReminders(true)}
            disabled={sendingReminders}
            style={{
              padding: '7px 12px',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              background: 'var(--muted)',
              color: 'var(--foreground)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: sendingReminders ? 'not-allowed' : 'pointer',
              opacity: sendingReminders ? 0.7 : 1,
            }}
          >
            Probar (dry-run)
          </button>
          <button
            onClick={() => runReminders(false)}
            disabled={sendingReminders}
            style={{
              padding: '7px 12px',
              borderRadius: '9px',
              border: `1px solid ${BRAND.primary}`,
              background: BRAND.primary,
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: sendingReminders ? 'not-allowed' : 'pointer',
              opacity: sendingReminders ? 0.7 : 1,
            }}
          >
            Enviar recordatorios ahora
          </button>
        </div>
        {reminderResult && (
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '12px' }}>
            {!reminderResult.ok ? (
              <p style={{ margin: 0, color: '#ef4444', fontWeight: 700 }}>
                {reminderResult.error || 'No se pudo ejecutar la accion.'}
              </p>
            ) : (
              <>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {reminderResult.dryRun ? 'Simulacion lista' : 'Envio completado'} · revisadas {reminderResult.checkedSubscriptions} suscripciones
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
                  Detectadas: {reminderResult.remindersFound} · Enviadas: {reminderResult.remindersSent}
                </p>
                {reminderResult.filters && (
                  <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
                    Filtros → tipos: {reminderResult.filters.kinds.join(', ')} · planes: {reminderResult.filters.plans.join(', ')} · lote: {reminderResult.filters.limit}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── System Status ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={15} style={{ color: '#6366f1' }} />
          <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Estado de infraestructura</p>
          {sysStatus && (
            <span style={{
              marginLeft: 'auto', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
              background: sysStatus.status === 'operational' ? 'rgba(34,197,94,0.1)' : sysStatus.status === 'degraded' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
              color: SVC_STATUS_COLOR[sysStatus.status],
              border: `1px solid ${SVC_STATUS_COLOR[sysStatus.status]}40`,
            }}>
              {sysStatus.status === 'operational' ? 'Todo operativo' : sysStatus.status === 'degraded' ? 'Degradado' : 'Caído'}
            </span>
          )}
        </div>
        <div style={{ padding: '16px 20px' }}>
          {!sysStatus ? (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>Verificando servicios...</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {sysStatus.services.map((svc) => {
                const Icon = SVC_ICON[svc.name] ?? Activity;
                return (
                  <div key={svc.name} style={{
                    borderRadius: '10px', padding: '12px 14px',
                    background: `${SVC_STATUS_COLOR[svc.status]}08`,
                    border: `1px solid ${SVC_STATUS_COLOR[svc.status]}30`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <Icon size={13} style={{ color: SVC_STATUS_COLOR[svc.status] }} />
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: SVC_STATUS_COLOR[svc.status], boxShadow: svc.status === 'operational' ? `0 0 5px ${SVC_STATUS_COLOR[svc.status]}` : undefined }} />
                    </div>
                    <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 2px' }}>{svc.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>
                      {svc.latencyMs != null ? `${svc.latencyMs} ms` : svc.message ?? '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {sysStatus && (
            <p style={{ margin: '10px 0 0', fontSize: '10px', color: 'var(--muted-foreground)' }}>
              Última verificación: {new Date(sysStatus.timestamp).toLocaleString('es')}
            </p>
          )}
        </div>
      </div>

      {!stats ? spin : (
        <>
          {/* ── Metric cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '40px' }}>
            {metricCards.map((c) => (
              <div key={c.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>{c.label}</span>
                  <c.icon size={15} style={{ color: c.color }} />
                </div>
                <p style={{ fontSize: '26px', fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── Supervisión sub-agentes (inventario landing) ── */}
          {widgetAnalytics?.supervision && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '32px' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <LayoutDashboard size={20} style={{ color: '#6366f1' }} />
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Supervisión operativa · sub-agentes</p>
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '4px 0 0', maxWidth: '640px' }}>
                      Inventario en BotIvA (landing). Trazas por fase (router/worker), tools y <code style={{ fontSize: '10px' }}>traceId</code> están en AgentFlowhub → Granja → pestaña Supervisión.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <span><strong style={{ color: '#0d9488' }}>{widgetAnalytics.supervision.subAgentsActive}</strong> activos / {widgetAnalytics.supervision.subAgentsTotal} total</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    <Link href="/admin/sub-agents" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
                      Panel sub-agentes →
                    </Link>
                    {hubUiBase ? (
                      <a
                        href={`${hubUiBase}/agents/farm`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#0d9488', fontWeight: 700, textDecoration: 'none' }}
                      >
                        Granja en Hub ↗
                      </a>
                    ) : null}
                  </span>
                </div>
              </div>
              {widgetAnalytics.supervision.inventory.length === 0 ? (
                <p style={{ padding: '24px 20px', color: 'var(--muted-foreground)', fontSize: '13px', margin: 0 }}>
                  Aún no hay sub-agentes registrados en la base de datos de la landing.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--muted)' }}>
                        {['Sub-agente', 'Padre', 'Usuario', 'Estado', 'Sync hub', 'Actualizado'].map((h) => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {widgetAnalytics.supervision.inventory.map((s, i) => (
                        <tr key={s.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--muted-foreground)' }}>{s.parentName ?? '—'}</td>
                          <td style={{ padding: '10px 16px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.userEmail}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '10px', background: s.status === 'active' ? '#22c55e22' : '#64748b22', color: s.status === 'active' ? '#22c55e' : '#64748b' }}>
                              {s.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '10px' }}>{s.syncStatus}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                            {s.updatedAt ? new Date(s.updatedAt).toLocaleString('es') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Capacity overview ── */}
          {stats.totalCapacity > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '32px' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
                Capacidad total del mes
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, height: '8px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(Math.round((stats.requestsThisMonth / stats.totalCapacity) * 100), 100)}%`,
                    background: `linear-gradient(90deg,${BRAND.primary},${BRAND.warm})`,
                    borderRadius: '999px',
                  }} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {stats.requestsThisMonth.toLocaleString('es')} / {stats.totalCapacity.toLocaleString('es')} conv
                  {' '}({Math.round((stats.requestsThisMonth / stats.totalCapacity) * 100)}%)
                </span>
              </div>
            </div>
          )}

          {/* ── Quota per user ── */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '32px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Control de cuotas — top 50 usuarios</p>
                <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>Ordenado por conversaciones usadas este mes</p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([['all', 'Todos'], ['over', '🔴 Sobre límite'], ['near', '🟡 Al 80%+']] as const).map(([f, l]) => (
                  <button
                    key={f}
                    onClick={() => setQuotaFilter(f)}
                    style={{
                      padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: quotaFilter === f ? BRAND.primary : 'var(--muted)',
                      color: quotaFilter === f ? '#fff' : 'var(--foreground)',
                    }}
                  >{l}</button>
                ))}
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <p style={{ padding: '24px 20px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                No hay usuarios en esta categoría este mes.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--muted)' }}>
                      {['Email', 'Plan', 'Usado', 'Límite', 'Progreso'].map((h) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={u.userId} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                        <td style={{ padding: '10px 16px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.percent >= 100 && <span style={{ marginRight: '5px' }}>🔴</span>}
                          {u.percent >= 80 && u.percent < 100 && <span style={{ marginRight: '5px' }}>🟡</span>}
                          {u.email}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '10px', background: `${PLAN_COLOR[u.plan]}22`, color: PLAN_COLOR[u.plan] }}>
                            {u.plan}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 700 }}>{u.used.toLocaleString('es')}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--muted-foreground)' }}>
                          {u.limit === -1 ? '∞' : u.limit.toLocaleString('es')}
                        </td>
                        <td style={{ padding: '10px 16px', minWidth: '160px' }}>
                          <QuotaBar percent={u.percent} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Conversation packs sold ── */}
          {packs && (
            <>
              {/* Pack summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                {[
                  { label: 'Packs vendidos',      value: packs.totalPacks,                                  icon: ShoppingBag, color: '#a855f7' },
                  { label: 'Ingresos por packs',  value: `$${packs.totalRevenue}`,                          icon: TrendingUp,  color: '#22c55e' },
                  { label: 'Conv. vendidas',       value: packs.totalConversationsSold.toLocaleString('es'), icon: Activity,    color: BRAND.cool },
                ].map((c) => (
                  <div key={c.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600 }}>{c.label}</span>
                      <c.icon size={15} style={{ color: c.color }} />
                    </div>
                    <p style={{ fontSize: '26px', fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Packs table */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Packs de conversaciones vendidos</p>
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>Últimos 200 · más recientes primero</p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {([['all', 'Todos'], ['active', '🟢 Activos'], ['exhausted', '🔴 Agotados'], ['expired', '⚫ Vencidos']] as const).map(([f, l]) => (
                      <button
                        key={f}
                        onClick={() => setPackFilter(f)}
                        style={{
                          padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: packFilter === f ? '#a855f7' : 'var(--muted)',
                          color: packFilter === f ? '#fff' : 'var(--foreground)',
                        }}
                      >{l}</button>
                    ))}
                  </div>
                </div>

                {packs.packs.filter((p) => packFilter === 'all' || p.status === packFilter).length === 0 ? (
                  <p style={{ padding: '24px 20px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
                    No hay packs en esta categoría.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Usuario', 'Pack', 'Conv.', 'Usado', 'Estado', 'Precio', 'Comprado', 'Vence'].map((h) => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {packs.packs
                          .filter((p) => packFilter === 'all' || p.status === packFilter)
                          .map((p, i) => (
                            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                              <td style={{ padding: '10px 16px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.email}
                              </td>
                              <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.label}</td>
                              <td style={{ padding: '10px 16px', fontWeight: 700 }}>{p.conversations.toLocaleString('es')}</td>
                              <td style={{ padding: '10px 16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '80px' }}>
                                  <span>{p.used.toLocaleString('es')} / {p.conversations.toLocaleString('es')}</span>
                                  <div style={{ height: '4px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${Math.min(Math.round((p.used / p.conversations) * 100), 100)}%`,
                                      background: STATUS_COLOR[p.status] || '#64748b',
                                      borderRadius: '999px',
                                    }} />
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 16px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '10px', background: `${STATUS_COLOR[p.status] ?? '#64748b'}22`, color: STATUS_COLOR[p.status] ?? '#64748b' }}>
                                  {p.status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 16px', fontWeight: 700, color: '#22c55e' }}>${p.price}</td>
                              <td style={{ padding: '10px 16px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                                {p.purchasedAt ? new Date(p.purchasedAt).toLocaleDateString('es') : '—'}
                              </td>
                              <td style={{ padding: '10px 16px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                                {new Date(p.expiresAt).toLocaleDateString('es')}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
