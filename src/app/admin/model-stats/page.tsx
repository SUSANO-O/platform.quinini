'use client';

import { useEffect, useState } from 'react';
import {
  Cpu, RefreshCw, TrendingUp, Clock, AlertTriangle, Layers, Zap,
  DollarSign, ChevronDown, ChevronUp, Filter, X,
} from 'lucide-react';
import type { ModelStatRow, WidgetBreakdownRow } from '@/app/api/admin/model-stats/route';

// ── Provider helpers ──────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#1a73e8', claude: '#d97706', gpt: '#10a37f', openai: '#10a37f',
  llama: '#7c3aed', mistral: '#ef4444', vertex: '#1a73e8',
  huggingface: '#f59e0b', hf: '#f59e0b', deepseek: '#6366f1',
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
  if (id.startsWith('vx/') || id.includes('vertex'))           return 'Vertex';
  if (id.startsWith('hf/') || id.includes('huggingface'))      return 'Hugging Face';
  if (id.includes('gemini'))                                   return 'Google';
  if (id.includes('claude'))                                   return 'Anthropic';
  if (id.includes('gpt') || id.includes('openai'))             return 'OpenAI';
  if (id.includes('llama'))                                    return 'Meta';
  if (id.includes('mistral'))                                  return 'Mistral';
  if (id.includes('deepseek'))                                 return 'DeepSeek';
  return 'Otro';
}

function shortModelName(modelId: string): string {
  return modelId.replace(/^(vx\/|hf\/)/, '');
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d    = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2)  return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `hace ${days} d`;
    if (days < 30) return `hace ${Math.floor(days / 7)} sem`;
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function monthLabel(month: string | null): string {
  if (!month) return '—';
  try {
    const [y, m] = month.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  } catch { return month; }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function currentMonth(): string { return new Date().toISOString().slice(0, 7); }

function nMonthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n + 1);
  return d.toISOString().slice(0, 7);
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 14,
  background: 'var(--card)', overflow: 'hidden',
};

const inputStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 600,
  outline: 'none',
};

// ── Small components ──────────────────────────────────────────────────────────

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
  const c  = n <= 3 ? colors[n - 1] : 'var(--muted-foreground)';
  return (
    <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0, background: bg, color: c, border: `1px solid ${c}30` }}>
      #{n}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px 3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366f1', fontSize: 11, fontWeight: 700 }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}>
        <X size={11} />
      </button>
    </span>
  );
}

// ── Widget breakdown table ────────────────────────────────────────────────────

function WidgetTable({
  widgets,
  onFilterWidget,
}: {
  widgets: WidgetBreakdownRow[];
  onFilterWidget: (id: string, name: string | null) => void;
}) {
  if (!widgets.length) return null;

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Desglose por widget — clic para filtrar
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {widgets.map((w) => (
          <button
            key={w.widgetId}
            onClick={() => onFilterWidget(w.widgetId, w.widgetName)}
            title="Filtrar por este widget"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: '0 14px',
              alignItems: 'center',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'var(--muted)',
              border: '1px solid transparent',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.35)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
          >
            {/* Col 1: name */}
            <span style={{ fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.widgetName ?? w.widgetId.slice(-8)}
              <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.45, marginLeft: 5 }}>({w.widgetId.slice(-6)})</span>
              {w.lastMonth && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 400, marginLeft: 8 }}>{monthLabel(w.lastMonth)}</span>
              )}
            </span>

            {/* Col 2: requests */}
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              <strong style={{ color: 'var(--foreground)' }}>{w.requests.toLocaleString('es')}</strong> req
            </span>

            {/* Col 3: tokens */}
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              {w.hasRealTokens ? (
                <>
                  <strong style={{ color: '#10b981' }}>{fmtTokens(w.realTotalTokens)}</strong>
                  {' '}tkns
                  <span style={{ fontSize: 10, marginLeft: 4, color: '#8b5cf6' }}>
                    ↑{fmtTokens(w.realInputTokens)} ↓{fmtTokens(w.realOutputTokens)}
                  </span>
                </>
              ) : (
                <><strong>{fmtTokens(w.estimatedTokens)}</strong> tkns est.</>
              )}
            </span>

            {/* Col 4: cost */}
            <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              <strong style={{ color: '#ef4444' }}>${w.estimatedUsd.toFixed(3)}</strong>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Active filters display ────────────────────────────────────────────────────

interface Filters {
  from: string;
  to: string;
  widgetId: string;
  agentId: string;
  userId: string;
  model: string;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ModelStatsPage() {
  const [rows, setRows]           = useState<ModelStatRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced]   = useState(false);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    from: nMonthsAgo(6), to: currentMonth(),
    widgetId: '', agentId: '', userId: '', model: '',
  });
  // Draft — what the user is typing before hitting "Filtrar"
  const [draft, setDraft] = useState<Filters>(filters);

  // User search autocomplete
  type UserSuggestion = { id: string; email: string; displayName: string };
  const [userQuery, setUserQuery]       = useState('');
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [userLabel, setUserLabel]       = useState('');  // display label for active filter
  const [userSearching, setUserSearching] = useState(false);

  useEffect(() => {
    if (userQuery.length < 2) { setUserSuggestions([]); return; }
    const t = setTimeout(async () => {
      setUserSearching(true);
      try {
        const r = await fetch(`/api/admin/users/lookup?q=${encodeURIComponent(userQuery)}`);
        const d = await r.json() as { users?: UserSuggestion[] };
        setUserSuggestions(d.users ?? []);
      } catch { setUserSuggestions([]); }
      finally { setUserSearching(false); }
    }, 280);
    return () => clearTimeout(t);
  }, [userQuery]);

  async function load(f: Filters) {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (f.from)     p.set('from',     f.from);
      if (f.to)       p.set('to',       f.to);
      if (f.widgetId) p.set('widgetId', f.widgetId);
      if (f.agentId)  p.set('agentId',  f.agentId);
      if (f.userId)   p.set('userId',   f.userId);
      if (f.model)    p.set('model',    f.model);
      const res  = await fetch(`/api/admin/model-stats?${p.toString()}`);
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

  function applyFilters(newFilters: Filters) {
    setFilters(newFilters);
    setDraft(newFilters);
    setExpandedModel(null);
    void load(newFilters);
  }

  function removeFilter(key: keyof Filters) {
    if (key === 'userId') { setUserLabel(''); setUserQuery(''); setUserSuggestions([]); }
    const next = { ...filters, [key]: '' };
    applyFilters(next);
  }

  function filterByWidget(widgetId: string) {
    const next = { ...filters, widgetId };
    setShowAdvanced(true);
    applyFilters(next);
  }

  function filterByModel(model: string) {
    const next = { ...filters, model };
    applyFilters(next);
  }

  function selectUser(u: UserSuggestion) {
    setUserQuery('');
    setUserSuggestions([]);
    setUserLabel(u.email || u.id);
    applyFilters({ ...filters, userId: u.id });
  }

  function clearUser() {
    setUserLabel('');
    setUserQuery('');
    setUserSuggestions([]);
    applyFilters({ ...filters, userId: '' });
  }

  useEffect(() => { void load(filters); }, []);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalRequests    = rows.reduce((s, r) => s + r.totalRequests, 0);
  const totalAgents      = rows.reduce((s, r) => s + r.primaryCount,  0);
  const activeModels     = rows.filter((r) => r.totalRequests > 0).length;
  const totalEstTokens   = rows.reduce((s, r) => s + r.estimatedTokens, 0);
  const totalUsd         = rows.reduce((s, r) => s + r.estimatedUsd,    0);
  const totalRealTokens  = rows.reduce((s, r) => s + r.realTotalTokens, 0);
  const hasAnyRealTokens = rows.some((r) => r.hasRealTokens);

  // Active filter chips (exclude date — those are always shown)
  const activeChips: Array<{ key: keyof Filters; label: string }> = [];
  if (filters.widgetId) activeChips.push({ key: 'widgetId', label: `Widget: ${filters.widgetId.slice(-8)}` });
  if (filters.agentId)  activeChips.push({ key: 'agentId',  label: `Agente: ${filters.agentId.slice(-8)}` });
  if (filters.userId)   activeChips.push({ key: 'userId',   label: `Usuario: ${userLabel || filters.userId.slice(-8)}` });
  if (filters.model)    activeChips.push({ key: 'model',    label: `Modelo: ${filters.model}` });

  const btnBase: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--background)', color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu size={18} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Ranking de modelos</h1>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Tokens · peticiones · coste estimado · filtros en tiempo real
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              {lastRefresh.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void load(filters)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      <div style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>

        {/* Date row — always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', minWidth: 52 }}>Período</span>
          <input
            type="month" value={draft.from} max={draft.to || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            style={inputStyle}
          />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>→</span>
          <input
            type="month" value={draft.to} min={draft.from || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            style={inputStyle}
          />
          {/* Preset buttons */}
          <button style={btnBase} onClick={() => { const f = nMonthsAgo(1);  const t = currentMonth(); setDraft((d) => ({ ...d, from: f, to: t })); applyFilters({ ...filters, from: f, to: t }); }}>1 mes</button>
          <button style={btnBase} onClick={() => { const f = nMonthsAgo(3);  const t = currentMonth(); setDraft((d) => ({ ...d, from: f, to: t })); applyFilters({ ...filters, from: f, to: t }); }}>3 meses</button>
          <button style={btnBase} onClick={() => { const f = nMonthsAgo(6);  const t = currentMonth(); setDraft((d) => ({ ...d, from: f, to: t })); applyFilters({ ...filters, from: f, to: t }); }}>6 meses</button>
          <button style={btnBase} onClick={() => { const f = new Date().getFullYear() + '-01'; const t = currentMonth(); setDraft((d) => ({ ...d, from: f, to: t })); applyFilters({ ...filters, from: f, to: t }); }}>Este año</button>
          <button style={btnBase} onClick={() => { setDraft((d) => ({ ...d, from: '', to: '' })); applyFilters({ ...filters, from: '', to: '' }); }}>Todo</button>

          {/* Toggle advanced */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ ...btnBase, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, color: showAdvanced ? '#6366f1' : undefined, borderColor: showAdvanced ? 'rgba(99,102,241,0.4)' : undefined }}
          >
            <Filter size={11} />
            Filtros avanzados
            {activeChips.length > 0 && (
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{activeChips.length}</span>
            )}
          </button>
        </div>

        {/* User row — always visible */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-foreground)', minWidth: 52 }}>Usuario</span>

          {filters.userId ? (
            /* Active user chip */
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', fontSize: 12, fontWeight: 600, color: '#6366f1' }}>
              {userLabel || filters.userId.slice(-12)}
              <button onClick={clearUser} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', alignItems: 'center' }}>
                <X size={11} />
              </button>
            </div>
          ) : (
            /* Search input with suggestions */
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  value={userQuery}
                  placeholder="Email o nombre del usuario…"
                  onChange={(e) => setUserQuery(e.target.value)}
                  style={{ ...inputStyle, width: 240 }}
                />
                {userSearching && (
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>…</span>
                )}
              </div>
              {userSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 50,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  minWidth: 280, overflow: 'hidden',
                }}>
                  {userSuggestions.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => selectUser(u)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', border: 'none', background: 'none',
                        cursor: 'pointer', fontSize: 12,
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--foreground)' }}>{u.email}</div>
                      {u.displayName && (
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>{u.displayName}</div>
                      )}
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.6, marginTop: 1 }}>{u.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {([
              { key: 'widgetId' as keyof Filters, label: 'Widget ID', placeholder: '507f1f77…' },
              { key: 'agentId'  as keyof Filters, label: 'Agente ID', placeholder: '507f1f77…' },
              { key: 'userId'   as keyof Filters, label: 'Usuario ID', placeholder: '507f1f77…' },
              { key: 'model'    as keyof Filters, label: 'Modelo',     placeholder: 'gemini-2.5-flash' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    value={draft[key]}
                    placeholder={placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyFilters({ ...filters, ...draft }); }}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  {draft[key] && (
                    <button onClick={() => { setDraft((d) => ({ ...d, [key]: '' })); applyFilters({ ...filters, [key]: '' }); }} style={{ padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                onClick={() => applyFilters({ ...filters, ...draft })}
                style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Aplicar
              </button>
              <button
                onClick={() => {
                  const reset = { from: nMonthsAgo(6), to: currentMonth(), widgetId: '', agentId: '', userId: '', model: '' };
                  setDraft(reset);
                  applyFilters(reset);
                }}
                style={{ ...btnBase, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                Limpiar todo
              </button>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {activeChips.map((c) => (
              <FilterChip key={c.key} label={c.label} onRemove={() => removeFilter(c.key)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Summary chips ── */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Modelos distintos',    value: rows.length,                                                    icon: <Layers size={14} />,    color: '#6366f1' },
            { label: 'Con peticiones',        value: activeModels,                                                   icon: <TrendingUp size={14} />, color: '#10b981' },
            { label: 'Agentes configurados',  value: totalAgents,                                                    icon: <Cpu size={14} />,        color: '#f59e0b' },
            { label: 'Peticiones período',    value: totalRequests.toLocaleString('es'),                             icon: <Clock size={14} />,      color: '#0284c7' },
            { label: hasAnyRealTokens ? 'Tokens reales' : 'Tokens estimados', value: fmtTokens(hasAnyRealTokens ? totalRealTokens : totalEstTokens), icon: <Zap size={14} />, color: '#8b5cf6' },
            { label: 'Coste estimado (USD)', value: `$${totalUsd.toFixed(2)}`,                                       icon: <DollarSign size={14} />, color: '#ef4444' },
          ].map((s) => (
            <div key={s.label} style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <span style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
          <AlertTriangle size={15} />{error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)', fontSize: 14 }}>
          No hay datos para el filtro actual.
        </div>
      )}

      {/* ── Ranking list ── */}
      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row, i) => {
            const pct        = totalRequests > 0 ? (row.totalRequests / totalRequests) * 100 : 0;
            const color      = providerColor(row.modelId);
            const hasActivity = row.totalRequests > 0;
            const isExpanded  = expandedModel === row.modelId;

            return (
              <div key={row.modelId} style={{ ...card, padding: '16px 18px' }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <RankBadge n={i + 1} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Model name + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <button
                        onClick={() => filterByModel(row.modelId)}
                        title="Filtrar por este modelo"
                        style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', wordBreak: 'break-all' }}
                      >
                        {shortModelName(row.modelId)}
                      </button>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${color}18`, color, border: `1px solid ${color}30`, letterSpacing: '0.04em' }}>
                        {providerLabel(row.modelId)}
                      </span>
                      {row.fallbackCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
                          ↩ respaldo en {row.fallbackCount} agente{row.fallbackCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {row.hasRealTokens && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(16,185,129,0.10)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                          tokens reales
                        </span>
                      )}
                      {!hasActivity && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'rgba(107,114,128,0.08)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
                          sin actividad
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 4, borderRadius: 4, background: 'var(--muted)', marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color, transition: 'width 0.4s ease' }} />
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px 20px' }}>
                      <StatChip label="Peticiones"     value={row.totalRequests.toLocaleString('es')} color={hasActivity ? color : undefined} />
                      <StatChip
                        label={row.hasRealTokens ? 'Tokens reales' : 'Tokens est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realTotalTokens : row.estimatedTokens)}
                        color={hasActivity ? '#8b5cf6' : undefined}
                      />
                      <StatChip
                        label={row.hasRealTokens ? '↑ Input real'   : '↑ Input est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realInputTokens  : row.estimatedInputTokens)}
                      />
                      <StatChip
                        label={row.hasRealTokens ? '↓ Output real'  : '↓ Output est.'}
                        value={fmtTokens(row.hasRealTokens ? row.realOutputTokens : row.estimatedOutputTokens)}
                      />
                      <StatChip label="Coste est. (USD)"     value={`$${row.estimatedUsd.toFixed(2)}`} color={hasActivity ? '#ef4444' : undefined} />
                      <StatChip label="Clase modelo"         value={row.modelClass} />
                      <StatChip label="Agentes principales"  value={row.primaryCount} />
                      <StatChip
                        label="Último uso (widget)"
                        value={hasActivity ? relativeDate(row.lastUsedAt) : '—'}
                        color={hasActivity ? '#10b981' : undefined}
                      />
                      <StatChip label="Mes activo" value={monthLabel(row.lastUsedMonth)} />
                    </div>

                    {/* Last widget detail */}
                    {hasActivity && row.lastWidgetName && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                        <Clock size={11} />
                        Último widget activo:
                        <button
                          onClick={() => filterByWidget(row.lastWidgetId!)}
                          style={{ fontWeight: 600, color: 'var(--foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}
                        >
                          {row.lastWidgetName}
                        </button>
                        {row.lastWidgetId && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.5 }}>({row.lastWidgetId.slice(-6)})</span>
                        )}
                      </div>
                    )}

                    {/* Last agent config update */}
                    {row.lastAgentUpdatedAt && (
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted-foreground)' }}>
                        Config. actualizada: {relativeDate(row.lastAgentUpdatedAt)}
                      </div>
                    )}

                    {/* Expand / collapse widget breakdown */}
                    {row.widgets.length > 0 && (
                      <button
                        onClick={() => setExpandedModel(isExpanded ? null : row.modelId)}
                        style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', cursor: 'pointer' }}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {row.widgets.length} widget{row.widgets.length !== 1 ? 's' : ''}
                      </button>
                    )}

                    {isExpanded && (
                      <WidgetTable widgets={row.widgets} onFilterWidget={(id) => filterByWidget(id)} />
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
