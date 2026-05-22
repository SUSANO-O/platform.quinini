'use client';

import Link from 'next/link';
import { FileText, ExternalLink } from 'lucide-react';
import { BillingProfileForm, InvoiceList } from '@/components/billing/invoice-list';
import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';
import { useSubscription } from '@/hooks/use-subscription';

export default function FacturasPage() {
  const { subscription, loading, openBillingPortal } = useSubscription();

  const hasPaid =
    subscription?.status &&
    ['active', 'trialing', 'past_due', 'canceled'].includes(subscription.status) &&
    subscription.plan !== 'free';

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={22} style={{ color: BRAND_TEXT_COLOR }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Facturas y recibos</h1>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Guarda tus datos fiscales y descarga recibos automáticos de LemonSqueezy (suscripción y packs).
        </p>
      </div>

      <section style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>Datos de facturación (cliente)</h2>
        <BillingProfileForm />
      </section>

      <section style={{ ...UI_SURFACE_SECONDARY, borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Historial de pagos</h2>
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Suscripciones y compras únicas procesadas por LemonSqueezy.
            </p>
          </div>
          {!loading && hasPaid ? (
            <button
              type="button"
              onClick={() => void openBillingPortal()}
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
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <ExternalLink size={14} />
              Portal LemonSqueezy
            </button>
          ) : null}
        </div>
        <InvoiceList />
      </section>

      <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
        También puedes gestionar método de pago en{' '}
        <Link href="/dashboard/settings#settings-invoices" style={{ color: BRAND_TEXT_COLOR, fontWeight: 600 }}>
          Ajustes → Facturación
        </Link>
        .
      </p>
    </div>
  );
}
