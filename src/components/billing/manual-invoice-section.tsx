'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BillingProfileForm } from '@/components/billing/invoice-list';
import { BRAND_TEXT_COLOR } from '@/lib/brand';
import { formatBillingProfileSummary, type BillingProfile } from '@/lib/billing-profile';
import {
  computeTotalsByCurrency,
  formatAmountDisplay,
  formatInvoiceTotalDisplay,
  formatMoneyCents,
  INVOICE_PAYMENT_METHODS,
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
  paymentMethod?: string;
  paymentRef?: string;
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
    currency: from?.currency ?? 'COP',
    notes: '',
  };
}

const FE_HEADER_BG = 'rgba(148, 163, 184, 0.14)';
const FE_BORDER = 'var(--border)';

function FeSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: FE_HEADER_BG,
        border: `1px solid ${FE_BORDER}`,
        borderBottom: 'none',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color: 'var(--foreground)',
      }}
    >
      {children}
    </div>
  );
}

function FeSectionBody({ children, noPad }: { children: React.ReactNode; noPad?: boolean }) {
  return (
    <div
      style={{
        padding: noPad ? 0 : 14,
        border: `1px solid ${FE_BORDER}`,
        borderTop: 'none',
        marginBottom: 0,
        background: 'var(--background)',
      }}
    >
      {children}
    </div>
  );
}

function displayTotal(cents: number, currency: string) {
  if (currency === 'COP') return formatAmountDisplay(cents, currency);
  return formatMoney(cents, currency);
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
    paymentMethod: 'Transferencia bancaria' as string,
    paymentMethodCustom: '',
    paymentRef: '',
  });

  const resolvedPaymentMethod =
    form.paymentMethod === 'Otro' ? form.paymentMethodCustom.trim() : form.paymentMethod;

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

  const handleProfileLoaded = useCallback((profile: BillingProfile, ready: boolean) => {
    setProfileReady(ready);
    setProfileSummary(formatBillingProfileSummary(profile, userEmail));
    setProfileSaved(ready);
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
    if (!resolvedPaymentMethod || resolvedPaymentMethod.length < 2) {
      toast.error('Indica el medio de pago.');
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
          paymentMethod: resolvedPaymentMethod,
          paymentRef: form.paymentRef.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Error al crear el recibo.');
        return;
      }
      toast.success(`Recibo ${data.invoiceNumber} creado.`);
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank', 'noopener,noreferrer');
      setForm({
        lines: [newLine()],
        taxPercent: form.taxPercent,
        paymentMethod: form.paymentMethod,
        paymentMethodCustom: '',
        paymentRef: '',
      });
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

  const cellInput: React.CSSProperties = {
    width: '100%',
    padding: '8px 8px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'transparent',
    fontSize: 12,
    boxSizing: 'border-box',
  };

  const thStyle: React.CSSProperties = {
    padding: '8px 8px',
    fontWeight: 700,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--muted-foreground)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      {/* ── Adquiriente ── */}
      <FeSectionTitle>Datos del Adquiriente</FeSectionTitle>
      <FeSectionBody>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
            Información que aparecerá en el bloque «Datos del Adquiriente» del PDF.
          </p>
          {profileReady ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', padding: '5px 10px', borderRadius: 999 }}>
              <CheckCircle2 size={13} /> Cliente listo
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', padding: '5px 10px', borderRadius: 999 }}>
              <AlertCircle size={13} /> Falta nombre o NIF
            </span>
          )}
        </div>
        {profileReady && profileSummary ? (
          <p style={{ fontSize: 12, margin: '0 0 12px', padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', lineHeight: 1.5 }}>
            {profileSummary}
          </p>
        ) : null}
        <BillingProfileForm
          key={adminUserId}
          adminUserId={adminUserId}
          onProfileChange={handleProfileChange}
          onProfileLoaded={handleProfileLoaded}
          onSaved={handleProfileSaved}
        />
      </FeSectionBody>

      <div style={{ height: 16 }} />

      {showForm ? (
        <form onSubmit={createInvoice}>
          <div style={{ border: `2px solid ${FE_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '14px 16px', background: 'var(--card)', borderBottom: `1px solid ${FE_BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '0.02em' }}>FACTURA ELECTRÓNICA DE VENTA</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Comprobante manual · numeración BIV-AAAA-0001
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${FE_BORDER}`, background: 'transparent', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Ocultar
                </button>
              </div>
            </div>

            <FeSectionTitle>Datos del documento</FeSectionTitle>
            <FeSectionBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <label>
                  <span style={labelStyle}>Medio de pago</span>
                  <select
                    style={inputStyle}
                    value={form.paymentMethod}
                    onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                    required
                  >
                    {INVOICE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                {form.paymentMethod === 'Otro' ? (
                  <label>
                    <span style={labelStyle}>Especificar medio</span>
                    <input
                      style={inputStyle}
                      required
                      value={form.paymentMethodCustom}
                      onChange={(e) => setForm((f) => ({ ...f, paymentMethodCustom: e.target.value }))}
                      placeholder="Ej. PayPal, Wise, efecty…"
                    />
                  </label>
                ) : null}
                <label>
                  <span style={labelStyle}>Referencia de pago (opcional)</span>
                  <input
                    style={inputStyle}
                    value={form.paymentRef}
                    onChange={(e) => setForm((f) => ({ ...f, paymentRef: e.target.value }))}
                    placeholder="N.º transferencia, comprobante, etc."
                  />
                </label>
                <label>
                  <span style={labelStyle}>Tipo de negociación</span>
                  <input style={{ ...inputStyle, background: 'var(--muted)', color: 'var(--muted-foreground)' }} value="Contado" readOnly />
                </label>
              </div>
            </FeSectionBody>

            <FeSectionTitle>Detalle de productos / servicios</FeSectionTitle>
            <FeSectionBody noPad>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: FE_HEADER_BG }}>
                    <tr>
                      <th style={{ ...thStyle, width: 44 }}>Cód.</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={{ ...thStyle, width: 44 }}>Cant.</th>
                      <th style={{ ...thStyle, width: 100 }}>P/U</th>
                      <th style={{ ...thStyle, width: 72 }}>Moneda</th>
                      <th style={thStyle}>Notas</th>
                      <th style={{ ...thStyle, width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line, index) => (
                      <tr key={line.id} style={{ borderTop: `1px solid ${FE_BORDER}` }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--muted-foreground)', fontSize: 11 }}>
                          {String(index + 1).padStart(3, '0')}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            style={cellInput}
                            required
                            value={line.concept}
                            onChange={(e) => updateLine(line.id, { concept: e.target.value })}
                            placeholder="Descripción del producto o servicio"
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--muted-foreground)' }}>1</td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            style={cellInput}
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={line.amount}
                            onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                            placeholder="0"
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <select
                            style={{ ...cellInput, padding: '7px 4px' }}
                            value={line.currency}
                            onChange={(e) => updateLine(line.id, { currency: e.target.value })}
                          >
                            {SUPPORTED_INVOICE_CURRENCIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            style={cellInput}
                            value={line.notes}
                            onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                            placeholder="Opcional"
                          />
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            disabled={form.lines.length <= 1}
                            aria-label="Eliminar línea"
                            style={{ border: 'none', background: 'transparent', color: form.lines.length <= 1 ? 'var(--muted)' : '#ef4444', cursor: form.lines.length <= 1 ? 'not-allowed' : 'pointer', padding: 4 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 12px', borderTop: `1px solid ${FE_BORDER}` }}>
                <button
                  type="button"
                  onClick={addLine}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: BRAND_TEXT_COLOR }}
                >
                  <Plus size={12} /> Añadir línea
                </button>
              </div>
            </FeSectionBody>

            {parsedItems.length > 0 ? (
              <>
                <FeSectionTitle>Resumen de valores</FeSectionTitle>
                <FeSectionBody>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <label>
                      <span style={labelStyle}>IVA % (documento)</span>
                      <input
                        style={{ ...inputStyle, maxWidth: 100 }}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={form.taxPercent}
                        onChange={(e) => setForm((f) => ({ ...f, taxPercent: e.target.value }))}
                      />
                    </label>
                  </div>
                  {[...totalsByCurrency.entries()].map(([currency, t]) => (
                    <div
                      key={currency}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '140px 1fr 140px 1fr',
                        gap: '8px 16px',
                        fontSize: 12,
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${FE_BORDER}`,
                        background: 'var(--card)',
                      }}
                    >
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 700 }}>MONEDA:</span>
                      <span>{currency}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 700 }}>SUB TOTAL:</span>
                      <span>{displayTotal(t.subtotalCents, currency)}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 700 }}>BASE GRAVABLE:</span>
                      <span>{displayTotal(t.subtotalCents, currency)}</span>
                      <span style={{ color: 'var(--muted-foreground)', fontWeight: 700 }}>IVA {taxRate}%:</span>
                      <span>{displayTotal(t.taxCents, currency)}</span>
                      <span style={{ color: 'var(--foreground)', fontWeight: 800 }}>VALOR FACTURA:</span>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{displayTotal(t.totalCents, currency)}</span>
                    </div>
                  ))}
                </FeSectionBody>
              </>
            ) : null}

            <div style={{ padding: '14px 16px', borderTop: `1px solid ${FE_BORDER}`, background: 'var(--card)' }}>
              <button
                type="submit"
                disabled={creating || !profileReady || !profileSaved || !resolvedPaymentMethod}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: creating || !profileReady || !profileSaved || !resolvedPaymentMethod ? 'var(--muted)' : BRAND_TEXT_COLOR,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: creating || !profileReady || !profileSaved || !resolvedPaymentMethod ? 'not-allowed' : 'pointer',
                }}
              >
                {creating
                  ? 'Generando PDF…'
                  : !profileReady
                    ? 'Completa nombre o NIF del adquiriente'
                    : !profileSaved
                      ? 'Guarda los datos del adquiriente primero'
                      : !resolvedPaymentMethod
                        ? 'Indica el medio de pago'
                        : 'Generar factura PDF'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, border: 'none', background: BRAND_TEXT_COLOR, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 20 }}
        >
          <Plus size={14} /> Nueva factura electrónica
        </button>
      )}

      <FeSectionTitle>Recibos emitidos</FeSectionTitle>
      <FeSectionBody noPad>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)', padding: 16 }}>
            <Loader2 size={16} className="animate-spin" />
            Cargando recibos manuales…
          </div>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0, padding: 16 }}>
            Aún no hay recibos manuales para este usuario.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: FE_HEADER_BG }}>
                <tr>
                  <th style={{ ...thStyle, padding: '10px 8px' }}>Fecha</th>
                  <th style={{ ...thStyle, padding: '10px 8px' }}>N.º factura</th>
                  <th style={{ ...thStyle, padding: '10px 8px' }}>Concepto</th>
                  <th style={{ ...thStyle, padding: '10px 8px' }}>Medio pago</th>
                  <th style={{ ...thStyle, padding: '10px 8px' }}>Valor factura</th>
                  <th style={{ ...thStyle, padding: '10px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} style={{ borderTop: `1px solid ${FE_BORDER}` }}>
                    <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                      {new Date(inv.issuedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {formatConceptSummary(inv.concept, inv.lineItems?.length || undefined)}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {inv.paymentMethod || '—'}
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '10px 8px' }}>
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
      </FeSectionBody>
    </div>
  );
}
