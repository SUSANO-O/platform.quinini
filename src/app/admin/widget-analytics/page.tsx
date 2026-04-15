'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Boxes,
  MessageSquare,
  Sparkles,
  Download,
  RefreshCw,
  Calendar,
} from 'lucide-react';

type Row = {
  widgetId: string;
  widgetName: string;
  userId: string;
  userEmail: string;
  agentId: string;
  hasToken: boolean;
  requestsThisMonth: number;
  requestsLastMonth: number;
  requestsAllTime: number;
  updatedAt: string | null;
};

type Payload = {
  generatedAt: string;
  window: { month: string; prevMonth: string };
  summary: {
    widgetsTotal: number;
    requestsThisMonth: number;
    requestsLastMonthWindow: number;
    platformChatsThisMonth: number;
  };
  note: string;
  topByMonth: Array<{
    widgetId: string;
    requestsThisMonth: number;
    requestsLastMonth: number;
    totalWindow: number;
  }>;
  rows: Row[];
};

function csvEscape(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function AdminWidgetAnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setErr(null);
    fetch('/api/admin/widget-analytics')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Error al cargar');
        setData(j as Payload);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const csvBlob = useMemo(() => {
    if (!data) return '';
    const headers = [
      'widget_id',
      'widget_name',
      'user_email',
      'agent_id',
      'wt_token',
      'requests_this_month',
      'requests_last_month',
      'requests_all_time',
      'updated_at',
    ];
    const lines = [headers.join(',')];
    for (const r of data.rows) {
      lines.push(
        [
          csvEscape(r.widgetId),
          csvEscape(r.widgetName),
          csvEscape(r.userEmail),
          csvEscape(r.agentId),
          csvEscape(r.hasToken ? 'yes' : 'no'),
          r.requestsThisMonth,
          r.requestsLastMonth,
          r.requestsAllTime,
          csvEscape(r.updatedAt ?? ''),
        ].join(','),
      );
    }
    return lines.join('\r\n');
  }, [data]);

  const downloadCsv = () => {
    if (!csvBlob || !data) return;
    const bom = '\ufeff';
    const blob = new Blob([bom + csvBlob], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `widget-analytics-${data.window.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cards = data
    ? [
        {
          label: 'Widgets en la plataforma',
          value: data.summary.widgetsTotal,
          icon: Boxes,
          color: '#6366f1',
        },
        {
          label: `Chats contabilizados (${data.window.month})`,
          value: data.summary.requestsThisMonth,
          icon: MessageSquare,
          color: '#0d9488',
        },
        {
          label: `Mes anterior (${data.window.prevMonth})`,
          value: data.summary.requestsLastMonthWindow,
          icon: Calendar,
          color: '#64748b',
        },
        {
          label: 'Mensajes gratis agente plataforma (mes)',
          value: data.summary.platformChatsThisMonth,
          icon: Sparkles,
          color: '#f59e0b',
        },
      ]
    : [];

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={24} style={{ color: '#6366f1' }} />
            Observabilidad de widgets
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '8px', maxWidth: '720px' }}>
            Uso y monitoreo desde la landing (Mongo): solicitudes de chat registradas por widget y uso de cupo de agentes de plataforma.
            Alineado en espíritu con el panel de analytics del hub, usando los datos que viven en esta app.
          </p>
          {data?.note ? (
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', opacity: 0.9, maxWidth: '800px' }}>{data.note}</p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
            disabled={!data || loading}
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
              cursor: !data ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={14} />
            CSV
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>

      {err ? (
        <p style={{ color: '#ef4444', marginTop: '24px', fontSize: '14px' }}>{err}</p>
      ) : null}

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
          Cargando métricas…
        </div>
      ) : null}

      {data ? (
        <>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '12px' }}>
            Generado: {new Date(data.generatedAt).toLocaleString()}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginTop: '24px',
            }}
          >
            {cards.map((c) => (
              <div
                key={c.label}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>{c.label}</span>
                  <c.icon size={16} style={{ color: c.color }} />
                </div>
                <p style={{ fontSize: '28px', fontWeight: 800, color: c.color }}>{c.value}</p>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '15px', fontWeight: 700, marginTop: '36px', marginBottom: '12px' }}>
            Top widgets (este mes)
          </h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--card)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>Widget ID</th>
                  <th style={{ padding: '10px 12px' }}>Este mes</th>
                  <th style={{ padding: '10px 12px' }}>Mes ant.</th>
                </tr>
              </thead>
              <tbody>
                {data.topByMonth.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '16px', color: 'var(--muted-foreground)' }}>
                      Sin actividad registrada en la ventana.
                    </td>
                  </tr>
                ) : (
                  data.topByMonth.map((t) => (
                    <tr key={t.widgetId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: '11px' }}>{t.widgetId}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{t.requestsThisMonth}</td>
                      <td style={{ padding: '10px 12px' }}>{t.requestsLastMonth}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: '15px', fontWeight: 700, marginTop: '32px', marginBottom: '12px' }}>
            Detalle por widget (hasta 400 más recientes)
          </h2>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--card)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 10px' }}>Nombre</th>
                  <th style={{ padding: '10px 10px' }}>Usuario</th>
                  <th style={{ padding: '10px 10px' }}>Agente</th>
                  <th style={{ padding: '10px 10px' }}>wt_*</th>
                  <th style={{ padding: '10px 10px' }}>Mes</th>
                  <th style={{ padding: '10px 10px' }}>Ant.</th>
                  <th style={{ padding: '10px 10px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.widgetId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600 }}>{r.widgetName}</td>
                    <td style={{ padding: '10px 10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.userEmail}
                    </td>
                    <td
                      style={{
                        padding: '10px 10px',
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '11px',
                        maxWidth: '160px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={r.agentId}
                    >
                      {r.agentId}
                    </td>
                    <td style={{ padding: '10px 10px' }}>{r.hasToken ? 'sí' : '—'}</td>
                    <td style={{ padding: '10px 10px', fontWeight: 700 }}>{r.requestsThisMonth}</td>
                    <td style={{ padding: '10px 10px' }}>{r.requestsLastMonth}</td>
                    <td style={{ padding: '10px 10px' }}>{r.requestsAllTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
