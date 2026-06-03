'use client';

import { useEffect, useMemo, useState } from 'react';
import { Zap, Activity, Clock, AlertCircle, Wrench, RefreshCw } from 'lucide-react';

const HL = '#f97316'; // naranja brand — color destacado

interface MetricsResponse {
  period: { from: string; to: string; timezone: string };
  filters: { userId: string | null; agentId: string | null; path: string | null };
  summary: {
    requests: number; okRequests: number; errorRate: number;
    inputTokens: number; outputTokens: number; totalTokens: number;
    avgLatencyMs: number; p95LatencyMs: number;
    costUsd: number; totalToolRounds: number;
  };
  byDay:    { date: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number; avgLatencyMs: number }[];
  byPath:   { path: string; requests: number; inputTokens: number; outputTokens: number; avgLatencyMs: number }[];
  byAgent:  { agentId: string; requests: number; inputTokens: number; outputTokens: number; totalTokens: number }[];
  topTools: { toolId: string; count: number }[];
}

const PRESETS: Array<{ key: string; label: string; days: number }> = [
  { key: '24h',  label: '24h',  days: 1 },
  { key: '7d',   label: '7 días',  days: 7 },
  { key: '30d',  label: '30 días', days: 30 },
  { key: '90d',  label: '90 días', days: 90 },
];

function fmtNum(n: number): string { return n.toLocaleString('es'); }
function fmtTokens(n: number): string { return n < 1000 ? String(n) : n < 1_000_000 ? (n / 1000).toFixed(1) + 'K' : (n / 1_000_000).toFixed(2) + 'M'; }
function fmtUsd(n: number): string { return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`; }
function fmtMs(n: number): string { return n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`; }

export default function InferenceMetricsPage() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('30d');
  const [userId, setUserId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [pathFilter, setPathFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError('');
    const p = PRESETS.find(x => x.key === preset) ?? PRESETS[2];
    const to = new Date();
    const from = new Date(to.getTime() - p.days * 86_400_000);
    const qs = new URLSearchParams({
      from: from.toISOString(),
      to:   to.toISOString(),
    });
    if (userId.trim())     qs.set('userId', userId.trim());
    if (agentId.trim())    qs.set('agentId', agentId.trim());
    if (pathFilter)        qs.set('path', pathFilter);

    fetch(`/api/admin/inference-metrics?${qs}`)
      .then(r => r.ok ? r.json() : r.json().then((d: unknown) => Promise.reject((d as { error?: string })?.error || 'Error')))
      .then(d => setData(d as MetricsResponse))
      .catch(e => setError(typeof e === 'string' ? e : 'Error al cargar.'))
      .finally(() => setLoading(false));
  }, [preset, userId, agentId, pathFilter, refreshTick]);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', minHeight: '100%' }}>
      {/* ── SIDEBAR DE FILTROS ───────────────────────────────────────── */}
      <aside style={{
        flex: '0 0 240px',
        position: 'sticky',
        top: 20,
        background: 'var(--card)',
        border: `2px solid ${HL}40`,
        borderRadius: 12,
        padding: 16,
        boxShadow: `0 4px 14px ${HL}1a`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Zap size={16} style={{ color: HL }} />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: HL }}>Filtros</span>
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Periodo</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 16 }}>
          {PRESETS.map(p => (
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

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>User ID</label>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="filtra por usuario"
          style={{ width: '100%', padding: '7px 9px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--muted)', color: 'var(--foreground)', marginBottom: 12, outline: 'none' }}
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Agent ID</label>
        <input
          type="text"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="filtra por agente"
          style={{ width: '100%', padding: '7px 9px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--muted)', color: 'var(--foreground)', marginBottom: 12, outline: 'none' }}
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Path</label>
        <select
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          style={{ width: '100%', padding: '7px 9px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--muted)', color: 'var(--foreground)', marginBottom: 16, cursor: 'pointer' }}
        >
          <option value="">Todos los paths</option>
          <option value="direct-mcp">direct-mcp</option>
          <option value="stream-proxy">stream-proxy</option>
          <option value="non-stream-proxy">non-stream-proxy</option>
          <option value="inference-direct">inference-direct</option>
        </select>

        <button
          type="button"
          onClick={() => setRefreshTick(t => t + 1)}
          disabled={loading}
          style={{
            width: '100%',
            padding: '8px',
            background: HL,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>

        {data && (
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 14, lineHeight: 1.4 }}>
            {new Date(data.period.from).toLocaleDateString('es')} → {new Date(data.period.to).toLocaleDateString('es')}
            <br /><span style={{ opacity: 0.6 }}>TZ: {data.period.timezone}</span>
          </p>
        )}
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Zap size={22} style={{ color: HL }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Tokens & Costo LLM</h1>
        </div>

        {error && (
          <div style={{ padding: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <Kpi label="Requests" value={fmtNum(data.summary.requests)} icon={<Activity size={14} style={{ color: HL }} />} accent={HL} />
              <Kpi label="Tokens In" value={fmtTokens(data.summary.inputTokens)} />
              <Kpi label="Tokens Out" value={fmtTokens(data.summary.outputTokens)} />
              <Kpi label="Costo" value={fmtUsd(data.summary.costUsd)} accent={HL} />
              <Kpi label="Latencia (avg)" value={fmtMs(data.summary.avgLatencyMs)} icon={<Clock size={14} />} />
              <Kpi label="Latencia (p95)" value={fmtMs(data.summary.p95LatencyMs)} icon={<Clock size={14} />} />
              <Kpi label="Tool rounds" value={fmtNum(data.summary.totalToolRounds)} icon={<Wrench size={14} />} />
              <Kpi label="% errores" value={`${data.summary.errorRate}%`} icon={<AlertCircle size={14} />} accent={data.summary.errorRate > 5 ? '#ef4444' : undefined} />
            </div>

            {/* Timeline */}
            <Section title="Requests por día (TZ Colombia)">
              <BarChart data={data.byDay} xKey="date" yKey="requests" color={HL} />
            </Section>

            <Section title="Tokens In/Out por día">
              <StackedBarChart data={data.byDay} keys={['inputTokens', 'outputTokens']} colors={[HL, '#6366f1']} />
            </Section>

            {/* Path breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <Section title="Por path (camino del chat)">
                <SimpleTable
                  headers={['Path', 'Requests', 'In', 'Out', 'Latencia']}
                  rows={data.byPath.map(p => [p.path, fmtNum(p.requests), fmtTokens(p.inputTokens), fmtTokens(p.outputTokens), fmtMs(p.avgLatencyMs)])}
                />
              </Section>

              <Section title="Top 15 tools invocadas">
                <SimpleTable
                  headers={['Tool ID', 'Invocaciones']}
                  rows={data.topTools.map(t => [t.toolId, fmtNum(t.count)])}
                />
              </Section>
            </div>

            <Section title="Top 10 agentes por uso">
              <SimpleTable
                headers={['Agent ID', 'Requests', 'Tokens In', 'Tokens Out', 'Total']}
                rows={data.byAgent.map(a => [a.agentId, fmtNum(a.requests), fmtTokens(a.inputTokens), fmtTokens(a.outputTokens), fmtTokens(a.totalTokens)])}
              />
            </Section>
          </>
        )}

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </main>
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'var(--card)',
      border: accent ? `2px solid ${accent}40` : '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: accent ? `0 2px 8px ${accent}1a` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: accent ?? 'var(--foreground)' }}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, padding: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
      {children}
    </div>
  );
}

// Bar chart SVG — un solo color
function BarChart({ data, xKey, yKey, color }: { data: Array<Record<string, unknown>>; xKey: string; yKey: string; color: string }) {
  const values = data.map(d => Number(d[yKey] || 0));
  const max = Math.max(...values, 1);
  const W = 800, H = 180, P = 20;
  const bw = (W - 2 * P) / Math.max(data.length, 1);
  if (data.length === 0) return <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Sin datos en este rango.</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
      {data.map((d, i) => {
        const v = Number(d[yKey] || 0);
        const h = max > 0 ? (v / max) * (H - 2 * P) : 0;
        const x = P + i * bw + 2;
        const y = H - P - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={Math.max(bw - 4, 1)} height={h} fill={color} rx={2}>
              <title>{`${d[xKey]}: ${v}`}</title>
            </rect>
            {i % Math.max(Math.ceil(data.length / 8), 1) === 0 && (
              <text x={x + bw / 2 - 2} y={H - 4} fontSize={9} fill="var(--muted-foreground)" textAnchor="middle">
                {String(d[xKey]).slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StackedBarChart({ data, keys, colors }: { data: Array<Record<string, unknown>>; keys: string[]; colors: string[] }) {
  if (data.length === 0) return <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Sin datos.</p>;
  const sums = data.map(d => keys.reduce((s, k) => s + Number(d[k] || 0), 0));
  const max = Math.max(...sums, 1);
  const W = 800, H = 180, P = 20;
  const bw = (W - 2 * P) / Math.max(data.length, 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10, marginBottom: 6 }}>
        {keys.map((k, i) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: colors[i], borderRadius: 2 }} />
            {k}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
        {data.map((d, i) => {
          let acc = 0;
          const x = P + i * bw + 2;
          return (
            <g key={i}>
              {keys.map((k, ki) => {
                const v = Number(d[k] || 0);
                const h = (v / max) * (H - 2 * P);
                const y = H - P - acc - h;
                acc += h;
                return <rect key={k} x={x} y={y} width={Math.max(bw - 4, 1)} height={h} fill={colors[ki]} />;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Sin datos.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontFamily: ci === 0 ? 'monospace' : 'inherit', color: 'var(--foreground)' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
