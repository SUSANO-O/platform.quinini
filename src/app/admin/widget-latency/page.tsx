'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  AlertTriangle,
  RefreshCw,
  Gauge,
  Route,
  Target,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import type { WidgetLatencyInsights, LatencyRecommendation } from '@/lib/widget-latency-insights';

const HL = '#f59e0b';
const PRIORITY_COLOR: Record<LatencyRecommendation['priority'], string> = {
  alta: '#ef4444',
  media: HL,
  baja: '#6b7280',
};

interface LatencyResponse {
  period: { from: string; to: string; timezone: string };
  filters: { agentId: string | null; path: string | null };
  alert: {
    slowP95ThresholdMs: number;
    p95Exceeded: boolean;
    message: string | null;
  };
  summary: {
    requests: number;
    okRequests: number;
    errorRate: number;
    avgTotalMs: number;
    p95TotalMs: number;
  };
  insights: WidgetLatencyInsights;
  byPath: { path: string; requests: number; avgTotalMs: number }[];
  byDay: { date: string; requests: number; avgTotalMs: number }[];
  byPhase: { phase: string; avgMs: number; samples: number }[];
  byAgent: { agentId: string; requests: number; avgTotalMs: number; topPath: string }[];
  slowSamples: Array<{
    traceId?: string;
    totalMs?: number;
    path?: string;
    phases?: Record<string, number>;
    agentId?: string;
    createdAt?: string;
  }>;
}

const PRESETS = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
] as const;

const PATH_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'stream-hub', label: 'stream-hub' },
  { value: 'stream-pipeline', label: 'stream-pipeline' },
  { value: 'stream-parallel', label: 'stream-parallel' },
  { value: 'stream-infer-direct', label: 'stream-infer-direct' },
  { value: 'non-stream-hub', label: 'non-stream-hub' },
  { value: 'non-stream-direct-mcp', label: 'non-stream-direct-mcp' },
  { value: 'non-stream-pipeline', label: 'non-stream-pipeline' },
];

function fmtMs(n: number): string {
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

export default function WidgetLatencyPage() {
  const [data, setData] = useState<LatencyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['key']>('7d');
  const [agentId, setAgentId] = useState('');
  const [pathFilter, setPathFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[1];
    const to = new Date();
    const from = new Date(to.getTime() - p.days * 86_400_000);
    const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (agentId.trim()) qs.set('agentId', agentId.trim());
    if (pathFilter) qs.set('path', pathFilter);

    fetch(`/api/admin/widget-latency?${qs}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d: unknown) => Promise.reject((d as { error?: string })?.error || 'Error'))))
      .then((d) => setData(d as LatencyResponse))
      .catch((e) => setError(typeof e === 'string' ? e : 'Error al cargar.'))
      .finally(() => setLoading(false));
  }, [preset, agentId, pathFilter, refreshTick]);

  const maxDayMs = useMemo(
    () => Math.max(1, ...(data?.byDay.map((d) => d.avgTotalMs) ?? [1])),
    [data],
  );

  const insights = data?.insights;

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', minHeight: '100%' }}>
      <aside
        style={{
          flex: '0 0 240px',
          position: 'sticky',
          top: 20,
          background: 'var(--card)',
          border: `2px solid ${HL}40`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Clock size={16} style={{ color: HL }} />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: HL }}>
            Latencia widget
          </span>
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>
          Periodo
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              style={{
                padding: '6px 8px',
                background: preset === p.key ? HL : 'var(--muted)',
                color: preset === p.key ? '#fff' : 'var(--foreground)',
                border: `1px solid ${preset === p.key ? HL : 'var(--border)'}`,
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>
          Agent ID
        </label>
        <input
          type="text"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="filtrar agente"
          style={{
            width: '100%',
            padding: '7px 9px',
            fontSize: 11,
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--muted)',
            marginBottom: 12,
          }}
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>
          Path
        </label>
        <select
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 9px',
            fontSize: 11,
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--muted)',
            marginBottom: 12,
          }}
        >
          {PATH_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setRefreshTick((t) => t + 1)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            background: HL,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Gauge size={22} style={{ color: HL }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Centro de decisiones — latencia</h1>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13, margin: '0 0 20px', maxWidth: 760 }}>
          Identifica si el cuello es <strong>hub</strong>, <strong>multi-agente</strong> o <strong>MCP</strong> y qué
          acción tomar esta semana.
        </p>

        {loading && <p style={{ color: 'var(--muted-foreground)' }}>Cargando…</p>}
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}

        {data && !loading && insights && (
          <>
            {/* Panel decisión principal */}
            <section
              style={{
                padding: '18px 20px',
                marginBottom: 16,
                borderRadius: 14,
                border: `2px solid ${insights.hasEnoughData ? HL : 'var(--border)'}`,
                background: insights.hasEnoughData
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, var(--card) 60%)'
                  : 'var(--card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Target size={22} style={{ color: HL, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>
                    {insights.hasEnoughData ? 'Cuello de botella detectado' : 'Datos insuficientes'}
                  </h2>
                  <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--foreground)' }}>
                    {insights.decisionSummary}
                  </p>
                  {insights.hasEnoughData && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {insights.dominantPathLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: 'rgba(245,158,11,0.2)',
                            color: '#b45309',
                          }}
                        >
                          Path: {insights.dominantPathLabel} ({insights.dominantPathSharePct}%)
                        </span>
                      )}
                      {insights.dominantPhaseLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: 'var(--muted)',
                            color: 'var(--foreground)',
                          }}
                        >
                          Fase: {insights.dominantPhaseLabel} (~{fmtMs(insights.dominantPhaseAvgMs)})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {data.alert.p95Exceeded && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  marginBottom: 16,
                  borderRadius: 10,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Alerta p95 ≥ 15 s</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {data.alert.message}
                  </p>
                </div>
              </div>
            )}

            {/* Recomendaciones accionables */}
            <section
              style={{
                padding: 16,
                marginBottom: 20,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Lightbulb size={16} style={{ color: HL }} />
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Qué hacer esta semana</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.recommendations.map((rec) => (
                  <div
                    key={rec.title}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--muted)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: PRIORITY_COLOR[rec.priority],
                          color: '#fff',
                        }}
                      >
                        {rec.priority}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{rec.title}</span>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.45 }}>
                      <ChevronRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      {rec.action}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      Impacto estimado: {rec.impact}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Requests', value: String(data.summary.requests) },
                { label: 'Promedio', value: fmtMs(data.summary.avgTotalMs) },
                { label: 'p95', value: fmtMs(data.summary.p95TotalMs), warn: data.alert.p95Exceeded },
                { label: 'Errores', value: `${data.summary.errorRate}%` },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    {card.label}
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      fontSize: 20,
                      fontWeight: 800,
                      color: card.warn ? HL : 'var(--foreground)',
                    }}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Grupos de path (hub vs multi vs mcp) */}
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Route size={14} />
                  <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Tráfico por tipo de path</h2>
                </div>
                {insights.pathGroups.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Sin datos.</p>
                ) : (
                  insights.pathGroups.map((g) => (
                    <div key={g.key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ fontWeight: g.key === insights.dominantPathGroup ? 700 : 500 }}>
                          {g.label}
                        </span>
                        <span>
                          {g.sharePct}% · n={g.requests} · {fmtMs(g.avgTotalMs)}
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--muted)' }}>
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 999,
                            width: `${Math.min(100, g.sharePct)}%`,
                            background: g.key === insights.dominantPathGroup ? HL : `${HL}66`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </section>

              {/* Grupos de fase */}
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Tiempo por grupo de fase</h2>
                {insights.phaseGroups.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Sin datos.</p>
                ) : (
                  insights.phaseGroups.map((g) => (
                    <div key={g.key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span style={{ fontWeight: g.key === insights.dominantPhaseGroup ? 700 : 500 }}>
                          {g.label}
                        </span>
                        <span>
                          {fmtMs(g.avgMs)} · {g.shareOfPhaseTimePct}% del tiempo
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--muted)' }}>
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 999,
                            width: `${Math.min(100, g.shareOfPhaseTimePct)}%`,
                            background: g.key === insights.dominantPhaseGroup ? '#6366f1' : '#6366f166',
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>

            {/* Agentes más lentos */}
            {data.byAgent.length > 0 && (
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  marginBottom: 20,
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Agentes más lentos</h2>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted-foreground)', textAlign: 'left' }}>
                      <th>Agent ID</th>
                      <th>N</th>
                      <th>Prom.</th>
                      <th>Path típico</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byAgent.map((row) => (
                      <tr key={row.agentId}>
                        <td style={{ padding: '6px 0', fontFamily: 'monospace', fontSize: 10 }}>
                          {row.agentId.slice(0, 20)}
                          {row.agentId.length > 20 ? '…' : ''}
                        </td>
                        <td>{row.requests}</td>
                        <td style={{ fontWeight: 700, color: row.avgTotalMs >= 15000 ? HL : undefined }}>
                          {fmtMs(row.avgTotalMs)}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{row.topPath || '—'}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setAgentId(row.agentId)}
                            style={{
                              fontSize: 10,
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--muted)',
                              cursor: 'pointer',
                            }}
                          >
                            Filtrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Paths raw (detalle)</h2>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted-foreground)', textAlign: 'left' }}>
                      <th>Path</th>
                      <th>N</th>
                      <th>Prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPath.map((row) => (
                      <tr key={row.path}>
                        <td style={{ padding: '5px 0', fontFamily: 'monospace' }}>{row.path}</td>
                        <td>{row.requests}</td>
                        <td>{fmtMs(row.avgTotalMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Fases raw (detalle)</h2>
                {data.byPhase.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Sin datos.</p>
                ) : (
                  data.byPhase.map((row) => (
                    <div key={row.phase} style={{ marginBottom: 6, fontSize: 11 }}>
                      <span style={{ fontFamily: 'monospace' }}>{row.phase}</span>
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        {' '}
                        — {fmtMs(row.avgMs)} · n={row.samples}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </div>

            {data.byDay.length > 0 && (
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  marginBottom: 20,
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Promedio por día</h2>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                  {data.byDay.map((d) => (
                    <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                      <div
                        title={`${d.date}: ${fmtMs(d.avgTotalMs)}`}
                        style={{
                          height: `${Math.max(8, (d.avgTotalMs / maxDayMs) * 64)}px`,
                          background: `${HL}99`,
                          borderRadius: '4px 4px 0 0',
                          margin: '0 auto',
                          maxWidth: 40,
                        }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.slowSamples.length > 0 && (
              <section
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Requests lentos (≥ 15 s)</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.slowSamples.map((s) => (
                    <div
                      key={s.traceId}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'var(--muted)',
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}
                    >
                      <div>
                        {fmtMs(s.totalMs ?? 0)} · {s.path} · {s.agentId?.slice(0, 12) || '—'}
                      </div>
                      {s.phases && (
                        <div style={{ marginTop: 4, color: 'var(--muted-foreground)' }}>
                          {Object.entries(s.phases)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([k, v]) => `${k}:${v}ms`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
