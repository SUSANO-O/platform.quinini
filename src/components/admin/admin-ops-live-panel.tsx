'use client';

import { useCallback, useEffect, useState } from 'react';
import { ADMIN_OPS_LIVE_API } from '@/lib/admin-ops-live';
import type { LiveAgentPoint } from '@/lib/admin-ops-live';
import { AdminOpsMatrixConsole } from '@/components/admin/admin-ops-matrix-console';
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

function TimelineChart({ points, meanSec }: { points: LivePayload['timeline']; meanSec: number }) {
  if (points.length < 2) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: C.mute }}>
        Aún no hay suficientes minutos en la ventana para dibujar la curva.
      </p>
    );
  }

  const w = 720;
  const h = 200;
  const pad = { t: 16, r: 12, b: 28, l: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxSec = Math.max(5, meanSec * 1.4, ...points.map((p) => p.avgSec));
  const xAt = (i: number) => pad.l + (i / (points.length - 1)) * innerW;
  const yAt = (sec: number) => pad.t + innerH * (1 - sec / maxSec);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.avgSec).toFixed(1)}`).join(' ');
  const area = `${d} L ${xAt(points.length - 1).toFixed(1)},${pad.t + innerH} L ${xAt(0).toFixed(1)},${pad.t + innerH} Z`;
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const yTicks = [0, 0.5, 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={200}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Latencia media del conjunto, en segundos, por minuto"
    >
      {yTicks.map((t) => {
        const sec = maxSec * (1 - t);
        const y = pad.t + innerH * t;
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={C.line} />
            <text x={pad.l - 8} y={y + 4} textAnchor="end" fill={C.mute} fontSize={11}>
              {sec.toFixed(0)}s
            </text>
          </g>
        );
      })}
      <line
        x1={pad.l}
        x2={w - pad.r}
        y1={yAt(meanSec)}
        y2={yAt(meanSec)}
        stroke={C.now}
        strokeDasharray="4 4"
      />
      <path d={area} fill={C.now} opacity={0.12} />
      <path d={d} fill="none" stroke={C.now} strokeWidth={2} />
      {labelIdx.map((i) => (
        <text key={points[i].minute} x={xAt(i)} y={h - 8} textAnchor="middle" fill={C.mute} fontSize={11}>
          {points[i].minute}
        </text>
      ))}
    </svg>
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
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [load]);

  const agents = data?.view.agents ?? [];
  const errorHigh = (data?.summary.errorRate ?? 0) >= 10;

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
            En vivo
          </span>
          <div role="group" aria-label="Ventana" style={{ display: 'flex', gap: 4 }}>
            {([15, 60, 1440] as const).map((m) => (
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
                {m === 1440 ? '24 h' : `${m} min`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" style={{ color: C.err, fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}
      {loading && !data && <p style={{ color: C.mute }}>Cargando…</p>}

      <AdminOpsMatrixConsole />

      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[
            { k: 'Con tráfico', v: `${data.summary.agentsWithTraffic} de ${data.summary.agentTotal}` },
            { k: 'Turnos', v: String(data.summary.requests) },
            {
              k: 'Error',
              v: `${data.summary.errorRate}%`.replace('.', ','),
              warn: errorHigh,
            },
            { k: 'Latencia media', v: fmtSec(data.summary.avgSec) },
          ].map((s) => (
            <div key={s.k} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.mute }}>{s.k}</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 4,
                  fontVariantNumeric: 'tabular-nums',
                  color: s.warn ? C.err : C.text,
                }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
      )}

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

      {data && data.timeline.length > 0 && (
        <section style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Latencia del conjunto</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.mute }}>
            Segundos por minuto · media {fmtSec(data.summary.avgSec)}
          </p>
          <TimelineChart points={data.timeline} meanSec={data.summary.avgSec} />
        </section>
      )}
    </div>
  );
}
