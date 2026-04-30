'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, DollarSign, MessageSquare, Users } from 'lucide-react';

type TenantRow = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  totalMessages: number;
  estimatedUsd: number;
  widgets: number;
  agents: number;
  lastActiveMonth: string;
};

type TenantDetail = {
  months: string[];
  rows: Array<{
    month: string;
    widgetId: string;
    agentLabel: string;
    billableMessages: number;
    estimatedUsd: number;
  }>;
  totalsByMonth: Record<string, { messages: number; estimatedUsd: number }>;
};

type AdminFinancePayload = {
  currency: string;
  rateUsdPerMessage: number;
  rates?: {
    defaultRate: number;
    flashRate: number;
    premiumRate: number;
    ragMultiplier: number;
  };
  totals: {
    tenants: number;
    totalMessages: number;
    estimatedUsd: number;
  };
  tenants: TenantRow[];
  selectedUserId?: string;
  tenantDetail?: TenantDetail | null;
  disclaimer?: string;
};

export default function AdminFinancePage() {
  const [data, setData] = useState<AdminFinancePayload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const qs = selectedUserId ? `?userId=${encodeURIComponent(selectedUserId)}` : '';
    setLoading(true);
    fetch(`/api/admin/finance${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error');
        setData(j);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  const selectedTenant = useMemo(
    () => data?.tenants.find((t) => t.userId === selectedUserId) || null,
    [data?.tenants, selectedUserId],
  );

  return (
    <div style={{ padding: '32px', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Finanzas por cliente</h1>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 0, marginBottom: 18 }}>
        Panorama general multi-tenant + detalle individual por cliente.
      </p>

      {loading ? (
        <p style={{ color: 'var(--muted-foreground)' }}>Cargando…</p>
      ) : err ? (
        <p style={{ color: '#ef4444' }}>{err}</p>
      ) : !data ? (
        <p style={{ color: 'var(--muted-foreground)' }}>Sin datos.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Tenants', value: data.totals.tenants, icon: Users, color: '#6366f1' },
              { label: 'Mensajes totales', value: data.totals.totalMessages.toLocaleString('es'), icon: MessageSquare, color: '#00acf8' },
              { label: 'Coste estimado total', value: `${data.totals.estimatedUsd.toFixed(4)} USD`, icon: DollarSign, color: '#22c55e' },
              { label: 'Tarifa estimada', value: `${data.rateUsdPerMessage} USD/msg`, icon: Building2, color: '#f59e0b' },
            ].map((c) => (
              <div key={c.label} className="card-texture" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{c.label}</span>
                  <c.icon size={14} style={{ color: c.color }} />
                </div>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</p>
              </div>
            ))}
          </div>

          {data.disclaimer ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 16 }}>{data.disclaimer}</p>
          ) : null}
          {data.rates ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: -8, marginBottom: 16 }}>
              Costeo dinámico activo → Flash/Mini: {data.rates.flashRate} · Premium/Pro: {data.rates.premiumRate} · RAG x{data.rates.ragMultiplier}
            </p>
          ) : null}

          <div className="card-texture" style={{ border: '1px solid var(--border)', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Vista general de clientes</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--muted)', textAlign: 'left' }}>
                    {['Cliente', 'Plan', 'Estado', 'Widgets', 'Agentes', 'Mensajes', 'Coste USD', 'Último mes activo'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t, i) => (
                    <tr
                      key={t.userId}
                      style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--muted)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => setSelectedUserId(t.userId)}
                    >
                      <td style={{ padding: '9px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.email}</td>
                      <td style={{ padding: '9px 12px' }}>{t.plan}</td>
                      <td style={{ padding: '9px 12px' }}>{t.status}</td>
                      <td style={{ padding: '9px 12px' }}>{t.widgets}</td>
                      <td style={{ padding: '9px 12px' }}>{t.agents}</td>
                      <td style={{ padding: '9px 12px' }}>{t.totalMessages.toLocaleString('es')}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 700 }}>{t.estimatedUsd.toFixed(4)}</td>
                      <td style={{ padding: '9px 12px' }}>{t.lastActiveMonth || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-texture" style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Vista individual de cliente</p>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12 }}
              >
                <option value="">Selecciona cliente…</option>
                {data.tenants.map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {t.email}
                  </option>
                ))}
              </select>
            </div>

            {!selectedUserId ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 12 }}>
                Elige un cliente para ver su panorama detallado por mes/widget/agente.
              </p>
            ) : !data.tenantDetail ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 12 }}>
                Cargando detalle…
              </p>
            ) : (
              <>
                <p style={{ marginTop: 0, fontSize: 12 }}>
                  Cliente: <strong>{selectedTenant?.email || selectedUserId}</strong>
                </p>
                <ul style={{ marginTop: 0, paddingLeft: 18, fontSize: 12 }}>
                  {data.tenantDetail.months.map((m) => (
                    <li key={m}>
                      <strong>{m}</strong>: {data.tenantDetail?.totalsByMonth[m]?.messages ?? 0} mensajes, ~{' '}
                      {(data.tenantDetail?.totalsByMonth[m]?.estimatedUsd ?? 0).toFixed(4)} USD
                    </li>
                  ))}
                </ul>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Mes</th>
                        <th style={{ padding: '10px 12px' }}>Agente / widget</th>
                        <th style={{ padding: '10px 12px' }}>Mensajes</th>
                        <th style={{ padding: '10px 12px' }}>USD (est.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tenantDetail.rows.map((r, i) => (
                        <tr key={`${r.month}-${r.widgetId}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 12px' }}>{r.month}</td>
                          <td style={{ padding: '9px 12px' }}>{r.agentLabel}</td>
                          <td style={{ padding: '9px 12px' }}>{r.billableMessages}</td>
                          <td style={{ padding: '9px 12px' }}>{r.estimatedUsd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
