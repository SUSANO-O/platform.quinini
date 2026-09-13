'use client';

import Link from 'next/link';
import {
  Code2, Lock, MessageSquare, RefreshCw,
} from '@/components/ui/icons';
import { BRAND, STATE } from '@/lib/brand-colors';
import { poolPressure, resolveSystemStatus, type StatusTone } from '@/lib/system-status';

/** Cada papel de color de `system-status`, pintado una sola vez. */
const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  success: STATE.success,
  warning: STATE.warning,
  danger: STATE.error,
  neutral: 'var(--muted-foreground)',
};
import { PlanFeaturesGlassPanel } from '@/components/dashboard/plan-features-glass-panel';
import { DashboardActivityMetrics } from '@/components/dashboard/dashboard-activity-metrics';
import type { DashboardPlanFeature } from '@/lib/dashboard-plan-features';
import type { DateRange } from '@/lib/date-range';

export interface UsagePool {
  used: number;
  limit: number;
  percentUsed: number;
  allowed: boolean;
  baseLimit: number;
  packLimit: number;
}

export interface DashboardUsageData {
  month: string;
  used: number;
  limit: number;
  percentUsed: number;
  plan: string;
  planLabel: string;
  subscriptionStatus: string;
  allowed: boolean;
  platformFreeLimit?: number;
  platformFreeUsed?: number;
  platformFreeRemaining?: number;
  platformCycleKey?: string;
  activePacks: { packId: string; remaining: number; total: number; expiresAt: string }[];
  pools: { agents: UsagePool; api: UsagePool };
  hasApiAccess: boolean;
  canPurchaseApiAddon: boolean;
  isApiOnlyPlan: boolean;
  agentLimit: number;
  agentLimitLabel: string;
  ragStorageMbPerAgent: number;
  apiAddon: { priceUsd: number; conversations: number };
  planPriceLabel?: string;
  planFeatures?: DashboardPlanFeature[];
  planFeaturesEnabled?: number;
}

interface SystemStatus {
  status: 'operational' | 'degraded' | 'down';
  services: { name: string; status: string; latencyMs: number | null }[];
}

// Los dos cupos se distinguen con los dos colores de la marca, no con un azul
// y un naranja sueltos (#2a78d6 y #eb6834) que no salían de ninguna paleta.
const POOL_ACCENT_WIDGET = BRAND.primary;
const POOL_ACCENT_API = BRAND.tertiary;

function Skel({ w, h, r = 6 }: { w: string | number; h: number; r?: number }) {
  return (
    <div className="metric-skeleton" style={{ width: w, height: h, borderRadius: r, flexShrink: 0 }} />
  );
}

function UsagePoolCard({
  title,
  subtitle,
  icon,
  pool,
  accent,
  locked,
  lockedMessage,
  footer,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  pool: UsagePool | null;
  accent: string;
  locked?: boolean;
  lockedMessage?: string;
  footer?: React.ReactNode;
}) {
  const pct = pool ? Math.min(pool.percentUsed, 100) : 0;
  // Antes cualquier cosa por encima del 80% se pintaba con el rojo de error:
  // al 80% de cupo eso es una falsa alarma. Ahora avisa en ámbar y solo
  // enrojece al 95% (ver `poolPressure`).
  const pressure = poolPressure(pool);
  const alerta = pressure !== 'neutral';
  const colorAlerta = pressure === 'danger' ? STATE.error : STATE.warning;
  const fondoAlerta = pressure === 'danger' ? STATE.errorBg : STATE.warningBg;
  const bordeAlerta = pressure === 'danger' ? STATE.errorBorder : STATE.warningBorder;

  return (
    <div
      className="dashboard-pool-card"
      style={{
        borderColor: alerta ? bordeAlerta : 'rgba(var(--brand-primary-rgb),0.08)',
      }}
    >
      <div className="dashboard-pool-card__head">
        <div className="flex items-center gap-2">
          <div className="dashboard-pool-card__icon" style={{ background: `${accent}14`, color: accent }}>
            {icon}
          </div>
          <div>
            <h3 className="dashboard-pool-card__title">{title}</h3>
            <p className="dashboard-pool-card__subtitle">{subtitle}</p>
          </div>
        </div>
        {pool && !locked && pool.limit !== -1 && (
          <span
            className="dashboard-pool-card__badge"
            style={{
              background: alerta ? fondoAlerta : `${accent}0c`,
              color: alerta ? colorAlerta : accent,
            }}
          >
            {pool.percentUsed}% usado
          </span>
        )}
        {locked && (
          <span className="dashboard-pool-card__badge" style={{ background: 'rgba(var(--muted-foreground-rgb,100,116,139),0.12)', color: 'var(--muted-foreground)' }}>
            <Lock size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
            Bloqueado
          </span>
        )}
      </div>

      {locked ? (
        <p className="dashboard-pool-card__locked">{lockedMessage}</p>
      ) : pool ? (
        <div className="metric-value-appear">
          <div className="dashboard-pool-card__numbers">
            <span className="dashboard-pool-card__used">{pool.used.toLocaleString('es')}</span>
            <span className="dashboard-pool-card__limit">
              {pool.limit === -1 ? 'ilimitado' : `/ ${pool.limit.toLocaleString('es')} conv.`}
            </span>
          </div>
          {pool.limit !== -1 && (
            <div className="dashboard-pool-card__bar-track">
              <div
                className="dashboard-pool-card__bar-fill"
                style={{
                  width: `${pct}%`,
                  background: alerta ? colorAlerta : accent,
                }}
              />
            </div>
          )}
          {footer}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Skel w="45%" h={36} />
          <Skel w="100%" h={8} r={999} />
        </div>
      )}
    </div>
  );
}

export function DashboardHomeOverview({
  usage,
  agentCount,
  widgetCount,
  conversationsToday,
  sessionsStartedToday,
  dateRange,
  inboxOpenCount,
  sysStatus,
  loadingSysStatus,
  refreshingStatus,
  onRefreshStatus,
  coreMetricsReady,
  isPremium,
  isTrialActive,
  trialDaysRemaining,
  subscriptionLoading,
}: {
  usage: DashboardUsageData | null;
  agentCount: number | null;
  widgetCount: number | null;
  conversationsToday: number | null;
  sessionsStartedToday: number | null;
  dateRange: DateRange;
  inboxOpenCount: number | null;
  sysStatus: SystemStatus | null;
  loadingSysStatus: boolean;
  refreshingStatus: boolean;
  onRefreshStatus: () => void;
  coreMetricsReady: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysRemaining: number;
  subscriptionLoading: boolean;
}) {
  const agentsPool = usage?.pools.agents ?? null;
  const apiPool = usage?.pools.api ?? null;
  const hasApi = usage?.hasApiAccess ?? false;

  const { label: statusLabel, tone: statusTone } = resolveSystemStatus(sysStatus?.status);
  const statusColor = STATUS_TONE_COLOR[statusTone];

  return (
    <>
      {/* Gráfico principal — 100% ancho */}
      <div className="dashboard-home-section mb-4">
        <DashboardActivityMetrics
          dateRange={dateRange}
          usage={usage}
          inboxOpenCount={inboxOpenCount}
        />
      </div>

      {/* Meta compacta bajo el gráfico */}
      <div className="dashboard-meta-strip mb-5">
        <button
          type="button"
          className="dashboard-meta-chip"
          onClick={onRefreshStatus}
          disabled={refreshingStatus || !coreMetricsReady}
          title="Estado del sistema"
        >
          <i className="dashboard-meta-chip__dot" style={{ background: statusColor }} />
          {statusLabel}
          <RefreshCw
            size={10}
            style={{
              marginLeft: 4,
              opacity: 0.6,
              animation: refreshingStatus ? 'spin 0.7s linear infinite' : undefined,
            }}
          />
        </button>

        {agentCount != null && (
          <span className="dashboard-meta-chip">{agentCount} agentes</span>
        )}
        {widgetCount != null && (
          <span className="dashboard-meta-chip">{widgetCount} widgets</span>
        )}
        {(inboxOpenCount ?? 0) > 0 && (
          <Link href="/dashboard/inbox" className="dashboard-meta-chip dashboard-meta-chip--warn">
            {inboxOpenCount} bandeja
          </Link>
        )}

        {!subscriptionLoading && !isPremium && (
          <Link href="/dashboard/settings" className="dashboard-meta-chip dashboard-meta-chip--accent">
            {isTrialActive ? `Trial ${trialDaysRemaining}d` : 'Actualizar plan'}
          </Link>
        )}
        {!subscriptionLoading && isPremium && usage?.canPurchaseApiAddon && (
          <Link href="/dashboard/settings" className="dashboard-meta-chip dashboard-meta-chip--accent">
            Add-on API
          </Link>
        )}

        <Link href="/dashboard/settings" className="dashboard-meta-chip dashboard-meta-chip--muted">
          Suscripción →
        </Link>
      </div>

      <div className="dashboard-pool-grid mb-5">
        <UsagePoolCard
          title="Pool agentes y widget"
          subtitle="Widget, cron y preview (0,5 conv. por respuesta en preview)"
          icon={<MessageSquare size={14} />}
          pool={agentsPool}
          accent={POOL_ACCENT_WIDGET}
          footer={
            usage && usage.activePacks.length > 0 ? (
              <div className="dashboard-pool-card__packs">
                {usage.activePacks.map((pack) => (
                  <div key={pack.packId} className="dashboard-pool-card__pack-row">
                    <span>Pack {pack.packId}</span>
                    <span>{pack.remaining.toLocaleString('es')} / {pack.total.toLocaleString('es')}</span>
                  </div>
                ))}
              </div>
            ) : usage && typeof usage.platformFreeLimit === 'number' && usage.platformFreeLimit > 0 ? (
              <p className="dashboard-pool-card__footnote">
                Plataforma: {(usage.platformFreeUsed ?? 0).toLocaleString('es')} / {usage.platformFreeLimit.toLocaleString('es')} conv. gratis
              </p>
            ) : null
          }
        />

        <UsagePoolCard
          title="Pool API REST"
          subtitle="POST /agents/:id/chat · incluido desde Team, cupo dedicado"
          icon={<Code2 size={14} />}
          pool={hasApi ? apiPool : null}
          accent={POOL_ACCENT_API}
          locked={!hasApi}
          lockedMessage={
            usage?.canPurchaseApiAddon
              ? `Tu plan ${usage.planLabel} puede activar el add-on API (+$${usage.apiAddon.priceUsd}/mes, ${usage.apiAddon.conversations.toLocaleString('es')} conv/mes). Contacta soporte o revisa Suscripción.`
              : usage?.isApiOnlyPlan
                ? 'Plan API Develop — cupo dedicado a integraciones REST.'
                // API REST incluida desde Team (decisión 2026-08-26) — ya no hay add-on que ofrecer aquí.
                : 'Disponible con plan API Develop, o actualiza a Team o superior.'
          }
          footer={
            hasApi && usage && usage.pools.api.limit !== -1 && usage.pools.api.percentUsed >= 80 ? (
              <Link href="/dashboard/settings" className="dashboard-pool-card__link">
                Cupo API alto — revisar plan →
              </Link>
            ) : hasApi ? (
              <Link href="/dashboard/api" className="dashboard-pool-card__link">
                Abrir explorador API →
              </Link>
            ) : usage?.canPurchaseApiAddon ? (
              <Link href="/dashboard/settings" className="dashboard-pool-card__link">
                Activar add-on API →
              </Link>
            ) : null
          }
        />
      </div>

      <div className="mb-8">
        <PlanFeaturesGlassPanel
          planLabel={usage?.planLabel ?? 'Free'}
          planPriceLabel={usage?.planPriceLabel}
          features={usage?.planFeatures ?? []}
          enabledCount={usage?.planFeaturesEnabled ?? 0}
          loading={!usage}
        />
      </div>
    </>
  );
}
