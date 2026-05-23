'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';
import { isBillingProfileReady, type BillingProfile } from '@/lib/billing-profile';

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
  kind?: 'subscription' | 'order';
  description?: string;
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
    case 'completed':
      return 'Completada';
    case 'open':
      return 'Pendiente';
    case 'void':
      return 'Anulada';
    case 'refunded':
      return 'Reembolsada';
    default:
      return s || '—';
  }
}

type InvoiceListProps = {
  showGenerate?: boolean;
  /** Si se indica, carga facturas del usuario vía API admin. */
  adminUserId?: string;
};

function invoiceApiBase(adminUserId?: string) {
  return adminUserId ? `/api/admin/billing/${adminUserId}` : '/api/billing';
}

export function InvoiceList({ showGenerate = true, adminUserId }: InvoiceListProps) {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const apiBase = invoiceApiBase(adminUserId);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/invoices`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setInvoices(d.invoices ?? []);
      })
      .catch(() => setError('No se pudieron cargar las facturas.'))
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  async function generateReceipt(inv: InvoiceRow) {
    const kind = inv.kind ?? (inv.id.startsWith('o_') ? 'order' : 'subscription');
    setGeneratingId(inv.id);
    try {
      const generateUrl = adminUserId
        ? `${apiBase}/invoices/generate`
        : '/api/billing/invoices/generate';
      const res = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id, kind }),
      });
      const data = await res.json();
      if (!res.ok || !data.downloadUrl) {
        toast.error(typeof data.error === 'string' ? data.error : 'No se pudo generar el recibo.');
        return;
      }
      window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      toast.success('Recibo generado.');
    } catch {
      toast.error('Error de red al generar el recibo.');
    } finally {
      setGeneratingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} className="animate-spin" />
        Cargando facturas…
      </div>
    );
  }

  if (error) {
    return <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>;
  }

  if (!invoices?.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        Aún no hay recibos. Aparecerán aquí tras tu primer pago (suscripción o pack de conversaciones).
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Fecha</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Concepto</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}>Importe</th>
            <th style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--muted-foreground)' }}> </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const pdfUrl = inv.invoicePdf || inv.hostedInvoiceUrl;
            const kind = inv.kind ?? (inv.id.startsWith('o_') ? 'order' : 'subscription');
            return (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                  {new Date(inv.created * 1000).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <div style={{ fontWeight: 600 }}>{inv.description || inv.number}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {inv.number} · {statusLabel(inv.status)}
                  </div>
                </td>
                <td style={{ padding: '10px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatMoney(inv.amountPaid > 0 ? inv.amountPaid : inv.amountDue, inv.currency)}
                </td>
                <td style={{ padding: '10px 6px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {pdfUrl ? (
                      <a
                        href={pdfUrl}
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
                        <FileText size={12} /> PDF
                      </a>
                    ) : null}
                    {inv.hostedInvoiceUrl && inv.hostedInvoiceUrl !== pdfUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#6366f1',
                          fontWeight: 600,
                          textDecoration: 'none',
                          fontSize: 11,
                        }}
                      >
                        <ExternalLink size={12} /> Ver
                      </a>
                    ) : null}
                    {showGenerate ? (
                      <button
                        type="button"
                        disabled={generatingId === inv.id}
                        onClick={() => generateReceipt(inv)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: '#0d9488',
                          fontWeight: 600,
                          fontSize: 11,
                          background: 'none',
                          border: 'none',
                          cursor: generatingId === inv.id ? 'wait' : 'pointer',
                          padding: 0,
                        }}
                      >
                        {generatingId === inv.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Receipt size={12} />
                        )}
                        {pdfUrl ? 'Regenerar' : 'Generar'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        onClick={load}
        style={{
          marginTop: 12,
          fontSize: 12,
          fontWeight: 600,
          color: BRAND_TEXT_COLOR,
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

type BillingProfileFormProps = {
  adminUserId?: string;
  /** Oculta el botón guardar y el pie de ayuda (p. ej. cuando el padre los controla). */
  hideActions?: boolean;
  onProfileChange?: (profile: BillingProfile, ready: boolean) => void;
  /** Se invoca una vez al cargar el perfil desde la API (p. ej. admin facturas). */
  onProfileLoaded?: (profile: BillingProfile, ready: boolean) => void;
  onSaved?: () => void;
};

export function BillingProfileForm({ adminUserId, hideActions, onProfileChange, onProfileLoaded, onSaved }: BillingProfileFormProps) {
  const [profile, setProfile] = useState<BillingProfile>({
    companyName: '',
    taxId: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const profileUrl = adminUserId
    ? `/api/admin/billing/${adminUserId}/profile`
    : '/api/user/billing-profile';

  useEffect(() => {
    setLoading(true);
    fetch(profileUrl)
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          const ready = isBillingProfileReady(d.profile);
          setProfile(d.profile);
          onProfileLoaded?.(d.profile, ready);
        }
      })
      .finally(() => setLoading(false));
  }, [profileUrl, onProfileLoaded]);

  function updateProfile(next: BillingProfile) {
    setProfile(next);
    onProfileChange?.(next, isBillingProfileReady(next));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(profileUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'No se pudieron guardar los datos.');
        return;
      }
      toast.success('Datos de facturación guardados.');
      onSaved?.();
    } finally {
      setSaving(false);
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
    color: 'var(--foreground)',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
        <Loader2 size={16} className="animate-spin" />
        Cargando datos…
      </div>
    );
  }

  return (
    <form onSubmit={save}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label>
          <span style={labelStyle}>Nombre / Razón social</span>
          <input
            style={inputStyle}
            value={profile.companyName ?? ''}
            onChange={(e) => updateProfile({ ...profile, companyName: e.target.value })}
            placeholder="Empresa S.L. o tu nombre"
          />
        </label>
        <label>
          <span style={labelStyle}>NIF / CIF / Tax ID</span>
          <input
            style={inputStyle}
            value={profile.taxId ?? ''}
            onChange={(e) => updateProfile({ ...profile, taxId: e.target.value })}
            placeholder="B12345678"
          />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <span style={labelStyle}>Dirección</span>
          <input
            style={inputStyle}
            value={profile.address ?? ''}
            onChange={(e) => updateProfile({ ...profile, address: e.target.value })}
            placeholder="Calle, número, piso"
          />
        </label>
        <label>
          <span style={labelStyle}>Ciudad</span>
          <input
            style={inputStyle}
            value={profile.city ?? ''}
            onChange={(e) => updateProfile({ ...profile, city: e.target.value })}
          />
        </label>
        <label>
          <span style={labelStyle}>Provincia / Estado</span>
          <input
            style={inputStyle}
            value={profile.state ?? ''}
            onChange={(e) => updateProfile({ ...profile, state: e.target.value })}
          />
        </label>
        <label>
          <span style={labelStyle}>Código postal</span>
          <input
            style={inputStyle}
            value={profile.zipCode ?? ''}
            onChange={(e) => updateProfile({ ...profile, zipCode: e.target.value })}
          />
        </label>
        <label>
          <span style={labelStyle}>País (ISO, ej. ES)</span>
          <input
            style={inputStyle}
            value={profile.country ?? ''}
            onChange={(e) => updateProfile({ ...profile, country: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="ES"
            maxLength={2}
          />
        </label>
      </div>
      {!hideActions ? (
        <>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '10px 0 14px', lineHeight: 1.45 }}>
            {adminUserId
              ? 'Guarda estos datos antes de generar el recibo. Aparecerán como cliente en el PDF.'
              : 'Estos datos se incluyen al generar recibos PDF desde LemonSqueezy (suscripción y packs).'}
          </p>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: BRAND_TEXT_COLOR,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Guardando…' : 'Guardar datos de facturación'}
          </button>
        </>
      ) : null}
    </form>
  );
}
