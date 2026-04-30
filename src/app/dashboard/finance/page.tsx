'use client';

import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';
import { PieChart, Loader2 } from 'lucide-react';

type FinancePayload = {
  currency: string;
  rateUsdPerMessage: number;
  months: string[];
  rows: Array<{
    month: string;
    widgetId: string;
    agentLabel: string;
    billableMessages: number;
    estimatedUsd: number;
  }>;
  totalsByMonth: Record<string, { messages: number; estimatedUsd: number }>;
  disclaimer?: string;
};

export default function FinancePage() {
  const { user } = useAuth();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch('/api/dashboard/finance')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error');
        setData(j);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [user?.uid]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.75 }}>
          Finanzas internas
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
          <PieChart size={26} aria-hidden />
          Coste estimado por widget / mes
        </h1>
        <p style={{ margin: '10px 0 0', opacity: 0.88, maxWidth: 800 }}>
          Basado en mensajes registrados en uso de widget (RequestLog). Ajusta la tarifa con la variable de entorno{' '}
          <code>FINANCE_EST_USD_PER_MESSAGE</code> (por defecto ~0,003 USD por mensaje).
        </p>
      </div>

      {loading ? (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
          <Loader2 className="animate-spin" size={20} /> Cargando…
        </p>
      ) : err ? (
        <p style={{ color: '#fecaca' }}>{err}</p>
      ) : !data ? (
        <p>Sin datos.</p>
      ) : (
        <>
          <div className="card-texture" style={{ padding: 16, borderRadius: 14, marginBottom: 16, border: '1px solid rgba(255,255,255,0.12)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Tarifa estimada: <strong>{data.rateUsdPerMessage} USD</strong> por mensaje facturable.
            </p>
            {data.disclaimer ? (
              <p style={{ margin: '10px 0 0', fontSize: 12, opacity: 0.78 }}>{data.disclaimer}</p>
            ) : null}
          </div>

          <div
            className="card-texture"
            style={{ overflowX: 'auto', padding: 0, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: 'rgba(15,23,42,0.45)' }}>
                  <th style={{ padding: '12px 10px' }}>Mes</th>
                  <th style={{ padding: '12px 10px' }}>Agente / widget</th>
                  <th style={{ padding: '12px 10px' }}>Mensajes</th>
                  <th style={{ padding: '12px 10px' }}>USD (est.)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.month}-${r.widgetId}-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <td style={{ padding: '10px' }}>{r.month}</td>
                    <td style={{ padding: '10px' }}>{r.agentLabel}</td>
                    <td style={{ padding: '10px' }}>{r.billableMessages}</td>
                    <td style={{ padding: '10px' }}>{r.estimatedUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: '24px 0 10px', fontSize: 16 }}>Totales por mes</h3>
          <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.9 }}>
            {data.months.map((m) => (
              <li key={m} style={{ marginBottom: 6 }}>
                <strong>{m}</strong>: {data.totalsByMonth[m]?.messages ?? 0} mensajes, ~{' '}
                {(data.totalsByMonth[m]?.estimatedUsd ?? 0).toFixed(4)} USD
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
