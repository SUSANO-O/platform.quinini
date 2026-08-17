'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ADMIN_OPS_LIVE_API,
  LIVE_WINDOW_MINS,
  fillLiveTimeline,
  liveWindowLabel,
  trafficWho,
  type LiveAgentPoint,
} from '@/lib/admin-ops-live';
import { AdminOpsMatrixConsole } from '@/components/admin/admin-ops-matrix-console';
import { OpsComboChart, OpsSparkBars, OpsSparkLine } from '@/components/admin/admin-ops-live-charts';
import { BRAND, STATE } from '@/lib/brand-colors';

type LivePayload = {
  generatedAt: string;
  windowMin: number;
  summary: {
    agentTotal: number;
    agentsWithTraffic: number;
    requests: number;
    okRequests: number;
    errorRate: number;
    avgSec: number;
  };
  view: { agents: LiveAgentPoint[]; othersCollapsed: number };
  timeline: { minute: string; requests: number; avgSec: number }[];
};

const C = {
  bg: BRAND.neutral,
  card: '#22262a',
  line: 'rgba(255,255,255,0.08)',
  text: '#e8eaed',
  mute: '#9aa3ad',
  success: BRAND.primaryLight,
  speed: STATE.success,
  load: BRAND.tertiary,
  now: '#c9843a',
  err: STATE.error,
} as const;

function fmtSec(n: number): string {
  return `${n.toFixed(1).replace('.', ',')} s`;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Meter({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr 36px', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: C.mute }}>{label}</span>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        style={{ height: 8, borderRadius: 4, background: C.line, overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct}
      </span>
    </div>
  );
}

function AgentRow({ agent }: { agent: LiveAgentPoint }) {
  const prev = agent.prevAvgSec;
  const delta = prev == null ? null : agent.avgSec - prev;
  return (
    <article
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        padding: 16,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        background: C.card,
      }}
    >
      <div style={{ flex: '1 1 180px', minWidth: 160 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>
          {agent.label}
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: C.mute }}>
          {agent.requests} {agent.requests === 1 ? 'turno' : 'turnos'}
        </p>
      </div>
      <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Meter label="Éxito" value={agent.success} color={C.success} />
        <Meter label="Rapidez" value={agent.speed} color={C.speed} />
        <Meter label="Carga" value={agent.load} color={C.load} />
      </div>
      <div style={{ flex: '0 1 160px' }}>
        <div style={{ fontSize: 12, color: C.mute, marginBottom: 4 }}>Latencia media</div>
        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: C.now }}>
          {fmtSec(agent.avgSec)}
        </div>
        <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>
          p95 {fmtSec(agent.p95Sec)}
          {prev == null || delta == null
            ? ' · sin dato anterior'
            : ` · antes ${fmtSec(prev)} (${delta > 0 ? '+' : ''}${fmtSec(delta)})`}
        </div>
      </div>
    </article>
  );
}

function TrafficCard({
  names,
  more,
  active,
  idle,
}: {
  names: string[];
  more: number;
  active: number;
  idle: number;
}) {
  const shown = names.slice(0, 4);
  const hidden = names.length - shown.length + more;
  const headline =
    active === 0
      ? 'Nadie en esta ventana'
      : names.length === 1 && more === 0
        ? names[0]
        : null;
  return (
    <article
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: '12px 14px',
        minWidth: 0,
        gridColumn: 'span 1',
      }}
    >
      <div style={{ fontSize: 11, color: C.mute }}>Con tráfico</div>
      {headline ? (
        <div
          title={headline}
          style={{
            fontSize: 18,
            fontWeight: 800,
            marginTop: 4,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {headline}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {shown.map((name) => (
            <span
              key={name}
              title={name}
              style={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(40,164,184,0.16)',
                color: C.success,
              }}
            >
              {name}
            </span>
          ))}
          {hidden > 0 ? (
            <span style={{ fontSize: 12, color: C.mute, alignSelf: 'center' }}>+{hidden}</span>
          ) : null}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.mute, marginTop: 6 }}>
        {active === 1 ? '1 activo' : `${active} activos`}
        {' · '}
        {idle} en silencio
      </div>
    </article>
  );
}

function KpiCard({
  label,
  value,
  warn,
  spark,
}: {
  label: string;
  value: string;
  warn?: boolean;
  spark?: ReactNode;
}) {
  return (
    <article style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.mute }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
          color: warn ? C.err : C.text,
        }}
      >
        {value}
      </div>
      {spark ? <div style={{ marginTop: 8 }}>{spark}</div> : null}
    </article>
  );
}

export function AdminOpsLivePanel() {
  const [windowMin, setWindowMin] = useState(15);
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`${ADMIN_OPS_LIVE_API}?window=${windowMin}`, { signal, credentials: 'include' });
    if (res.status === 401 || res.status === 403) throw new Error('Solo admin.');
    if (!res.ok) throw new Error('No se pudo cargar el live.');
    return res.json() as Promise<LivePayload>;
  }, [windowMin]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const tick = async () => {
      if (document.hidden) return;
      try {
        const payload = await load(ctrl.signal);
        if (cancelled) return;
        setData(payload);
        setError('');
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    // HTTPS + cookie (TLS). No WebSocket: Vercel no sostiene sockets y un admin no justifica el fan-out.
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [load]);

  const agents = data?.view.agents ?? [];
  const errorHigh = (data?.summary.errorRate ?? 0) >= 10;
  const who = useMemo(
    () => trafficWho(agents, data?.view.othersCollapsed ?? 0),
    [agents, data?.view.othersCollapsed],
  );
  const timeline = useMemo(
    () =>
      data
        ? fillLiveTimeline(data.timeline, data.windowMin, data.generatedAt)
        : [],
    [data],
  );
  const idle = Math.max(0, (data?.summary.agentTotal ?? 0) - who.active);

  return (
    <div style={{ background: C.bg, color: C.text, borderRadius: 8, padding: 20, minHeight: 'calc(100vh - 48px)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Observabilidad live</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.mute }}>
            Todos los agentes con tráfico · éxito, rapidez y latencia
            {data ? ` · ${fmtClock(data.generatedAt)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: C.speed,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: C.speed,
              }}
            />
            En vivo · HTTPS 5 s
          </span>
          <div role="group" aria-label="Ventana" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {LIVE_WINDOW_MINS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setWindowMin(m); setLoading(true); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${windowMin === m ? C.success : C.line}`,
                  background: windowMin === m ? 'rgba(40,164,184,0.16)' : 'transparent',
                  color: windowMin === m ? C.success : C.mute,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {liveWindowLabel(m)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" style={{ color: C.err, fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      {loading && !data && <p style={{ color: C.mute }}>Cargando…</p>}

      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <TrafficCard names={who.names} more={who.more} active={who.active} idle={idle} />
          <KpiCard
            label="Turnos"
            value={String(data.summary.requests)}
            spark={<OpsSparkBars points={timeline} />}
          />
          <KpiCard
            label="Error"
            value={`${data.summary.errorRate}%`.replace('.', ',')}
            warn={errorHigh}
          />
          <KpiCard
            label="Latencia media"
            value={fmtSec(data.summary.avgSec)}
            spark={<OpsSparkLine points={timeline} />}
          />
        </div>
      )}

      {data && (
        <section style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Turnos y latencia</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.mute }}>
            Barras (eje derecho) = mensajes por minuto. Línea (eje izquierdo) = segundos solo
            cuando hubo tráfico: un hueco no es 0 s. Media {fmtSec(data.summary.avgSec)}.
          </p>
          <OpsComboChart points={timeline} meanSec={data.summary.avgSec} />
        </section>
      )}

      <AdminOpsMatrixConsole />

      {data && agents.length === 0 && (
        <p role="status" style={{ color: C.mute, fontSize: 13 }}>
          No hay turnos en esta ventana. El panel se actualiza cada 5 s.
        </p>
      )}

      {agents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {agents.map((agent) => (
            <AgentRow key={agent.agentId} agent={agent} />
          ))}
          {data && data.view.othersCollapsed > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: C.mute }}>
              +{data.view.othersCollapsed} agentes agrupados en Otros
            </p>
          )}
        </div>
      )}
    </div>
  );
}
