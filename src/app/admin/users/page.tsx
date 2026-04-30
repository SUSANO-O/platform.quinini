'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface UserRow {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
  widgets: number;
  agents: number;
  requestsThisMonth: number;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  periodEnd: number;
  allowedModelProviders?: string[];
}

const PROVIDER_OPTIONS = ['google', 'vertex', 'huggingface', 'openai', 'anthropic', 'deepseek'] as const;

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  trialing:   { label: 'Trial',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  active:     { label: 'Activo',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  canceled:   { label: 'Cancelado',color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  past_due:   { label: 'Vencido',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  incomplete: { label: 'Incompleto',color:'#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  no_sub:     { label: 'Sin sub',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
};

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'trialing', label: 'Trial' },
  { value: 'active', label: 'Activos' },
  { value: 'canceled', label: 'Cancelados' },
];

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPolicyUid, setSavingPolicyUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (filter) params.set('status', filter);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }, [page, search, filter]);

  useEffect(() => { load(); }, [load]);

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none',
  };

  const cols = '2fr 1fr 1fr 0.7fr 0.7fr 1fr 1fr 1.6fr';

  async function impersonate(uid: string) {
    if (!confirm('¿Abrir el dashboard como este usuario? Podrás ver su cuenta como si hubieras iniciado sesión con él.')) return;
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: uid }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      alert(data.error || 'No se pudo suplantar.');
      return;
    }
    window.location.href = '/dashboard';
  }

  async function saveProviderPolicy(uid: string, providers: string[]) {
    setSavingPolicyUid(uid);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, allowedModelProviders: providers }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error || 'No se pudo guardar la política de proveedores.');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, allowedModelProviders: providers } : u)));
    } finally {
      setSavingPolicyUid(null);
    }
  }

  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Usuarios</h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '24px' }}>
        {total} usuarios registrados
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <input
            style={{ ...inputStyle, paddingLeft: '30px', width: '220px' }}
            placeholder="Buscar por email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => { setFilter(f.value); setPage(1); }} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              border: `1px solid ${filter === f.value ? '#6366f1' : 'var(--border)'}`,
              background: filter === f.value ? 'rgba(99,102,241,0.1)' : 'var(--background)',
              color: filter === f.value ? '#6366f1' : 'var(--muted-foreground)', cursor: 'pointer',
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} style={{
          padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
          background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}>
          <RefreshCw size={13} style={{ color: 'var(--muted-foreground)' }} />
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'auto' }}>
        <div style={{ minWidth: 820 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '10px', padding: '11px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
            {['Email', 'Estado', 'Plan', 'Widgets', 'Agentes', 'Req/mes', 'Registro', 'Acciones / Política IA'].map((h) => (
              <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
              Cargando...
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
              No hay usuarios con ese filtro.
            </div>
          ) : (
            users.map((u, i) => {
              const st = STATUS_LABELS[u.status] || STATUS_LABELS.no_sub;
              const { trialDaysRemaining } = u;
              return (
                <div key={u.uid} style={{
                  display: 'grid', gridTemplateColumns: cols, gap: '10px',
                  padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  alignItems: 'center',
                }}>
                  {/* Email */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.email}
                    </p>
                    {u.displayName && <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>{u.displayName}</p>}
                    {u.role === 'admin' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: '4px' }}>admin</span>
                    )}
                  </div>
                  {/* Status */}
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: st.color, background: st.bg, padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                    {u.status === 'trialing' && (
                      <p style={{ fontSize: '10px', color: trialDaysRemaining <= 1 ? '#ef4444' : 'var(--muted-foreground)', marginTop: '2px', margin: '2px 0 0' }}>
                        {trialDaysRemaining === 0 ? 'Último día' : `${trialDaysRemaining}d restantes`}
                      </p>
                    )}
                  </div>
                  {/* Plan */}
                  <span style={{ fontSize: '12px', textTransform: 'capitalize' }}>{u.plan}</span>
                  {/* Widgets */}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: u.widgets > 0 ? '#0d9488' : 'var(--muted-foreground)' }}>
                    {u.widgets}
                  </span>
                  {/* Agents */}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: u.agents > 0 ? '#6366f1' : 'var(--muted-foreground)' }}>
                    {u.agents}
                  </span>
                  {/* Requests this month */}
                  <span style={{ fontSize: '12px', fontWeight: u.requestsThisMonth > 0 ? 700 : 400, color: u.requestsThisMonth > 0 ? '#a855f7' : 'var(--muted-foreground)' }}>
                    {u.requestsThisMonth > 999 ? `${(u.requestsThisMonth / 1000).toFixed(1)}k` : u.requestsThisMonth}
                  </span>
                  {/* Date */}
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                    {new Date(u.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {/* Suplantar */}
                  <div>
                    {u.role === 'admin' || u.uid === currentUser?.uid ? (
                      <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                        <button
                          type="button"
                          onClick={() => impersonate(u.uid)}
                          title="Abrir el dashboard como este usuario"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            border: '1px solid rgba(99,102,241,0.45)',
                            background: 'rgba(99,102,241,0.08)',
                            color: '#6366f1',
                            cursor: 'pointer',
                          }}
                        >
                          <UserRound size={12} />
                          Suplantar
                        </button>
                        <select
                          value={(u.allowedModelProviders ?? []).join(',')}
                          onChange={(e) => {
                            const value = e.target.value;
                            const providers = value ? value.split(',').filter(Boolean) : [];
                            void saveProviderPolicy(u.uid, providers);
                          }}
                          disabled={savingPolicyUid === u.uid}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--background)',
                            color: 'var(--foreground)',
                            fontSize: '11px',
                          }}
                        >
                          <option value="">Todos los proveedores</option>
                          {PROVIDER_OPTIONS.map((p) => (
                            <option key={p} value={p}>Solo {p}</option>
                          ))}
                          <option value="google,vertex">Solo google + vertex</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--background)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>Página {page} de {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--background)', cursor: page === pages ? 'not-allowed' : 'pointer', opacity: page === pages ? 0.4 : 1 }}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
