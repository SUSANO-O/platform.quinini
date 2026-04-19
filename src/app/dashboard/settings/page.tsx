'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { SubscriptionPlanPanel } from '@/components/dashboard/subscription-plan-panel';
import { UpdatePaymentModal } from '@/components/billing/update-payment-modal';
import { InvoiceList } from '@/components/billing/invoice-list';
// import { getStripePromise } from '@/lib/stripe-client'; // Stripe — comentado
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, Settings, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const BRAND_R = '#e41414';
const BRAND_O = '#f87600';
const BRAND_B = '#00acf8';

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
  const [busyVerifyResend, setBusyVerifyResend] = useState(false);

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

  async function resendVerificationFromSettings() {
    if (!user?.email) return;
    setBusyVerifyResend(true);
    try {
      const r = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string; message?: string };
      if (!r.ok || data.ok === false) {
        toast.error(data.error || 'No se pudo enviar el correo de verificación.');
        return;
      }
      if (data.message) {
        toast.info(data.message);
        return;
      }
      toast.success(
        'Te hemos enviado un nuevo enlace. Revisa la bandeja y la carpeta de spam.',
      );
    } catch {
      toast.error('Error de red. Inténtalo de nuevo.');
    } finally {
      setBusyVerifyResend(false);
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
  // ── Stripe SetupIntent return handler (comentado — Paddle maneja esto en su portal) ──
  // useEffect(() => {
  //   if (typeof window === 'undefined') return;
  //   const params = new URLSearchParams(window.location.search);
  //   if (params.get('setup') !== 'return') return;
  //   const clientSecret = params.get('setup_intent_client_secret');
  //   if (!clientSecret) return;
  //   (async () => {
  //     const p = getStripePromise();
  //     if (!p) return;
  //     const stripe = await p;
  //     if (!stripe) return;
  //     const { setupIntent, error } = await stripe.retrieveSetupIntent(clientSecret);
  //     ...
  //     window.history.replaceState({}, '', '/dashboard/settings');
  //   })();
  // }, [refresh]);

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

  const hasActivePaidPlan =
    isPremium &&
    subscription?.status &&
    ['active', 'trialing', 'past_due'].includes(subscription.status);

  const emailVerified = user?.emailVerified ?? true;
  const billingRestricted = !emailVerified && !user?.impersonation;

  return (
    <div className="relative overflow-hidden min-h-full">
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_R, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_B, top: '100px', left: '-120px' }} />

      <div className="relative max-w-2xl mx-auto px-6 py-10">
      <UpdatePaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSaved={() => refresh({ silent: true })}
      />

      <div className="badge-primary mb-3 w-fit">
        <Sparkles size={13} />
        Configuración
      </div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight m-0 flex items-center gap-2 flex-wrap">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${BRAND_R}12`, border: `1px solid ${BRAND_R}28` }}
        >
          <Settings size={20} style={{ color: BRAND_R }} strokeWidth={1.75} />
        </span>
        <span>
          <span className="gradient-text">Ajustes</span>
        </span>
      </h1>
      <p className="text-sm mt-2 mb-8 m-0" style={{ color: 'var(--muted-foreground)' }}>
        Información de tu cuenta y suscripción — misma línea visual que el resto del dashboard.
      </p>

      {/* Account info */}
      <div className="rounded-2xl overflow-hidden border mb-5 card-texture" style={{ borderColor: 'var(--border)' }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${BRAND_R}, ${BRAND_B})` }} />
        <div className="p-6">
        <h2 className="text-[15px] font-bold m-0 mb-4">Cuenta</h2>

        {billingRestricted && (
          <div
            className="rounded-xl border p-4 mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            style={{
              borderColor: 'rgba(217,119,6,0.4)',
              background: 'linear-gradient(135deg, rgba(217,119,6,0.1), rgba(228,20,20,0.06))',
            }}
          >
            <div className="flex gap-3 min-w-0">
              <AlertTriangle className="shrink-0 mt-0.5" size={20} style={{ color: '#d97706' }} />
              <div className="min-w-0">
                <p className="text-sm font-bold m-0" style={{ color: 'var(--foreground)' }}>
                  Verifica tu correo para continuar
                </p>
                <p className="text-xs m-0 mt-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                  Es necesario verificar tu correo para continuar y disfrutar de todas las funcionalidades de la plataforma.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busyVerifyResend}
              onClick={resendVerificationFromSettings}
              className="inline-flex items-center justify-center shrink-0 px-4 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
                color: '#fff',
                boxShadow: '0 4px 14px rgba(228,20,20,0.22)',
              }}
            >
              {busyVerifyResend ? 'Enviando…' : 'Reenviar correo de verificación'}
            </button>
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '6px' }}>Nombre</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              maxLength={120}
              placeholder="Tu nombre"
              disabled={billingRestricted}
              style={{
                flex: '1 1 200px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontSize: '14px',
                opacity: billingRestricted ? 0.65 : 1,
              }}
            />
            <button
              type="button"
              disabled={busyProfile || !user || billingRestricted}
              onClick={saveDisplayName}
              className="px-4 py-2.5 rounded-xl font-bold text-[13px] border transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                background: `${BRAND_R}12`,
                color: BRAND_R,
                borderColor: `${BRAND_R}35`,
                cursor: busyProfile ? 'wait' : billingRestricted ? 'not-allowed' : 'pointer',
              }}
            >
              {busyProfile ? 'Guardando…' : 'Guardar nombre'}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>
              Email actual
            </span>
            {emailVerified ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#15803d' }}
              >
                <CheckCircle2 size={12} strokeWidth={2.5} />
                Verificado
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }}
              >
                <AlertTriangle size={12} strokeWidth={2.5} />
                Sin verificar
              </span>
            )}
          </div>
          <p className="text-sm font-semibold m-0 mt-1.5 break-all">{user?.email || '—'}</p>
          {!emailVerified && (
            <p className="text-[11px] m-0 mt-2 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Abre el enlace del último correo o pulsa{' '}
              <button
                type="button"
                disabled={busyVerifyResend}
                onClick={resendVerificationFromSettings}
                className="font-bold landing-link-accent border-0 bg-transparent cursor-pointer p-0 disabled:opacity-60"
              >
                reenviar aquí
              </button>
              .
            </p>
          )}
        </div>

        {!billingRestricted && user?.pendingEmail ? (
          <div
            className="rounded-xl p-3.5 mb-4 border"
            style={{
              borderColor: `${BRAND_B}40`,
              background: `linear-gradient(135deg, rgba(0,172,248,0.08), rgba(228,20,20,0.05))`,
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
                className="px-4 py-2.5 rounded-xl font-bold text-[13px] text-white border-0 transition-opacity"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
                  boxShadow: emailCode.length === 6 ? '0 4px 14px rgba(228,20,20,0.25)' : undefined,
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

        {!billingRestricted ? (
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
              className="px-4 py-2.5 rounded-xl font-bold text-[13px] border transition-opacity"
              style={{
                background: `${BRAND_R}12`,
                color: BRAND_R,
                borderColor: `${BRAND_R}35`,
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
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <Row
            label="User ID"
            value={user?.uid || '—'}
            action={
              <button
                type="button"
                onClick={copyUserId}
                className="text-[11px] font-bold border-0 bg-transparent cursor-pointer landing-link-accent"
              >
                {copyMsg || 'Copiar'}
              </button>
            }
          />
        </div>
        </div>
      </div>

      {/* Subscription info */}
      <div className="rounded-2xl overflow-hidden border card-texture" style={{ borderColor: 'var(--border)' }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${BRAND_B}, ${BRAND_O})` }} />
        <div className="p-6">
        <h2 className="text-[15px] font-bold m-0 mb-4">Suscripción y facturación</h2>

        {billingMsg && (
          <p className="text-[13px] mb-4 m-0 leading-snug font-medium" style={{ color: 'var(--primary)' }}>
            {billingMsg}
          </p>
        )}

        {!loading && <SubscriptionPlanPanel checkoutDisabled={billingRestricted} />}

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
                  Suscripción (LemonSqueezy)
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
          Los cambios de plan (subida o bajada) usan prorrateo de LemonSqueezy sobre el periodo de facturación actual; el detalle
          del cargo aparece en tu portal de LemonSqueezy.
          {billingRestricted ? ' Verifica tu correo para habilitar cambios de plan.' : ''}
        </p>

        {!loading && isPremium && hasActivePaidPlan && (
          <>
            <div
              className="rounded-xl p-4 border mb-4 card-texture"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="text-[13px] font-bold mb-2.5 m-0">Método de pago y facturas</p>
              <p className="text-[11px] m-0 mb-2.5 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                LemonSqueezy abre una página segura para actualizar la tarjeta. Las facturas listadas vienen de tus transacciones
                completadas en LemonSqueezy.
              </p>
              <button
                type="button"
                disabled={!!busy || billingRestricted}
                onClick={() => setPaymentModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] border mb-3.5 transition-opacity hover:opacity-95"
                style={{
                  background: `${BRAND_R}12`,
                  color: BRAND_R,
                  borderColor: `${BRAND_R}35`,
                  cursor: busy || billingRestricted ? 'not-allowed' : 'pointer',
                  opacity: billingRestricted ? 0.55 : 1,
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
                Abrir portal de cliente de LemonSqueezy (facturación y datos de pago)
              </button>

              {subscription?.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={resume}
                  className="px-4 py-2.5 rounded-xl font-bold text-[13px] border transition-opacity"
                  style={{
                    background: `${BRAND_R}12`,
                    color: BRAND_R,
                    borderColor: `${BRAND_R}35`,
                    cursor: busy ? 'wait' : 'pointer',
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
