'use client';

import { useState } from 'react';
import { ExternalLink, FileText } from '@/components/ui/icons';
import { toast } from 'sonner';
import { AdminUserPicker, type AdminUserOption } from '@/components/billing/admin-user-picker';
import { InvoiceList } from '@/components/billing/invoice-list';
import { ManualInvoiceSection } from '@/components/billing/manual-invoice-section';
import { UI_SURFACE_SECONDARY } from '@/lib/brand';

export default function AdminFacturasPage() {
  const [selectedUser, setSelectedUser] = useState<AdminUserOption | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  async function openPortal() {
    if (!selectedUser) return;
    setOpeningPortal(true);
    try {
      const res = await fetch(`/api/admin/billing/${selectedUser.id}/portal`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(typeof data.error === 'string' ? data.error : 'No se pudo abrir el portal.');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Error de red al abrir el portal.');
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={22} style={{ color: '#6366f1' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Facturas electrónicas</h1>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 }}>
          Genera facturas manuales con formato de factura electrónica de venta (Colombia) para pagos fuera de
          LemonSqueezy.
        </p>
        <AdminUserPicker selected={selectedUser} onSelect={setSelectedUser} />
      </div>

      {!selectedUser ? (
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          Busca un usuario por email o nombre para empezar.
        </p>
      ) : (
        <>
          <section style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
            <ManualInvoiceSection
              key={`manual-${selectedUser.id}`}
              adminUserId={selectedUser.id}
              userEmail={selectedUser.email}
            />
          </section>

          <section style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Historial LemonSqueezy</h2>
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                  Suscripciones y compras únicas procesadas automáticamente.
                </p>
              </div>
              <button
                type="button"
                disabled={openingPortal}
                onClick={() => void openPortal()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: openingPortal ? 'wait' : 'pointer',
                  color: 'var(--muted-foreground)',
                }}
              >
                <ExternalLink size={14} />
                Abrir portal
              </button>
            </div>
            <InvoiceList key={`invoices-${selectedUser.id}`} adminUserId={selectedUser.id} />
          </section>
        </>
      )}
    </div>
  );
}
