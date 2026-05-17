'use client';

import { useEffect, useState } from 'react';
import { Cpu, RefreshCw, TrendingUp, Clock, AlertTriangle, Layers, Zap, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import type { ModelStatRow, WidgetBreakdownRow } from '@/app/api/admin/model-stats/route';

const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#1a73e8',
  claude: '#d97706',
  gpt: '#10a37f',
  openai: '#10a37f',
  llama: '#7c3aed',
  mistral: '#ef4444',
  vertex: '#1a73e8',
  huggingface: '#f59e0b',
  hf: '#f59e0b',
  deepseek: '#6366f1',
};

function providerColor(modelId: string): string {
  const id = modelId.toLowerCase();
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (id.includes(key)) return color;
  }
  return '#6b7280';
}

function providerLabel(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith('vx/') || id.includes('vertex')) return 'Vertex';
  if (id.startsWith('hf/') || id.includes('huggingface')) return 'Hugging Face';
  if (id.includes('gemini')) return 'Google';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('gpt') || id.includes('openai')) return 'OpenAI';
  if (id.includes('llama')) return 'Meta';
  if (id.includes('mistral')) return 'Mistral';
  if (id.includes('deepseek')) return 'DeepSeek';
  return 'Otro';
}

function shortModelName(modelId: string): string {
  return modelId.replace(/^(vx\/|hf\/)/, '');
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `hace ${days} d`;
    if (days < 30) return `hace ${Math.floor(days / 7)} sem`;
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function monthLabel(month: string | null): string {
  if (!month) return '—';
  try {
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  } catch {
    return month;
  }
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  background: 'var(--card)',
  overflow: 'hidden',
};

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: color ?? 'var(--foreground)' }}>{value}</span>
    </div>
  );
}

function RankBadge({ n }: { n: number }) {
  const colors = ['#f59e0b', '#94a3b8', '#b45309'];
  const bg = n <= 3 ? `${colors[n - 1]}18` : 'var(--muted)';
  const c = n <= 3 ? colors[n - 1] : 'var(--muted-foreground)';
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0,
      background: bg, color: c, border: `1px solid ${c}30`,
    }}>
      #{n}
    </div>
  );
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  return d.toISOString().slice(0, 7);
}

function WidgetTable({ widgets, fmtTokens, modelClass }: {
  widgets: WidgetBreakdownRow[];
  fmtTokens: (n: number) => string;
  modelClass: string;
}) {
  if (!widgets.length) return null;
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Desglose por widget
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {widgets.map((w) => (
          <div key={w.widgetId} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto auto auto',
            gap: '0 16px',
            alignItems: 'center',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--muted)',
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.widgetName ?? w.widgetId.slice(-8)}
              <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.45, marginLeft: 5 }}>({w.widgetId.slice(-6)})</span>
            </span>
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              <strong style={{ color: 'var(--foreground)' }}>{w.requests.toLocaleString('es')}</strong> req
            </span>
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              {w.hasRealTokens ? (
                <><strong style={{ color: '#10b981' }}>{fmtTokens(w.realTotalTokens)}</strong> tkns reales</>
              ) : (
                <><strong>{fmtTokens(w.estimatedTokens)}</strong> tkns est.</>
              )}
            </span>
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              <strong style={{ color: '#ef4444' }}>${w.estimatedUsd.toFixed(3)}</strong> est.
            </span>
            {w.hasRealTokens && (
              <span style={{ fontSize: 10, color: '#8b5cf6', whiteSpace: 'nowrap' }}>
                ↑{fmtTokens(w.realInputTokens)} / ↓{fmtTokens(w.realOutputTokens)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelStatsPage() {
  const [rows, setRows] = useState<ModelStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [fromMonth, setFromMonth] = useState(sixMonthsAgo());
  const [toMonth, setToMonth] = useState(currentMonth());
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  async function load(from?: string, to?: string) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/admin/model-stats?${params.toString()}`);
      const data = await res.json() as { ok?: boolean; models?: ModelStatRow[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Error al cargar');
      setRows(data.models ?? []);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(fromMonth, toMonth); }, []);

  const totalRequests = rows.reduce((s, r) => s + r.totalRequests, 0);
  const totalAgents = rows.reduce((s, r) => s + r.primaryCount, 0);
  const activeModels = rows.filter((r) => r.totalRequests > 0).length;
  const totalTokens = rows.reduce((s, r) => s + r.estimatedTokens, 0);
  const totalUsd = rows.reduce((s, r) => s + r.estimatedUsd, 0);
  const totalRealTokens = rows.reduce((s, r) => s + r.realTotalTokens, 0);
  const hasAnyRealTokens = rows.some((r) => r.hasRealTokens);

  function fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={18} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Ranking de modelos</h1>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Uso real por widgets · agentes configurados · última actividad
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {lastRefresh.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void load(fromMonth, toMonth)}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--foreground)', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>Período:</span>
        <input
          type="month"
          value={fromMonth}
          max={toMonth}
          onChange={(e) => setFromMonth(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 600,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>→</span>
        <input
          type="month"
          value={toMonth}
          min={fromMonth}
          onChange={(e) => setToMonth(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 600,
          }}
        />
        <button
          onClick={() => void load(fromMonth, toMonth)}
          disabled={loading}
          style={{
            padding: '5px 14px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          Filtrar
        </button>
        <button
          onClick={() => {
            const f = sixMonthsAgo();
            const t = currentMonth();
            setFromMonth(f);
            setToMonth(t);
            void load(f, t);
          }}
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Últimos 6 meses
        </button>
        <button
          onClick={() => {
            const f = new Date().getFullYear() + '-01';
            const t = currentMonth();
            setFromMonth(f);
            setToMonth(t);
            void load(f, t);
          }}
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Este año
        </button>
        <button
          onClick={() => {
            setFromMonth('');
            setToMonth('');
            void load('', '');
          }}
          style={{
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Todo el tiempo
        </button>
      </div>

      {/* Summary chips */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Modelos distintos', value: rows.length, icon: <Layers size={14} />, color: '#6366f1' },
            { label: 'Con peticiones reales', value: activeModels, icon: <TrendingUp size={14} />, color: '#10b981' },
            { label: 'Agentes totales', value: totalAgents, icon: <Cpu size={14} />, color: '#f59e0b' },
            { label: 'Peticiones acumuladas', value: totalRequests.toLocaleString('es'), icon: <Clock size={14} />, color: '#0284c7' },
            { label: hasAnyRealTokens ? 'Tokens reales' : 'Tokens estimados', value: fmtTokens(hasAnyRealTokens ? totalRealTokens : totalTokens), icon: <Zap size={14} />, color: '#8b5cf6' },
            { label: 'Coste estimado (USD)', value: `$${totalUsd.toFixed(2)}`, icon: <DollarSign size={14} />, color: '#ef4444' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: s.color }}>{s.icon}</div>
              <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Ranking list */}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)', fontSize: 14 }}>
          No hay agentes creados todavía.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, i) => {
            const pct = totalRequests > 0 ? (row.totalRequests / totalRequests) * 100 : 0;
            const color = providerColor(row.modelId);
            const hasActivity = row.totalRequests > 0;
            const isExpanded = expandedModel === row.modelId;

            return (
              <div key={row.modelId} style={{ ...card, padding: '16px 18px' }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <RankBadge n={i + 1} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', wordBreak: 'break-all' }}>
                        {shortModelName(row.modelId)}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: `${color}18`, color, border: `1px solid ${color}30`,
                        letterSpacing: '0.04em',
                      }}>
                        {providerLabel(row.modelId)}
                      </span>
                      {row.fallbackCount > 0 && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                          background: 'rgba(99,102,241,0.08)', color: '#6366f1',
                          border: '1px solid rgba(99,102,241,0.2)',
                        }}>
                          ↩ respaldo en {row.fallbackCount} agente{row.fallbackCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {row.hasRealTokens && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                          background: 'rgba(16,185,129,0.10)', color: '#10b981',
                          border: '1px solid rgba(16,185,129,0.25)',
                        }}>
                          tokens reales
                        </span>
                      )}
                      {!hasActivity && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                          background: 'rgba(107,114,128,0.08)', color: 'var(--muted-foreground)',
                          border: '1px solid var(--border)',
                        }}>
                          sin actividad aún
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 4, background: 'var(--muted)', marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color, transition: 'width 0.4s ease' }} />
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px 20px' }}>
                      <StatChip label="Peticiones" value={row.totalRequests.toLocaleString('es')} color={hasActivity ? color : undefined} />
                      <StatChip
                        label={row.hasRealTokens ? 'Tokens reales' : 'Tokens est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realTotalTokens : row.estimatedTokens)}
                        color={hasActivity ? '#8b5cf6' : undefined}
                      />
                      <StatChip
                        label={row.hasRealTokens ? '↑ Input real' : '↑ Input est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realInputTokens : row.estimatedInputTokens)}
                      />
                      <StatChip
                        label={row.hasRealTokens ? '↓ Output real' : '↓ Output est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realOutputTokens : row.estimatedOutputTokens)}
                      />
                      <StatChip label="Coste est. (USD)" value={`$${row.estimatedUsd.toFixed(2)}`} color={hasActivity ? '#ef4444' : undefined} />
                      <StatChip label="Clase modelo" value={row.modelClass} />
                      <StatChip label="Agentes principales" value={row.primaryCount} />
                      <StatChip
                        label="Último uso (widget)"
                        value={hasActivity ? relativeDate(row.lastUsedAt) : '—'}
                        color={hasActivity ? '#10b981' : undefined}
                      />
                      <StatChip
                        label="Mes activo"
                        value={monthLabel(row.lastUsedMonth)}
                      />
                    </div>

                    {/* Last widget detail */}
                    {hasActivity && row.lastWidgetName && (
                      <div style={{
                        marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11, color: 'var(--muted-foreground)',
                      }}>
                        <Clock size={11} />
                        Último widget activo:
                        <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
                          {row.lastWidgetName}
                        </span>
                        {row.lastWidgetId && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>
                            ({row.lastWidgetId.slice(-6)})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Last agent config update */}
                    {row.lastAgentUpdatedAt && (
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted-foreground)' }}>
                        Config. actualizada: {relativeDate(row.lastAgentUpdatedAt)}
                      </div>
                    )}

                    {/* Expand widget breakdown */}
                    {row.widgets.length > 0 && (
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : row.modelId)}
                        style={{
                          marginTop: 12, display: 'flex', alignItems: 'center', gap: 5,
                          background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          color: 'var(--muted-foreground)', cursor: 'pointer',
                        }}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {row.widgets.length} widget{row.widgets.length !== 1 ? 's' : ''}
                      </button>
                    )}

                    {isExpanded && (
                      <WidgetTable
                        widgets={row.widgets}
                        fmtTokens={fmtTokens}
                        modelClass={row.modelClass}
                      />
                    )}
                  </div>

                  {/* Big % on right */}
                  {totalRequests > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: hasActivity ? color : 'var(--muted-foreground)' }}>
                        {pct < 0.1 ? '<0.1' : pct.toFixed(1)}%
                      </span>
                      <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>del total</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
