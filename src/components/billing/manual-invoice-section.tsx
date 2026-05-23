'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BillingProfileForm } from '@/components/billing/invoice-list';
import { BRAND_TEXT_COLOR } from '@/lib/brand';
import { formatBillingProfileSummary, type BillingProfile } from '@/lib/billing-profile';
import {
  computeTotalsByCurrency,
  formatInvoiceTotalDisplay,
  formatMoneyCents,
  SUPPORTED_INVOICE_CURRENCIES,
} from '@/lib/manual-invoice-line';

type ManualInvoiceRow = {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  concept: string;
  lineItems?: {
    concept: string;
    amountCents: number;
    currency?: string;
    notes?: string;
  }[];
  totalCents: number;
  currency: string;
  taxPercent: number;
};

type ConceptLine = {
  id: string;
  concept: string;
  amount: string;
  currency: string;
  notes: string;
};

function newLine(from?: ConceptLine): ConceptLine {
  return {
    id: crypto.randomUUID(),
    concept: '',
    amount: '',
    currency: from?.currency ?? 'USD',
    notes: '',
  };
}

function formatConceptSummary(concept: string, lineCount?: number) {
  if (lineCount && lineCount > 1) {
    const first = concept.split(' · ')[0] || concept;
    return `${first} (+${lineCount - 1} más)`;
  }
  return concept;
}

function formatMoney(cents: number, currency: string) {
  return formatMoneyCents(cents, currency);
}

function linesToItems(lines: ConceptLine[]) {
  return lines
    .filter((l) => {
      const n = parseFloat(l.amount);
      return l.concept.trim() && Number.isFinite(n) && n > 0;
    })
    .map((l) => ({
      concept: l.concept.trim(),
      amountCents: Math.round(parseFloat(l.amount) * 100),
      currency: l.currency,
      notes: l.notes.trim(),
    }));
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
    lines: [newLine()] as ConceptLine[],
    taxPercent: '19',
  });

  const parsedItems = linesToItems(form.lines);
  const taxRate = parseFloat(form.taxPercent) || 0;
  const totalsByCurrency = computeTotalsByCurrency(parsedItems, taxRate);

  function updateLine(id: string, patch: Partial<Omit<ConceptLine, 'id'>>) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  function addLine() {
    setForm((f) => {
      const last = f.lines[f.lines.length - 1];
      return { ...f, lines: [...f.lines, newLine(last)] };
    });
  }

  function removeLine(id: string) {
    setForm((f) => ({
      ...f,
      lines: f.lines.length <= 1 ? f.lines : f.lines.filter((l) => l.id !== id),
    }));
  }

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
      const lineItems = form.lines.map((l) => ({
        concept: l.concept.trim(),
        amount: parseFloat(l.amount),
        currency: l.currency,
        notes: l.notes,
      }));

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItems,
          taxPercent: parseFloat(form.taxPercent) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al crear el recibo.');
        return;
      }
      toast.success(`Recibo ${data.invoiceNumber} creado.`);
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank', 'noopener,noreferrer');
      setForm({ lines: [newLine()], taxPercent: form.taxPercent });
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
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={labelStyle}>Conceptos *</span>
              <button
                type="button"
                onClick={addLine}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: BRAND_TEXT_COLOR,
                }}
              >
                <Plus size={12} /> Añadir concepto
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {form.lines.map((line, index) => (
                <div
                  key={line.id}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: BRAND_TEXT_COLOR }}>
                      Concepto {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={form.lines.length <= 1}
                      aria-label="Eliminar concepto"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 8px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: form.lines.length <= 1 ? 'var(--muted)' : '#ef4444',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: form.lines.length <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={12} /> Quitar
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <label style={{ gridColumn: '1 / -1' }}>
                      <span style={labelStyle}>Concepto *</span>
                      <input
                        style={inputStyle}
                        required
                        value={line.concept}
                        onChange={(e) => updateLine(line.id, { concept: e.target.value })}
                        placeholder="Ej. Suscripción BotIvA Growth — mayo 2026"
                      />
                    </label>
                    <label>
                      <span style={labelStyle}>Importe *</span>
                      <input
                        style={inputStyle}
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        placeholder="39.00"
                      />
                    </label>
                    <label>
                      <span style={labelStyle}>Moneda</span>
                      <select
                        style={inputStyle}
                        value={line.currency}
                        onChange={(e) => updateLine(line.id, { currency: e.target.value })}
                      >
                        {SUPPORTED_INVOICE_CURRENCIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>
                      <span style={labelStyle}>Notas (opcional)</span>
                      <textarea
                        style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
                        value={line.notes}
                        onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                        placeholder="Observaciones de esta línea"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {parsedItems.length > 0 ? (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'rgba(99,102,241,0.04)',
                }}
              >
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={labelStyle}>IVA % (documento)</span>
                  <input
                    style={{ ...inputStyle, maxWidth: 120 }}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.taxPercent}
                    onChange={(e) => setForm((f) => ({ ...f, taxPercent: e.target.value }))}
                  />
                </label>

                {[...totalsByCurrency.entries()].map(([currency, t]) => (
                  <div key={currency} style={{ fontSize: 13, lineHeight: 1.8, textAlign: 'right' }}>
                    <div style={{ color: 'var(--muted-foreground)' }}>
                      Subtotal ({currency}): <strong style={{ color: 'var(--foreground)' }}>{formatMoney(t.subtotalCents, currency)}</strong>
                    </div>
                    {taxRate > 0 ? (
                      <div style={{ color: 'var(--muted-foreground)' }}>
                        IVA ({taxRate}%): <strong style={{ color: 'var(--foreground)' }}>{formatMoney(t.taxCents, currency)}</strong>
                      </div>
                    ) : null}
                    <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>
                      Total ({currency}): {formatMoney(t.totalCents, currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
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
                  <td style={{ padding: '10px 6px' }}>
                    {formatConceptSummary(inv.concept, inv.lineItems?.length || undefined)}
                  </td>
                  <td style={{ padding: '10px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatInvoiceTotalDisplay(
                      (inv.lineItems ?? []).map((l) => ({
                        concept: l.concept,
                        amountCents: l.amountCents,
                        currency: l.currency ?? inv.currency,
                        notes: l.notes ?? '',
                      })),
                      inv.taxPercent,
                      { currency: inv.currency, totalCents: inv.totalCents },
                    )}
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
