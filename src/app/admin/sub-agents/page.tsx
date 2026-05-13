'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, Network, RefreshCw } from 'lucide-react';

type SubRow = {
  id: string;
  name: string;
  parentAgentId: string | null;
  parentName: string | null;
  userId: string;
  userEmail: string;
  status: string;
  hubSlug: string | null;
  syncStatus: string;
  updatedAt: string | null;
};

type Supervision = {
  subAgentsTotal: number;
  subAgentsActive: number;
  inventory: SubRow[];
};

type ApiPayload = {
  generatedAt: string;
  supervision?: Supervision;
};

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function AdminSubAgentsPage() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const hubUiBase = (process.env.NEXT_PUBLIC_AGENTFLOWHUB_URL || 'http://127.0.0.1:9010').replace(/\/$/, '');

  const load = () => {
    setLoading(true);
    setErr(null);
    fetch('/api/admin/widget-analytics')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Error al cargar');
        setData(j as ApiPayload);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const supervision = data?.supervision;

  const filtered = useMemo(() => {
    const inv = supervision?.inventory ?? [];
    const needle = q.trim().toLowerCase();
    return inv.filter((s) => {
      if (statusFilter === 'active' && s.status !== 'active') return false;
      if (statusFilter === 'inactive' && s.status === 'active') return false;
      if (!needle) return true;
      const hay = [
        s.name,
        s.userEmail,
        s.parentName ?? '',
        s.id,
        s.parentAgentId ?? '',
        s.hubSlug ?? '',
        s.syncStatus,
        s.status,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [supervision, q, statusFilter]);

  const byParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of supervision?.inventory ?? []) {
      const k = s.parentName ?? '(sin padre)';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [supervision]);

  const csvBlob = useMemo(() => {
    if (!filtered.length) return '';
    const headers = [
      'sub_agent_id',
      'name',
      'parent_agent_id',
      'parent_name',
      'user_email',
      'status',
      'hub_slug',
      'sync_status',
      'updated_at',
    ];
    const lines = [headers.join(',')];
    for (const s of filtered) {
      lines.push(
        [
          csvEscape(s.id),
          csvEscape(s.name),
          csvEscape(s.parentAgentId ?? ''),
          csvEscape(s.parentName ?? ''),
          csvEscape(s.userEmail),
          csvEscape(s.status),
          csvEscape(s.hubSlug ?? ''),
          csvEscape(s.syncStatus),
          csvEscape(s.updatedAt ?? ''),
        ].join(','),
      );
    }
    return lines.join('\r\n');
  }, [filtered]);

  const downloadCsv = () => {
    if (!csvBlob) return;
    const bom = '\ufeff';
    const blob = new Blob([bom + csvBlob], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sub-agentes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const capped =
    supervision &&
    supervision.subAgentsTotal > supervision.inventory.length;

  return (
    <div style={{ padding: '32px', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={24} style={{ color: '#6366f1' }} />
            Sub-agentes
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '8px', maxWidth: '760px' }}>
            Inventario en la base de la landing (Mongo): nombre, agente padre, usuario, estado y sincronización con el hub.
            La traza fina (router, worker, MCP, <code style={{ fontSize: '11px' }}>traceId</code>) sigue en AgentFlowhub → Granja → Supervisión.
          </p>
          <p style={{ fontSize: '12px', margin: 0 }}>
            <Link href="/admin" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
              ← Resumen admin
            </Link>
            {' · '}
            <Link href="/admin/widget-analytics" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
              Widgets / uso
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              fontSize: '13px',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!csvBlob || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'rgba(99,102,241,0.1)',
              color: '#6366f1',
              fontSize: '13px',
              fontWeight: 600,
              cursor: !csvBlob ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} />
            CSV (vista)
          </button>
          {hubUiBase ? (
            <a
              href={`${hubUiBase}/agents/farm`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0d9488',
                textDecoration: 'none',
              }}
            >
              Granja en Hub
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>

      {err ? <p style={{ color: '#ef4444', marginTop: '24px', fontSize: '14px' }}>{err}</p> : null}

      {loading && !data ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '28px', color: 'var(--muted-foreground)' }}>
          <div
            style={{
              width: 18,
              height: 18,
              border: '2px solid var(--border)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }}
          />
          Cargando inventario…
        </div>
      ) : null}

      {data && supervision ? (
        <>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '12px' }}>
            Generado: {new Date(data.generatedAt).toLocaleString('es')}
            {capped ? (
              <span style={{ marginLeft: '8px', color: '#f59e0b' }}>
                (lista limitada a {supervision.inventory.length} filas; total en BD: {supervision.subAgentsTotal})
              </span>
            ) : null}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '14px',
              marginTop: '22px',
            }}
          >
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600, margin: '0 0 6px' }}>Total</p>
              <p style={{ fontSize: '26px', fontWeight: 800, color: '#6366f1', margin: 0 }}>{supervision.subAgentsTotal}</p>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600, margin: '0 0 6px' }}>Activos</p>
              <p style={{ fontSize: '26px', fontWeight: 800, color: '#22c55e', margin: 0 }}>{supervision.subAgentsActive}</p>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', fontWeight: 600, margin: '0 0 6px' }}>Filas en tabla</p>
              <p style={{ fontSize: '26px', fontWeight: 800, color: '#64748b', margin: 0 }}>{filtered.length}</p>
            </div>
          </div>

          {byParent.length > 0 ? (
            <div style={{ marginTop: '28px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Por agente padre (en esta vista)</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {byParent.map(([name, n]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setQ(name === '(sin padre)' ? '' : name)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ color: 'var(--muted-foreground)', marginLeft: '6px' }}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            <input
              type="search"
              placeholder="Buscar por nombre, email, padre, id, sync…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontSize: '13px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              {(
                [
                  ['all', 'Todos'],
                  ['active', 'Activos'],
                  ['inactive', 'No activos'],
                ] as const
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: statusFilter === f ? 'rgba(99,102,241,0.15)' : 'var(--card)',
                    color: statusFilter === f ? '#6366f1' : 'var(--foreground)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {supervision.inventory.length === 0 ? (
            <p style={{ marginTop: '28px', color: 'var(--muted-foreground)', fontSize: '14px' }}>
              No hay sub-agentes con <code style={{ fontSize: '12px' }}>type: sub-agent</code> en la base de la landing.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: '20px', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--card)', textAlign: 'left' }}>
                    {['Sub-agente', 'Padre', 'Usuario', 'Estado', 'Hub slug', 'Sync', 'Actualizado'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '20px', color: 'var(--muted-foreground)' }}>
                        Ninguna fila coincide con los filtros.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s, i) => (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted-foreground)', maxWidth: '200px' }} title={s.parentAgentId ?? ''}>
                          {s.parentName ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.userEmail}>
                          {s.userEmail}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontWeight: 700,
                              fontSize: '10px',
                              background: s.status === 'active' ? '#22c55e22' : '#64748b22',
                              color: s.status === 'active' ? '#22c55e' : '#64748b',
                            }}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '10px',
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={s.hubSlug ?? ''}
                        >
                          {s.hubSlug ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>{s.syncStatus}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                          {s.updatedAt ? new Date(s.updatedAt).toLocaleString('es') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : data && !supervision ? (
        <p style={{ marginTop: '24px', color: 'var(--muted-foreground)' }}>La API no devolvió datos de supervisión.</p>
      ) : null}
    </div>
  );
}
