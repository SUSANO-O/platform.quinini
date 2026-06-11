'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Users, DollarSign, RefreshCw, Filter } from 'lucide-react';

interface UserMarginRow {
  userId: string;
  email: string;
  displayName: string;
  plan: string;
  planLabel: string;
  status: string;
  monthsCovered: number;
  conversations: number;
  conversationsLimit: number;
  utilizationPct: number;
  totalTokens: number;
  llmCostUsd: number;
  monthlyPriceUsd: number;
  periodPriceUsd: number;
  marginUsd: number;
  marginPct: number;
  risk: 'ok' | 'thin' | 'loss' | 'free' | 'enterprise';
}

interface Response {
  ok: boolean;
  period: { from: string; to: string; months: string[]; monthsCovered: number };
  summary: { totalUsers: number; losing: number; thin: number; ok: number; totalRevenue: number; totalCost: number; totalMargin: number };
  rows: UserMarginRow[];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function nMonthsAgo(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const RISK_STYLE: Record<UserMarginRow['risk'], { bg: string; color: string; label: string }> = {
  loss:       { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', label: 'Pérdida' },
  thin:       { bg: 'rgba(251,191,36,0.12)', color: '#f59e0b', label: 'Margen bajo' },
  ok:         { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', label: 'OK' },
  free:       { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: 'Free' },
  enterprise: { bg: 'rgba(99,102,241,0.12)',  color: '#6366f1', label: 'Enterprise' },
};

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${n.toFixed(0)}`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export default function UserMarginsPage() {
  const [data, setData]       = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [from, setFrom]       = useState(nMonthsAgo(0));
  const [to, setTo]           = useState(currentMonth());
  const [plan, setPlan]       = useState('');
  const [riskFilter, setRiskFilter] = useState<'' | UserMarginRow['risk']>('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams({ from, to });
      if (plan) p.set('plan', plan);
      const r = await fetch(`/api/admin/user-margins?${p}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Error');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visibleRows = riskFilter && data
    ? data.rows.filter((r) => r.risk === riskFilter)
    : data?.rows ?? [];

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <DollarSign size={22} style={{ color: '#f97316' }} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Margen por usuario</h1>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={lbl}>Desde (YYYY-MM)</label>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Hasta (YYYY-MM)</label>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Plan</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Todos</option>
            <option value="solo">Solo</option>
            <option value="team">Team</option>
            <option value="plus">Plus</option>
            <option value="business">Business</option>
            <option value="enterprise">Enterprise</option>
            <option value="free">Free</option>
          </select>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          style={{ padding: '7px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, height: 32 }}>
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Calculando…' : 'Recalcular'}
        </button>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>⚠️ {error}</div>}

      {data && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            <Kpi label="Usuarios" value={String(data.summary.totalUsers)} icon={<Users size={14} />} />
            <Kpi label="En pérdida" value={String(data.summary.losing)} icon={<TrendingDown size={14} />} color={data.summary.losing > 0 ? '#ef4444' : undefined}
              onClick={() => setRiskFilter(riskFilter === 'loss' ? '' : 'loss')} active={riskFilter === 'loss'} />
            <Kpi label="Margen bajo" value={String(data.summary.thin)} icon={<AlertTriangle size={14} />} color={data.summary.thin > 0 ? '#f59e0b' : undefined}
              onClick={() => setRiskFilter(riskFilter === 'thin' ? '' : 'thin')} active={riskFilter === 'thin'} />
            <Kpi label="Saludables" value={String(data.summary.ok)} icon={<TrendingUp size={14} />} color="#22c55e"
              onClick={() => setRiskFilter(riskFilter === 'ok' ? '' : 'ok')} active={riskFilter === 'ok'} />
            <Kpi label="Ingresos" value={fmtUsd(data.summary.totalRevenue)} icon={<DollarSign size={14} />} color="#0284c7" />
            <Kpi label="Costo LLM" value={fmtUsd(data.summary.totalCost)} icon={<DollarSign size={14} />} color="#dc2626" />
            <Kpi label="Margen total" value={fmtUsd(data.summary.totalMargin)} icon={<DollarSign size={14} />}
              color={data.summary.totalMargin > 0 ? '#22c55e' : '#ef4444'} />
          </div>

          {riskFilter && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--muted)', borderRadius: 8, fontSize: 12, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={12} />
              Filtrando por: <strong style={{ color: RISK_STYLE[riskFilter].color }}>{RISK_STYLE[riskFilter].label}</strong>
              <button onClick={() => setRiskFilter('')} style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--foreground)' }}>Limpiar</button>
            </div>
          )}

          {/* Tabla */}
          <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: 'var(--muted)' }}>
                <tr>
                  <Th>Usuario</Th>
                  <Th>Plan</Th>
                  <Th>Riesgo</Th>
                  <Th align="right">Conversaciones</Th>
                  <Th align="right">% Uso</Th>
                  <Th align="right">Tokens</Th>
                  <Th align="right">Costo LLM</Th>
                  <Th align="right">Ingreso</Th>
                  <Th align="right">Margen $</Th>
                  <Th align="right">Margen %</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const rs = RISK_STYLE[row.risk];
                  return (
                    <tr key={row.userId} style={{ borderTop: '1px solid var(--border)' }}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{row.displayName || '(sin nombre)'}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{row.email}</div>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{row.planLabel}</span>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>${row.monthlyPriceUsd}/mes</div>
                      </Td>
                      <Td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: rs.bg, color: rs.color, fontSize: 10, fontWeight: 700 }}>
                          {rs.label}
                        </span>
                      </Td>
                      <Td align="right">{row.conversations.toLocaleString('es')}</Td>
                      <Td align="right">
                        {row.conversationsLimit > 0 ? (
                          <span style={{ color: row.utilizationPct > 80 ? '#ef4444' : row.utilizationPct > 50 ? '#f59e0b' : 'var(--foreground)' }}>
                            {row.utilizationPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                        )}
                      </Td>
                      <Td align="right">{row.totalTokens > 1_000_000 ? `${(row.totalTokens / 1_000_000).toFixed(2)}M` : row.totalTokens > 1000 ? `${(row.totalTokens / 1000).toFixed(1)}K` : row.totalTokens}</Td>
                      <Td align="right" style={{ color: '#dc2626', fontWeight: 600 }}>{fmtUsd(row.llmCostUsd)}</Td>
                      <Td align="right" style={{ color: '#0284c7', fontWeight: 600 }}>{fmtUsd(row.periodPriceUsd)}</Td>
                      <Td align="right" style={{ color: row.marginUsd >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmtUsd(row.marginUsd)}</Td>
                      <Td align="right" style={{ color: row.marginPct >= 30 ? '#22c55e' : row.marginPct >= 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                        {row.periodPriceUsd > 0 ? `${row.marginPct.toFixed(1)}%` : '—'}
                      </Td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: 'var(--muted-foreground)' }}>Sin usuarios en este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 10, lineHeight: 1.5 }}>
            Margen = (precio del plan × meses) − coste LLM realista del mismo período. El coste LLM usa el modelo principal del agente y modo "realista" (max entre tarifa API y blend factura GCP) sin créditos.
          </p>
        </>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 };
const inp: React.CSSProperties = { padding: '6px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--foreground)', height: 32, outline: 'none' };

function Kpi({ label, value, icon, color, onClick, active }: { label: string; value: string; icon?: React.ReactNode; color?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} style={{
      padding: '12px 14px',
      background: 'var(--card)',
      border: active ? `2px solid ${color || '#f97316'}` : '1px solid var(--border)',
      borderRadius: 10,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.1s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, color: color ?? 'var(--muted-foreground)' }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: color ?? 'var(--foreground)' }}>{value}</p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>;
}
function Td({ children, align, style }: { children: React.ReactNode; align?: 'left' | 'right'; style?: React.CSSProperties }) {
  return <td style={{ textAlign: align ?? 'left', padding: '8px 10px', ...style }}>{children}</td>;
}
