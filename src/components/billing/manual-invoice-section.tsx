'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { BillingProfileForm } from '@/components/billing/invoice-list';
import { BRAND_TEXT_COLOR } from '@/lib/brand';
import { formatBillingProfileSummary, type BillingProfile } from '@/lib/billing-profile';

type ManualInvoiceRow = {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  concept: string;
  totalCents: number;
  currency: string;
  taxPercent: number;
};

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type ManualInvoiceSectionProps = {
  adminUserId: string;
  userEmail?: string;
};

export function ManualInvoiceSection({ adminUserId, userEmail }: ManualInvoiceSectionProps) {
  const apiBase = `/api/admin/billing/${adminUserId}/manual-invoices`;
  const [items, setItems] = useState<ManualInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSummary, setProfileSummary] = useState('');
  const [form, setForm] = useState({
    concept: '',
    amount: '',
    currency: 'EUR',
    taxPercent: '21',
    issuedAt: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Transferencia',
    paymentRef: '',
    notes: '',
  });

  const handleProfileChange = useCallback((profile: BillingProfile, ready: boolean) => {
    setProfileReady(ready);
    setProfileSummary(formatBillingProfileSummary(profile, userEmail));
    setProfileSaved(false);
  }, [userEmail]);

  const handleProfileSaved = useCallback(() => {
    setProfileSaved(true);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => toast.error('No se pudieron cargar los recibos manuales.'))
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!profileReady || !profileSaved) {
      toast.error('Completa y guarda los datos de facturación del cliente antes de generar el recibo.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: form.concept,
          amount: parseFloat(form.amount),
          currency: form.currency,
          taxPercent: parseFloat(form.taxPercent) || 0,
          issuedAt: form.issuedAt,
          paymentMethod: form.paymentMethod,
          paymentRef: form.paymentRef,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al crear el recibo.');
        return;
      }
      toast.success(`Recibo ${data.invoiceNumber} creado.`);
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank', 'noopener,noreferrer');
      setForm((f) => ({ ...f, concept: '', amount: '', paymentRef: '', notes: '' }));
      load();
    } finally {
      setCreating(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--background)',
    fontSize: 13,
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
  };

  return (
    <div>
      <section
        style={{
          marginBottom: 16,
          padding: 16,
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--background)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 4px' }}>Datos de facturación (cliente)</h3>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
              Se cargan del usuario seleccionado y aparecen en el PDF como receptor de la factura.
            </p>
          </div>
          {profileReady ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                color: '#16a34a',
                background: 'rgba(22,163,74,0.1)',
                padding: '5px 10px',
                borderRadius: 999,
              }}
            >
              <CheckCircle2 size={13} />
              Cliente listo
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                color: '#d97706',
                background: 'rgba(217,119,6,0.1)',
                padding: '5px 10px',
                borderRadius: 999,
              }}
            >
              <AlertCircle size={13} />
              Falta nombre o NIF
            </span>
          )}
        </div>

        {profileReady && profileSummary ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--foreground)',
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              lineHeight: 1.5,
            }}
          >
            {profileSummary}
          </p>
        ) : null}

        <BillingProfileForm
          key={adminUserId}
          adminUserId={adminUserId}
          onProfileChange={handleProfileChange}
          onSaved={handleProfileSaved}
        />
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 4px' }}>Nueva factura manual</h3>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
            Para pagos fuera de LemonSqueezy o cuando no hay recibo automático.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          {showForm ? 'Ocultar formulario' : 'Mostrar formulario'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={createInvoice}
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--background)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Concepto *</span>
              <input
                style={inputStyle}
                required
                value={form.concept}
                onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))}
                placeholder="Ej. Suscripción BotIvA Growth — mayo 2026"
              />
            </label>
            <label>
              <span style={labelStyle}>Importe (base) *</span>
              <input
                style={inputStyle}
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="39.00"
              />
            </label>
            <label>
              <span style={labelStyle}>Moneda</span>
              <select
                style={inputStyle}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="COP">COP</option>
                <option value="GBP">GBP</option>
                <option value="MXN">MXN</option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>IVA %</span>
              <input
                style={inputStyle}
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.taxPercent}
                onChange={(e) => setForm((f) => ({ ...f, taxPercent: e.target.value }))}
              />
            </label>
            <label>
              <span style={labelStyle}>Fecha emisión</span>
              <input
                style={inputStyle}
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))}
              />
            </label>
            <label>
              <span style={labelStyle}>Forma de pago</span>
              <input
                style={inputStyle}
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                placeholder="Transferencia, tarjeta…"
              />
            </label>
            <label>
              <span style={labelStyle}>Referencia pago</span>
              <input
                style={inputStyle}
                value={form.paymentRef}
                onChange={(e) => setForm((f) => ({ ...f, paymentRef: e.target.value }))}
                placeholder="N.º transferencia, últimos 4 dígitos tarjeta…"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Notas (opcional)</span>
              <textarea
                style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Observaciones adicionales"
              />
            </label>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '10px 0 12px' }}>
            El PDF incluirá emisor BotIvA, numeración BIV-AAAA-0001 y los datos fiscales del cliente de arriba.
          </p>
          <button
            type="submit"
            disabled={creating || !profileReady || !profileSaved}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: creating || !profileReady || !profileSaved ? 'var(--muted)' : BRAND_TEXT_COLOR,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: creating || !profileReady || !profileSaved ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Generando…' : !profileSaved ? 'Guarda los datos del cliente primero' : 'Generar recibo PDF'}
          </button>
        </form>
      ) : null}

      <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 10px' }}>Recibos emitidos</h3>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
          <Loader2 size={16} className="animate-spin" />
          Cargando recibos manuales…
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          Aún no hay recibos manuales para este usuario.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Fecha</th>
                <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>N.º</th>
                <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Concepto</th>
                <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Total</th>
                <th style={{ padding: '8px 6px' }} />
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                    {new Date(inv.issuedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 6px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: '10px 6px' }}>{inv.concept}</td>
                  <td style={{ padding: '10px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatMoney(inv.totalCents, inv.currency)}
                  </td>
                  <td style={{ padding: '10px 6px' }}>
                    <a
                      href={`${apiBase}/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: BRAND_TEXT_COLOR,
                        fontWeight: 600,
                        textDecoration: 'none',
                        fontSize: 11,
                      }}
                    >
                      <FileDown size={12} /> PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
