'use client';

import Link from 'next/link';
import { ExternalLink, FileText, Sparkles } from '@/components/ui/icons';
import { BillingProfileForm, InvoiceList } from '@/components/billing/invoice-list';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardPageHeader } from '@/components/dashboard/dashboard-page-header';
import { DashboardButton } from '@/components/dashboard/dashboard-button';
import { useSubscription } from '@/hooks/use-subscription';

export default function FacturasPage() {
  const { subscription, loading, openBillingPortal } = useSubscription();

  const hasPaid =
    subscription?.status &&
    ['active', 'trialing', 'past_due', 'canceled'].includes(subscription.status) &&
    subscription.plan !== 'free';

  return (
    <DashboardShell width="narrow">
      <DashboardPageHeader
        badge="Facturación"
        badgeIcon={Sparkles}
        title="Facturas y"
        titleAccent="recibos"
        description="Datos fiscales y descarga de recibos de suscripción y packs."
        compact
        hideIcon
      />

      <div className="dashboard-page-stack">
        <section className="dashboard-surface">
          <h2 className="dashboard-surface__title">Datos de facturación</h2>
          <p className="dashboard-surface__desc">Información que aparece en tus recibos.</p>
          <BillingProfileForm />
        </section>

        <section className="dashboard-surface">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="dashboard-surface__title m-0">Historial de pagos</h2>
              <p className="dashboard-surface__desc">Suscripciones y compras seguras.</p>
            </div>
            {!loading && hasPaid ? (
              <DashboardButton variant="secondary" className="text-xs" onClick={() => void openBillingPortal()}>
                <ExternalLink size={14} />
                Portal de pagos
              </DashboardButton>
            ) : null}
          </div>
          <InvoiceList />
        </section>

        <Link href="/dashboard/settings#settings-billing" className="dashboard-meta-chip dashboard-meta-chip--muted dashboard-meta-chip--link w-fit">
          <FileText size={10} />
          Ver plan y suscripción →
        </Link>
      </div>
    </DashboardShell>
  );
}
