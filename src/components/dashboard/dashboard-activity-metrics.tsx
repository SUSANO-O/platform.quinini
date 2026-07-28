'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConversationWaveChart } from '@/components/dashboard/conversation-wave-chart';
import type { DateRange } from '@/lib/date-range';
import type { DashboardUsageData } from '@/components/dashboard/dashboard-home-overview';

interface ActivityData {
  hasApiAccess: boolean;
  totalAgents: number;
  totalApi: number;
  sessionsStarted: number;
  inboxOpen: number;
  peakHour: number | null;
  peakHourLabel: string | null;
  peakHourCount: number;
  monthlyBillableTurns: number;
  byDay: { date: string; agents: number; api: number; sessions: number }[];
}

function rangeLabel(preset: DateRange['preset']): string {
  if (preset === 'today') return 'Hoy';
  if (preset === 'last_7d') return 'Últimos 7 días';
  if (preset === 'last_30d') return 'Últimos 30 días';
  return 'Periodo seleccionado';
}

function formatQuotaLimit(limit: number): string {
  return limit === -1 ? 'ilimitado' : limit.toLocaleString('es');
}

export function DashboardActivityMetrics({
  dateRange,
  usage,
  inboxOpenCount,
}: {
  dateRange: DateRange;
  usage: DashboardUsageData | null;
  inboxOpenCount: number | null;
}) {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const showApi = activity?.hasApiAccess ?? usage?.hasApiAccess ?? false;

  useEffect(() => {
    const qs = `from=${encodeURIComponent(dateRange.from.toISOString())}&to=${encodeURIComponent(dateRange.to.toISOString())}`;
    setLoading(true);
    setFetchError(false);
    fetch(`/api/dashboard/activity?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error('activity fetch failed');
        return r.json();
      })
      .then((d) => setActivity(d))
      .catch(() => {
        setActivity(null);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [dateRange]);

  const peakDay = activity?.byDay.reduce(
    (best, d) => (d.agents + d.api > best.v ? { date: d.date, v: d.agents + d.api } : best),
    { date: '', v: 0 },
  );

  const monthlyUsed = usage && usage.used > 0
    ? usage.used
    : (activity?.monthlyBillableTurns ?? usage?.used ?? 0);
  const monthlyLimit = usage?.limit;

  return (
    <section className="conv-wave-panel conv-wave-panel--full">
      <div className="conv-wave-panel__head">
        <div>
          <div className="conv-wave-panel__title-row">
            <h3 className="conv-wave-panel__title">Conversaciones</h3>
            {(usage || activity) && (
              <span
                className="conv-wave-panel__quota"
                title="Uso del mes actual (widget / agentes)"
              >
                {monthlyUsed.toLocaleString('es')}
                {monthlyLimit != null && (
                  <> / {formatQuotaLimit(monthlyLimit)}</>
                )}
              </span>
            )}
          </div>
          <p className="conv-wave-panel__range">{rangeLabel(dateRange.preset)}</p>
        </div>
        {!loading && activity && (
          <div className="conv-wave-panel__totals">
            <span><strong>{activity.totalAgents.toLocaleString('es')}</strong> widget</span>
            {showApi && (
              <span><strong>{activity.totalApi.toLocaleString('es')}</strong> API</span>
            )}
            <span><strong>{activity.sessionsStarted.toLocaleString('es')}</strong> chats</span>
            {activity.peakHour != null && activity.peakHourLabel && (
              <span className="conv-wave-panel__peak" title={`${activity.peakHourCount} mensajes en esa hora (Colombia)`}>
                hora pico {activity.peakHourLabel}
              </span>
            )}
            {peakDay && peakDay.v > 0 && (
              <span className="conv-wave-panel__peak conv-wave-panel__peak--muted">
                día pico {peakDay.date.slice(8)}/{peakDay.date.slice(5, 7)}
              </span>
            )}
          </div>
        )}
      </div>

      <ConversationWaveChart
        data={activity?.byDay ?? []}
        showApi={showApi}
        loading={loading}
        error={fetchError}
      />

      {!loading && (inboxOpenCount ?? activity?.inboxOpen ?? 0) > 0 && (
        <Link href="/dashboard/inbox" className="conv-wave-panel__inbox">
          {(inboxOpenCount ?? activity?.inboxOpen ?? 0)} en bandeja sin atender →
        </Link>
      )}
    </section>
  );
}
