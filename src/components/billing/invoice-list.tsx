'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';

export type InvoiceRow = {
  id: string;
  number: string;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('es', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function statusLabel(s: string | null) {
  switch (s) {
    case 'paid':
      return 'Pagada';
    case 'open':
      return 'Pendiente';
    case 'void':
      return 'Anulada';
    case 'uncollectible':
      return 'Incobrable';
    case 'draft':
      return 'Borrador';
    default:
      return s || '—';
  }
}

export function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/billing/invoices')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setInvoices(d.invoices ?? []);
      })
      .catch(() => setError('No se pudieron cargar las facturas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        Cargando facturas…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return <p style={{ fontSize: '13px', color: '#ef4444' }}>{error}</p>;
  }

  if (!invoices?.length) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
        Aún no hay facturas. Aparecerán aquí tras el primer cobro.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Fecha</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Nº</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Estado</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Importe</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}> </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                {new Date(inv.created * 1000).toLocaleDateString('es', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
              <td style={{ padding: '10px 6px' }}>{inv.number}</td>
              <td style={{ padding: '10px 6px' }}>{statusLabel(inv.status)}</td>
              <td style={{ padding: '10px 6px', fontWeight: 600 }}>
                {inv.amountPaid > 0
                  ? formatMoney(inv.amountPaid, inv.currency)
                  : formatMoney(inv.amountDue, inv.currency)}
              </td>
              <td style={{ padding: '10px 6px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {inv.hostedInvoiceUrl && (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#6366f1',
                        fontWeight: 600,
                        textDecoration: 'none',
                        fontSize: '11px',
                      }}
                    >
                      <ExternalLink size={12} /> Ver
                    </a>
                  )}
                  {inv.invoicePdf && (
                    <a
                      href={inv.invoicePdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#0d9488',
                        fontWeight: 600,
                        textDecoration: 'none',
                        fontSize: '11px',
                      }}
                    >
                      <FileText size={12} /> PDF
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={load}
        style={{
          marginTop: '12px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6366f1',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        Actualizar lista
      </button>
    </div>
  );
}
