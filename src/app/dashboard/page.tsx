'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { QuotaTopupBanner } from '@/components/dashboard/quota-topup-banner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Cpu, Boxes, Bot, Sparkles, Activity, MessageSquare,
  TrendingUp, Crown, Clock, Zap, ArrowUpRight, Shield,
} from 'lucide-react';

const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';
const C = '#00f8e5';

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

const STATUS_COLOR: Record<string, string> = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  down: '#ef4444',
};

const QUICK = [
  { href: '/dashboard/widget-builder', icon: Cpu,   title: 'Widget Builder', desc: 'Diseña y configura widgets de chat',    color: R },
  { href: '/dashboard/widgets',        icon: Boxes,  title: 'Mis Widgets',    desc: 'Gestiona tus widgets desplegados',      color: B },
  { href: '/dashboard/agents',         icon: Bot,    title: 'Mis Agentes',    desc: 'Crea y entrena tus agentes de IA',      color: O },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { isPremium, isTrialActive, trialDaysRemaining, subscription, loading } = useSubscription();

  const [usage,       setUsage]       = useState<UsageData | null>(null);
  const [agentCount,  setAgentCount]  = useState<number | null>(null);
  const [widgetCount, setWidgetCount] = useState<number | null>(null);
  const [sysStatus,   setSysStatus]   = useState<SystemStatus | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') router.replace('/admin');
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/usage').then(r => r.ok ? r.json() : null).then(d => d && setUsage(d)).catch(() => {});
    fetch('/api/agents').then(r => r.ok ? r.json() : null).then(d => d && setAgentCount(d.agents?.length ?? 0)).catch(() => {});
    fetch('/api/widgets').then(r => r.ok ? r.json() : null).then(d => d && setWidgetCount(d.widgets?.length ?? 0)).catch(() => {});
    fetch('/api/status').then(r => r.ok ? r.json() : null).then(d => d && setSysStatus(d)).catch(() => {});
  }, [user]);

  const planLabel = subscription?.plan
    ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)
    : 'Free';

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-100px' }} />

      <div className="relative px-4 py-4 max-w-5xl mx-auto">

        {/* Quota top-up banner (compra de packs) */}
        {usage && (
          <QuotaTopupBanner
            percentUsed={usage.percentUsed}
            used={usage.used}
            limit={usage.limit}
            plan={usage.plan}
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

          {/* Plan badge */}
          {!loading && (
            isPremium ? (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}
              >
                <Crown size={12} />
                {planLabel} — activo
              </div>
            ) : isTrialActive ? (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: `${O}12`, color: O, border: `1px solid ${O}30` }}
              >
                <Clock size={12} />
                Trial — {trialDaysRemaining} días restantes
              </div>
            ) : (
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold no-underline"
                style={{ background: `${R}12`, color: R, border: `1px solid ${R}30` }}
              >
                <Zap size={12} />
                Actualizar plan →
              </Link>
            )
          )}
        </div>

        {/* ── METRICS ROW ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">

          {/* Conversaciones */}
          <MetricCard
            accent={`linear-gradient(90deg,${R},${O})`}
            icon={<MessageSquare size={13} style={{ color: R }} />}
            label="Conversaciones"
            value={usage ? usage.used.toLocaleString('es') : '—'}
            sub={
              usage
                ? usage.limit === -1
                  ? 'ilimitadas'
                  : `/ ${usage.limit.toLocaleString('es')} este mes`
                : 'cargando…'
            }
            bar={usage && usage.limit !== -1 ? {
              pct: Math.min(usage.percentUsed, 100),
              color: usage.percentUsed >= 80
                ? `linear-gradient(90deg,${O},#ef4444)`
                : `linear-gradient(90deg,${R},${O})`,
            } : undefined}
          />

          {/* Plan */}
          <MetricCard
            accent={`linear-gradient(90deg,${O},${B})`}
            icon={<Crown size={13} style={{ color: O }} />}
            label="Plan actual"
            value={loading ? '—' : planLabel}
            sub={
              isPremium
                ? 'activo'
                : isTrialActive
                ? `${trialDaysRemaining} días de prueba`
                : 'sin suscripción'
            }
          />

          {/* Agentes */}
          <MetricCard
            accent={`linear-gradient(90deg,${B},${C})`}
            icon={<Bot size={13} style={{ color: B }} />}
            label="Agentes"
            value={agentCount === null ? '—' : String(agentCount)}
            sub={
              agentCount === null
                ? 'cargando…'
                : agentCount === 0
                ? 'crea tu primer agente'
                : agentCount === 1
                ? 'agente activo'
                : 'agentes creados'
            }
          />

          {/* Widgets */}
          <MetricCard
            accent={`linear-gradient(90deg,${C},${R})`}
            icon={<Boxes size={13} style={{ color: C }} />}
            label="Widgets"
            value={widgetCount === null ? '—' : String(widgetCount)}
            sub={
              widgetCount === null
                ? 'cargando…'
                : widgetCount === 0
                ? 'crea tu primer widget'
                : widgetCount === 1
                ? 'widget desplegado'
                : 'widgets desplegados'
            }
          />
        </div>

        {/* ── MAIN 2-COL ───────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-5 mb-8">

          {/* ── LEFT: analytics + acceso rápido ────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Usage analytics */}
            {usage && (
              <div
                className="rounded-2xl border card-texture overflow-hidden"
                style={{ borderColor: usage.percentUsed >= 80 ? 'rgba(239,68,68,0.35)' : 'var(--border)' }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg,${R},${O},${B})` }} />
                <div className="p-5 md:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={15} style={{ color: R }} />
                      <h3 className="text-[13px] font-bold m-0">Uso del mes actual</h3>
                    </div>
                    <span
                      className="text-xs font-extrabold px-2.5 py-1 rounded-full"
                      style={{
                        background: usage.percentUsed >= 80 ? 'rgba(239,68,68,0.12)' : `${R}10`,
                        color: usage.percentUsed >= 80 ? '#ef4444' : R,
                        border: `1px solid ${usage.percentUsed >= 80 ? 'rgba(239,68,68,0.3)' : R + '30'}`,
                      }}
                    >
                      {usage.percentUsed}% usado
                    </span>
                  </div>

                  <div className="flex items-end justify-between mb-3">
                    <span className="text-4xl font-extrabold" style={{ letterSpacing: '-0.04em' }}>
                      {usage.used.toLocaleString('es')}
                    </span>
                    <span className="text-sm pb-1" style={{ color: 'var(--muted-foreground)' }}>
                      {usage.limit === -1 ? 'ilimitado' : `/ ${usage.limit.toLocaleString('es')} conv.`}
                    </span>
                  </div>

                  <div
                    className="h-3 rounded-full overflow-hidden mb-3"
                    style={{ background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.06)' }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(usage.percentUsed, 100)}%`,
                        background: usage.percentUsed >= 80
                          ? `linear-gradient(90deg,${O},#ef4444)`
                          : `linear-gradient(90deg,${R},${O},${B})`,
                        borderRadius: 999,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <span className="capitalize font-semibold">Plan {usage.plan}</span>
                    {usage.percentUsed >= 80 ? (
                      <Link href="/dashboard/settings" className="font-bold" style={{ color: R }}>
                        Ver suscripción →
                      </Link>
                    ) : (
                      <span>Dentro del rango mensual</span>
                    )}
                  </div>

                  {/* Cuota de plataforma */}
                  {typeof usage.platformFreeLimit === 'number' && usage.platformFreeLimit > 0 && (
                    <div
                      className="mt-4 rounded-xl px-4 py-3"
                      style={{ background: `${B}08`, border: `1px solid ${B}20` }}
                    >
                      <div className="flex items-center justify-between mb-1.5 text-xs">
                        <span className="font-bold" style={{ color: B }}>Cuota de plataforma (regalo)</span>
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          {(usage.platformFreeUsed ?? 0).toLocaleString('es')} / {usage.platformFreeLimit.toLocaleString('es')}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.08)' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(((usage.platformFreeUsed ?? 0) / usage.platformFreeLimit) * 100, 100)}%`,
                          background: `linear-gradient(90deg,${B},${C})`,
                          borderRadius: 999,
                        }} />
                      </div>
                      <p className="text-[11px] m-0 mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                        Restan {(usage.platformFreeRemaining ?? 0).toLocaleString('es')} peticiones gratuitas
                      </p>
                    </div>
                  )}

                  {/* Packs activos */}
                  {usage.activePacks.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {usage.activePacks.map((pack) => (
                        <div
                          key={pack.packId}
                          className="rounded-xl px-4 py-3"
                          style={{ background: `${O}08`, border: `1px solid ${O}20` }}
                        >
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
            )}

            {/* Acceso rápido */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3 m-0" style={{ color: 'var(--muted-foreground)' }}>
                Acceso rápido
              </p>
              <div className="grid sm:grid-cols-3 gap-3" data-tour="dashboard-quick-actions">
                {QUICK.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="card-hover rounded-2xl overflow-hidden no-underline text-inherit group border"
                    style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                  >
                    <div style={{ height: 3, background: `linear-gradient(90deg,${item.color},${item.color}66)` }} />
                    <div className="p-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                        style={{ background: `${item.color}12`, border: `1px solid ${item.color}28` }}
                      >
                        <item.icon size={18} style={{ color: item.color }} strokeWidth={1.75} />
                      </div>
                      <p className="font-bold text-[13px] mb-1 m-0">{item.title}</p>
                      <p className="text-[11px] leading-relaxed m-0" style={{ color: 'var(--muted-foreground)' }}>
                        {item.desc}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT: estado + upgrade CTA ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* System status */}
            <div className="rounded-2xl border card-texture overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${C},${B})` }} />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={14} style={{ color: C }} />
                  <h3 className="text-[13px] font-bold m-0">Estado del sistema</h3>
                </div>

                {sysStatus ? (
                  <>
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4"
                      style={{
                        background: sysStatus.status === 'operational' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${sysStatus.status === 'operational' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: STATUS_COLOR[sysStatus.status] ?? '#94a3b8',
                          boxShadow: sysStatus.status === 'operational' ? '0 0 6px rgba(34,197,94,0.6)' : undefined,
                        }}
                      />
                      <span
                        className="text-xs font-bold"
                        style={{ color: sysStatus.status === 'operational' ? '#16a34a' : '#dc2626' }}
                      >
                        {sysStatus.status === 'operational'
                          ? 'Todo operativo'
                          : sysStatus.status === 'degraded'
                          ? 'Rendimiento reducido'
                          : 'Servicio caído'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {sysStatus.services.map((svc) => (
                        <div key={svc.name} className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{svc.name}</span>
                          <div className="flex items-center gap-1.5">
                            {svc.latencyMs != null && (
                              <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                                {svc.latencyMs}ms
                              </span>
                            )}
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: STATUS_COLOR[svc.status] ?? '#94a3b8' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: C, animation: 'pulse 1.5s ease-in-out infinite' }}
                    />
                    Verificando servicios…
                  </div>
                )}
              </div>
            </div>

            {/* Upgrade CTA (solo si no premium) */}
            {!loading && !isPremium && (
              <div
                className="rounded-2xl overflow-hidden border"
                style={{ borderColor: `${R}30`, background: `linear-gradient(145deg,${R}08,${O}06)` }}
              >
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
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white no-underline"
                    style={{ background: `linear-gradient(135deg,${R},${O})`, boxShadow: `0 4px 14px ${R}30` }}
                  >
                    Ver planes <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            )}

            {/* Acceso rápido a Ajustes */}
            <Link
              href="/dashboard/settings"
              className="rounded-2xl border p-4 no-underline text-inherit card-hover flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <div>
                <p className="text-[13px] font-bold m-0">Suscripción y cuenta</p>
                <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  Facturas · plan · método de pago
                </p>
              </div>
              <ArrowUpRight size={15} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            </Link>

            {/* Seguridad */}
            <div
              className="rounded-2xl border card-texture p-4"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Shield size={13} style={{ color: B }} />
                <span className="text-[12px] font-bold">Seguridad</span>
              </div>
              <p className="text-[11px] leading-relaxed m-0" style={{ color: 'var(--muted-foreground)' }}>
                Auth por API key, rate limiting por plan y datos aislados por tenant.
              </p>
            </div>
          </div>
        </div>
      </div>
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
  return (
    <div className="rounded-2xl border card-texture overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div style={{ height: 2, background: accent }} />
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
            {label}
          </span>
        </div>
        <p className="text-2xl font-extrabold m-0" style={{ letterSpacing: '-0.03em' }}>
          {value}
        </p>
        <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          {sub}
        </p>
        {bar && (
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div style={{ height: '100%', width: `${bar.pct}%`, background: bar.color, borderRadius: 999, transition: 'width 0.4s ease' }} />
          </div>
        )}
      </div>
    </div>
  );
}
