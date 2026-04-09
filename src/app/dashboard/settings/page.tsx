'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { SubscriptionPlanPanel } from '@/components/dashboard/subscription-plan-panel';
import { UpdatePaymentModal } from '@/components/billing/update-payment-modal';
import { InvoiceList } from '@/components/billing/invoice-list';
import { getStripePromise } from '@/lib/stripe-client';
import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const {
    subscription,
    isPremium,
    isTrialActive,
    hasStripeSubscription,
    openBillingPortal,
    cancelSubscription,
    resumeSubscription,
    loading,
    refresh,
  } = useSubscription();
  const [copyMsg, setCopyMsg] = useState('');
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyEmailReq, setBusyEmailReq] = useState(false);
  const [busyEmailConfirm, setBusyEmailConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayNameDraft(user.displayName ?? '');
  }, [user?.uid, user?.displayName]);

  useEffect(() => {
    if (!user) return;
    if (user.pendingEmail) {
      setNewEmail(user.pendingEmail);
    } else {
      setNewEmail('');
      setEmailCode('');
    }
  }, [user?.uid, user?.pendingEmail]);

  async function saveDisplayName() {
    if (!user) return;
    setBusyProfile(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayNameDraft }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo guardar el nombre.');
        return;
      }
      toast.success('Nombre actualizado.');
      await refreshUser();
    } finally {
      setBusyProfile(false);
    }
  }

  async function requestEmailChange() {
    setBusyEmailReq(true);
    try {
      const r = await fetch('/api/user/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo enviar el código.');
        return;
      }
      toast.success(data.message || 'Código enviado al nuevo correo.');
      await refreshUser();
    } finally {
      setBusyEmailReq(false);
    }
  }

  async function confirmEmailChange() {
    const target = user?.pendingEmail?.trim().toLowerCase();
    if (!target) {
      toast.error('No hay un cambio de email pendiente. Solicita un código primero.');
      return;
    }
    setBusyEmailConfirm(true);
    try {
      const r = await fetch('/api/user/email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: target, code: emailCode }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo confirmar el email.');
        return;
      }
      toast.success(data.message || 'Email actualizado.');
      setEmailCode('');
      await refreshUser();
    } finally {
      setBusyEmailConfirm(false);
    }
  }

  /** Tras 3DS u otro redirect de Stripe al guardar tarjeta */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== 'return') return;
    const clientSecret = params.get('setup_intent_client_secret');
    if (!clientSecret) return;

    (async () => {
      const p = getStripePromise();
      if (!p) return;
      const stripe = await p;
      if (!stripe) return;
      const { setupIntent, error } = await stripe.retrieveSetupIntent(clientSecret);
      if (error || !setupIntent?.id) {
        toast.error(error?.message || 'No se pudo completar la verificación del pago.');
        window.history.replaceState({}, '', '/dashboard/settings');
        return;
      }
      if (setupIntent.status === 'succeeded') {
        const r = await fetch('/api/billing/setup-intent/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setupIntentId: setupIntent.id }),
        });
        const data = await r.json();
        if (r.ok) {
          toast.success(data.message || 'Método de pago actualizado.');
          refresh({ silent: true });
        } else {
          toast.error(data.error || 'Error al guardar.');
        }
      }
      window.history.replaceState({}, '', '/dashboard/settings');
    })();
  }, [refresh]);

  function copyUserId() {
    if (!user) return;
    navigator.clipboard.writeText(user.uid);
    setCopyMsg('Copiado!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  async function portal() {
    setBusy('portal');
    setBillingMsg(null);
    const r = await openBillingPortal();
    setBusy(null);
    if (r && 'error' in r && r.error) setBillingMsg(r.error);
  }

  async function scheduleCancel() {
    if (!confirm('¿Programar la cancelación al final del periodo actual? Seguirás con acceso hasta esa fecha.')) return;
    setBusy('cancel');
    setBillingMsg(null);
    const r = await cancelSubscription(true);
    setBusy(null);
    if (r && 'error' in r && r.error) setBillingMsg(r.error);
    else if (r && 'message' in r && r.message) setBillingMsg(r.message);
  }

  async function resume() {
    setBusy('resume');
    setBillingMsg(null);
    const r = await resumeSubscription();
    setBusy(null);
    if (r && 'error' in r && r.error) setBillingMsg(r.error);
    else if (r && 'message' in r && r.message) setBillingMsg(r.message);
  }

  const hasStripePaid =
    isPremium &&
    subscription?.status &&
    ['active', 'trialing', 'past_due'].includes(subscription.status);

  return (
    <div style={{ padding: '32px', maxWidth: '640px' }}>
      <UpdatePaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSaved={() => refresh({ silent: true })}
      />

      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Ajustes</h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '32px' }}>Información de tu cuenta y suscripción</p>

      {/* Account info */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Cuenta</h2>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>Nombre</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              maxLength={120}
              placeholder="Tu nombre"
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              disabled={busyProfile || !user}
              onClick={saveDisplayName}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                background: 'rgba(13,148,136,0.12)',
                color: '#0d9488',
                border: '1px solid rgba(13,148,136,0.35)',
                cursor: busyProfile ? 'wait' : 'pointer',
              }}
            >
              {busyProfile ? 'Guardando…' : 'Guardar nombre'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Email actual</span>
          <p style={{ fontSize: '14px', fontWeight: 600, margin: '6px 0 0' }}>{user?.email || '—'}</p>
        </div>

        {user?.pendingEmail ? (
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid rgba(13,148,136,0.35)',
              background: 'rgba(13,148,136,0.06)',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '13px', margin: '0 0 12px', lineHeight: 1.5 }}>
              Hay un cambio pendiente a <strong>{user.pendingEmail}</strong>. Introduce el código de 6 dígitos que enviamos a ese correo.
            </p>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>Código</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                style={{
                  width: '120px',
                  letterSpacing: '0.2em',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '18px',
                  fontWeight: 700,
                }}
              />
              <button
                type="button"
                disabled={busyEmailConfirm || emailCode.length !== 6}
                onClick={confirmEmailChange}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: '#0d9488',
                  color: '#fff',
                  border: 'none',
                  cursor: busyEmailConfirm || emailCode.length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: emailCode.length !== 6 ? 0.6 : 1,
                }}
              >
                {busyEmailConfirm ? '…' : 'Confirmar nuevo email'}
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '12px 0 0' }}>
              ¿No llegó? Revisa spam o vuelve a enviar el código con el mismo correo abajo.
            </p>
          </div>
        ) : null}

        <div style={{ marginBottom: '8px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>
            {user?.pendingEmail ? 'Reenviar código / otro correo' : 'Nuevo email'}
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nuevo@correo.com"
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              disabled={busyEmailReq || !newEmail.trim()}
              onClick={requestEmailChange}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                background: 'rgba(13,148,136,0.12)',
                color: '#0d9488',
                border: '1px solid rgba(13,148,136,0.35)',
                cursor: busyEmailReq || !newEmail.trim() ? 'wait' : 'pointer',
                opacity: !newEmail.trim() ? 0.6 : 1,
              }}
            >
              {busyEmailReq ? 'Enviando…' : user?.pendingEmail ? 'Reenviar código' : 'Enviar código de verificación'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', margin: '8px 0 0', lineHeight: 1.45 }}>
            No puedes usar un email que ya tenga otra cuenta. Te enviaremos un código al nuevo correo; caduca en 15 minutos.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <Row
            label="User ID"
            value={user?.uid || '—'}
            action={
              <button onClick={copyUserId} style={{ fontSize: '11px', color: '#0d9488', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                {copyMsg || 'Copiar'}
              </button>
            }
          />
        </div>
      </div>

      {/* Subscription info */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Suscripción y facturación</h2>

        {billingMsg && (
          <p style={{ fontSize: '13px', color: '#0d9488', marginBottom: '16px', lineHeight: 1.45 }}>{billingMsg}</p>
        )}

        {!loading && <SubscriptionPlanPanel />}

        <div style={{ marginBottom: '20px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '10px',
            }}
          >
            Fechas
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {isTrialActive && subscription?.trialEndsAt && (
              <>
                <Row
                  label="Prueba gratuita — inicio"
                  value={subscription.trialStartedAt ? fmtDateTime(subscription.trialStartedAt) : '—'}
                />
                <Row label="Prueba gratuita — vence" value={fmtDateTime(subscription.trialEndsAt)} />
              </>
            )}
            {hasStripeSubscription && subscription && (
              <>
                <p
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    margin: '8px 0 6px',
                  }}
                >
                  Suscripción en Stripe
                </p>
                {(subscription.stripeSubscriptionCreated ?? 0) > 0 ? (
                  <Row
                    label="Alta de la suscripción"
                    value={fmtEpochSec(subscription.stripeSubscriptionCreated!)}
                  />
                ) : null}
                <Row
                  label="Inicio del periodo de facturación actual"
                  value={
                    (subscription.currentPeriodStart ?? 0) > 0
                      ? fmtEpochSec(subscription.currentPeriodStart!)
                      : '—'
                  }
                />
                <Row
                  label="Fin del periodo / próxima renovación"
                  value={
                    subscription.currentPeriodEnd > 0 ? fmtEpochSec(subscription.currentPeriodEnd) : '—'
                  }
                />
              </>
            )}
            <Row label="Estado" value={subscription?.status || '—'} />
            {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
              <Row
                label="Cancelación"
                value={`Programada — acceso hasta ${fmtEpochSec(subscription.currentPeriodEnd)}`}
              />
            ) : null}
          </div>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '16px', lineHeight: 1.5 }}>
          Los cambios de plan (subida o bajada) aplican proration de Stripe: se ajusta el importe en la siguiente factura según el tiempo restante del periodo.
        </p>

        {!loading && isPremium && hasStripePaid && (
          <>
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Tarjeta y facturas (sin salir de la app)</p>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setPaymentModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: 'rgba(13,148,136,0.12)',
                  color: '#0d9488',
                  border: '1px solid rgba(13,148,136,0.35)',
                  cursor: busy ? 'wait' : 'pointer',
                  marginBottom: '14px',
                }}
              >
                <CreditCard size={16} />
                Actualizar método de pago
              </button>
              <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--foreground)' }}>Facturas recientes</p>
              <InvoiceList />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                disabled={busy === 'portal'}
                onClick={portal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '12px',
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  border: '1px dashed var(--border)',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                <ExternalLink size={14} />
                Abrir portal avanzado de Stripe (histórico completo, opciones extra)
              </button>

              {subscription?.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={resume}
                  style={{
                    padding: '10px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: 'rgba(13,148,136,0.12)', color: '#0d9488', border: '1px solid rgba(13,148,136,0.35)', cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  Mantener suscripción (anular cancelación)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={scheduleCancel}
                  style={{
                    padding: '10px 16px', borderRadius: '10px', fontWeight: 600, fontSize: '13px',
                    background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  Programar cancelación al final del periodo
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (d == null) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });
}

function fmtEpochSec(sec: number): string {
  if (!sec || sec <= 0) return '—';
  return new Date(sec * 1000).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right' }}>{value}</span>
        {action}
      </div>
    </div>
  );
}
