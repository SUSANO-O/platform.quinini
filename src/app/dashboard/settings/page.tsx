'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { SubscriptionPlanPanel } from '@/components/dashboard/subscription-plan-panel';
import { UpdatePaymentModal } from '@/components/billing/update-payment-modal';
import { InvoiceList } from '@/components/billing/invoice-list';
// import { getStripePromise } from '@/lib/stripe-client'; // Stripe — comentado
import { useEffect, useState, useRef, type ChangeEvent } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, Settings, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AvatarEditor } from '@/components/ui/AvatarEditor';
import { UserAvatar } from '@/components/shared/user-avatar';
import {
  PLAN_DISPLAY,
  PLAN_ORDER,
  PLAN_RAG_LIMITS,
  PLAN_FEATURE_BULLETS,
  PLAN_CONVERSATION_LIMITS,
  PAID_PLAN_IDS,
  planRank,
} from '@/lib/plan-catalog';

import { BRAND, PREMIUM, STATE, PLAN_ACCENTS } from '@/lib/brand-colors';

interface RagUsageData {
  plan: string;
  ragEnabled: boolean;
  maxSourcesPerAgent: number;
  maxStorageMbPerAgent: number;
  totals: { usedSources: number; usedBytes: number };
  perAgent: Array<{
    id: string;
    name: string;
    ragEnabled: boolean;
    usedSources: number;
    usedBytes: number;
    percentSources: number;
    percentStorage: number;
  }>;
}

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
    startCheckout,
    loading,
    refresh,
  } = useSubscription();
  const [copyMsg, setCopyMsg] = useState('');
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [waPhoneDraft, setWaPhoneDraft] = useState('');
  const [busyWaPhone, setBusyWaPhone] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const [avatarEditorUrl, setAvatarEditorUrl] = useState<string | null>(null);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [busyEmailReq, setBusyEmailReq] = useState(false);
  const [busyEmailConfirm, setBusyEmailConfirm] = useState(false);
  const [busyVerifyResend, setBusyVerifyResend] = useState(false);
  const [ragUsage, setRagUsage] = useState<RagUsageData | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayNameDraft(user.displayName ?? '');
    setWaPhoneDraft((user as { escalationWhatsAppPhone?: string | null }).escalationWhatsAppPhone ?? '');
  }, [user?.uid, user?.displayName]);

  async function saveWaPhone() {
    setBusyWaPhone(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escalationWhatsAppPhone: waPhoneDraft.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Error al guardar.');
      } else {
        toast.success('Número de WhatsApp guardado.');
        await refreshUser();
      }
    } finally {
      setBusyWaPhone(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    if (user.pendingEmail) {
      setNewEmail(user.pendingEmail);
    } else {
      setNewEmail('');
      setEmailCode('');
    }
  }, [user?.uid, user?.pendingEmail]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/rag-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setRagUsage(data as RagUsageData);
      })
      .catch(() => {});
  }, [user?.uid, subscription?.plan, subscription?.status]);

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

  async function saveAvatar(url: string) {
    if (!user) return;
    setBusyAvatar(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: url }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo guardar la foto.');
        return;
      }
      toast.success('Foto de perfil actualizada.');
      await refreshUser();
    } finally {
      setBusyAvatar(false);
    }
  }

  async function removeAvatar() {
    if (!user) return;
    setBusyAvatar(true);
    try {
      const r = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl: null }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo quitar la foto.');
        return;
      }
      toast.success('Foto de perfil eliminada.');
      await refreshUser();
    } finally {
      setBusyAvatar(false);
    }
  }

  function openAvatarEditor(url: string) {
    setAvatarEditorUrl(url);
    setAvatarEditorOpen(true);
  }

  function closeAvatarEditor() {
    setAvatarEditorOpen(false);
    setAvatarEditorUrl(null);
  }

  function onAvatarFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona un archivo de imagen.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx. 15 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') openAvatarEditor(reader.result);
    };
    reader.readAsDataURL(file);
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
    setBusy('cancel');
    setBillingMsg(null);
    const r = await cancelSubscription(true);
    setBusy(null);
    setShowCancelConfirm(false);
    if (r && 'error' in r && r.error) {
      toast.error(r.error);
      setBillingMsg(r.error);
    } else if (r && 'message' in r && r.message) {
      toast.success(r.message);
      setBillingMsg(r.message);
    }
  }

  async function resume() {
    setBusy('resume');
    setBillingMsg(null);
    const r = await resumeSubscription();
    setBusy(null);
    if (r && 'error' in r && r.error) setBillingMsg(r.error);
    else if (r && 'message' in r && r.message) setBillingMsg(r.message);
  }

  async function handlePlanCheckout(planId: string) {
    if (billingRestricted) return;
    setPlanBusy(planId);
    const r = await startCheckout(planId);
    setPlanBusy(null);
    if (r && 'error' in r && r.error) toast.error(r.error);
  }

  const hasActivePaidPlan =
    isPremium &&
    subscription?.status &&
    ['active', 'trialing', 'past_due'].includes(subscription.status);

  const emailVerified = user?.emailVerified ?? true;
  const billingRestricted = !emailVerified && !user?.impersonation;

  return (
    <div className="relative overflow-hidden min-h-full">
      <div className="hero-glow pointer-events-none" style={{ background: BRAND.primary, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND.cool, top: '100px', left: '-120px' }} />

      <div className="relative max-w-2xl mx-auto px-4 py-4">
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancelar suscripción"
        description="¿Programar la cancelación al final del periodo actual? Seguirás con acceso hasta esa fecha."
        confirmLabel="Programar cancelación"
        variant="danger"
        loading={busy === 'cancel'}
        onConfirm={() => void scheduleCancel()}
        onCancel={() => setShowCancelConfirm(false)}
      />
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
          style={{ background: `${BRAND.primary}12`, border: `1px solid ${BRAND.primary}28` }}
        >
          <Settings size={20} style={{ color: BRAND.primary }} strokeWidth={1.75} />
        </span>
        <span>
          <span className="gradient-text">Ajustes</span>
        </span>
      </h1>
      <p className="text-sm mt-2 mb-4 m-0" style={{ color: 'var(--muted-foreground)' }}>
        Información de tu cuenta y suscripción — misma línea visual que el resto del dashboard.
      </p>

      <nav
        className="sticky top-[52px] md:top-0 z-10 flex flex-wrap gap-2 mb-6 p-2 rounded-xl border card-texture"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        aria-label="Secciones de ajustes"
      >
        {[
          { id: 'settings-account', label: 'Cuenta' },
          { id: 'settings-security', label: 'Seguridad' },
          { id: 'settings-billing', label: 'Plan' },
          { id: 'settings-rag-limits', label: 'Almacenamiento' },
          { id: 'settings-invoices', label: 'Facturas' },
        ].map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold no-underline transition-colors hover:opacity-90"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* Account info */}
      <div id="settings-account" className="scroll-mt-24 rounded-2xl overflow-hidden border mb-5 card-texture" style={{ borderColor: 'var(--border)' }} data-tour="settings-account">
        <div style={{ height: 3, background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.cool})` }} />
        <div className="p-6">
        <h2 className="text-[15px] font-bold m-0 mb-4">Cuenta</h2>

        {billingRestricted && (
          <div
            className="rounded-xl border p-4 mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            style={{
              borderColor: 'rgba(217,119,6,0.4)',
              background: 'linear-gradient(135deg, rgba(217,119,6,0.1), rgba(var(--brand-primary-rgb),0.06))',
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
                background: BRAND.primary,
                color: '#fff',
                boxShadow: '0 4px 14px rgba(var(--brand-primary-rgb),0.22)',
              }}
            >
              {busyVerifyResend ? 'Enviando…' : 'Reenviar correo de verificación'}
            </button>
          </div>
        )}

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '10px' }}>
            Foto de perfil
          </label>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <UserAvatar
              displayName={user?.displayName}
              email={user?.email ?? ''}
              avatarUrl={user?.avatarUrl}
              size={72}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
              <label
                htmlFor="profile-avatar-upload"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-bold text-[13px] border transition-opacity hover:opacity-95 cursor-pointer"
                style={{
                  background: `${BRAND.primary}12`,
                  color: BRAND.primary,
                  borderColor: `${BRAND.primary}35`,
                  opacity: billingRestricted || busyAvatar ? 0.6 : 1,
                  pointerEvents: billingRestricted || busyAvatar ? 'none' : undefined,
                }}
              >
                {busyAvatar ? 'Guardando…' : 'Subir imagen'}
              </label>
              <input
                id="profile-avatar-upload"
                type="file"
                accept="image/*"
                hidden
                disabled={billingRestricted || busyAvatar}
                onChange={onAvatarFileSelected}
              />
              {user?.avatarUrl ? (
                <button
                  type="button"
                  disabled={busyAvatar || billingRestricted}
                  onClick={() => openAvatarEditor(user.avatarUrl!)}
                  className="inline-flex items-center justify-start px-0 py-1 text-xs font-semibold border-0 bg-transparent cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-60"
                  style={{ color: '#6366f1' }}
                >
                  Editar · Centrar · Retocar
                </button>
              ) : null}
              {user?.avatarUrl ? (
                <button
                  type="button"
                  disabled={busyAvatar || billingRestricted}
                  onClick={removeAvatar}
                  className="inline-flex items-center justify-start px-0 py-1 text-xs font-semibold border-0 bg-transparent cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-60"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Quitar foto
                </button>
              ) : null}
              <p className="text-[11px] m-0 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                Tras subir, podrás centrar y retocar antes de guardar. Se optimiza a menos de 600 KB.
              </p>
            </div>
          </div>
        </div>

        {avatarEditorUrl ? (
          <AvatarEditor
            currentUrl={avatarEditorUrl}
            open={avatarEditorOpen}
            onOpenChange={(next) => {
              setAvatarEditorOpen(next);
              if (!next) setAvatarEditorUrl(null);
            }}
            hideTrigger
            visibleTabs={['crop', 'filters']}
            title="Ajustar foto de perfil"
            cropHint="Arrastra para centrar y ajusta el zoom. En Retocar puedes mejorar brillo y contraste."
            exportSize={512}
            applyLabel="Guardar foto"
            onResult={(url) => {
              closeAvatarEditor();
              void saveAvatar(url);
            }}
          />
        ) : null}

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
                background: `${BRAND.primary}12`,
                color: BRAND.primary,
                borderColor: `${BRAND.primary}35`,
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
              borderColor: `${BRAND.cool}40`,
              background: `linear-gradient(135deg, rgba(var(--brand-cool-rgb),0.08), rgba(var(--brand-primary-rgb),0.05))`,
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
                  background: BRAND.primary,
                  boxShadow: emailCode.length === 6 ? '0 4px 14px rgba(var(--brand-primary-rgb),0.25)' : undefined,
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
                background: `${BRAND.primary}12`,
                color: BRAND.primary,
                borderColor: `${BRAND.primary}35`,
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

      {/* Security / 2FA */}
      <TwoFactorSection />

      {/* Notificaciones — WhatsApp personal */}
      <div id="settings-notifications" className="scroll-mt-24 rounded-2xl overflow-hidden border card-texture" style={{ borderColor: 'var(--border)' }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, #25D366, #128C7E)` }} />
        <div className="p-6">
          <h2 className="text-[15px] font-bold m-0 mb-1">Notificaciones de WhatsApp</h2>
          <p className="text-[13px] m-0 mb-5" style={{ color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            Cuando un visitante del widget pide hablar con una persona, recibirás un mensaje en tu WhatsApp personal
            y podrás responderle directamente desde ahí.
          </p>
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
            Tu número de WhatsApp personal
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="tel"
              value={waPhoneDraft}
              onChange={(e) => setWaPhoneDraft(e.target.value)}
              placeholder="+57 313 3174629"
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
              disabled={busyWaPhone}
              onClick={() => void saveWaPhone()}
              className="px-4 py-2.5 rounded-xl font-bold text-[13px] border transition-opacity"
              style={{
                background: '#25D36614',
                color: '#128C7E',
                borderColor: '#25D36635',
                cursor: busyWaPhone ? 'wait' : 'pointer',
              }}
            >
              {busyWaPhone ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          <p className="text-[12px] mt-2 m-0" style={{ color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
            Incluye el código de país. Para responder al visitante, usa <strong>Responder (Reply)</strong> al mensaje de alerta en WhatsApp.
          </p>
        </div>
      </div>

      {/* Subscription info */}
      <div id="settings-billing" className="scroll-mt-24 rounded-2xl overflow-hidden border card-texture" style={{ borderColor: 'var(--border)' }} data-tour="settings-billing">
        <div style={{ height: 3, background: `linear-gradient(90deg, ${BRAND.cool}, ${BRAND.warm})` }} />
        <div className="p-6">
        <h2 className="text-[15px] font-bold m-0 mb-4">Suscripción y facturación</h2>

        {billingMsg && (
          <p className="text-[13px] mb-4 m-0 leading-snug font-medium" style={{ color: 'var(--primary)' }}>
            {billingMsg}
          </p>
        )}

        {/* ── Plan cards grid ─────────────────────────────────────────────── */}
        {!loading && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3 m-0" style={{ color: 'var(--muted-foreground)' }}>
              Planes disponibles
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PAID_PLAN_IDS.map((planId) => {
                const display = PLAN_DISPLAY[planId];
                const bullets = PLAN_FEATURE_BULLETS[planId];
                const convLimit = PLAN_CONVERSATION_LIMITS[planId];
                const isPopular = planId === 'plus';
                const effectivePlan = hasActivePaidPlan ? (subscription?.plan ?? 'free') : 'free';
                const isCurrent =
                  subscription?.plan === planId &&
                  ['active', 'trialing', 'past_due'].includes(subscription?.status ?? '');
                const isUpgrade = planRank(planId) > planRank(effectivePlan);
                const ACCENT = PLAN_ACCENTS;
                const accent = ACCENT[planId] ?? BRAND.primary;

                return (
                  <div
                    key={planId}
                    className="rounded-2xl border overflow-hidden flex flex-col"
                    style={{
                      borderColor: isPopular ? PREMIUM.border : isCurrent ? `${BRAND.primary}40` : 'var(--border)',
                      background: isPopular
                        ? PREMIUM.gradient
                        : isCurrent
                        ? `${BRAND.primary}06`
                        : 'var(--card)',
                      position: 'relative',
                    }}
                  >
                    {isPopular && (
                      <div
                        className="absolute top-3 right-3 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: PREMIUM.accent, color: '#000' }}
                      >
                        Popular
                      </div>
                    )}
                    <div style={{ height: 3, background: `linear-gradient(90deg,${accent},${accent}88)` }} />
                    <div className="p-4 flex flex-col flex-1">
                      <div className="mb-3">
                        <p className="text-[14px] font-extrabold m-0 capitalize">{display.label}</p>
                        <p
                          className="text-[22px] font-black m-0 mt-0.5"
                          style={{ letterSpacing: '-0.04em', color: accent }}
                        >
                          {display.priceLabel}
                        </p>
                        <p className="text-[11px] m-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          {convLimit === -1
                            ? 'conversaciones ilimitadas'
                            : `${convLimit.toLocaleString('es')} conv/mes`}
                        </p>
                      </div>

                      <ul className="list-none p-0 m-0 flex flex-col gap-1.5 flex-1 mb-4">
                        {bullets.slice(0, 4).map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px]">
                            <CheckCircle2 size={11} className="mt-0.5 shrink-0" style={{ color: accent }} />
                            <span style={{ color: 'var(--muted-foreground)' }}>{b}</span>
                          </li>
                        ))}
                      </ul>

                      <button
                        type="button"
                        disabled={isCurrent || !!planBusy || billingRestricted}
                        onClick={() => handlePlanCheckout(planId)}
                        className="w-full py-2.5 rounded-xl font-bold text-[12px] border-0 transition-opacity hover:opacity-90"
                        style={{
                          background: isCurrent
                            ? 'var(--muted)'
                            : accent,
                          color: isCurrent ? 'var(--muted-foreground)' : '#fff',
                          cursor: isCurrent || planBusy || billingRestricted ? 'not-allowed' : 'pointer',
                          opacity: billingRestricted ? 0.55 : 1,
                          boxShadow: !isCurrent ? `0 4px 14px ${accent}30` : undefined,
                        }}
                      >
                        {planBusy === planId
                          ? 'Procesando…'
                          : isCurrent
                          ? 'Plan actual ✓'
                          : isUpgrade
                          ? 'Mejorar plan →'
                          : 'Seleccionar →'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && <SubscriptionPlanPanel checkoutDisabled={billingRestricted} />}

        {ragUsage && (
          <div
            id="settings-rag-limits"
            className="scroll-mt-24 rounded-xl border p-4 mb-5 card-texture"
            style={{ borderColor: 'var(--border)' }}
            data-tour="settings-rag-limits"
          >
            <p className="text-[13px] font-bold m-0 mb-1">Límites de almacenamiento y administración</p>
            <p className="text-[11px] m-0 mb-3 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
              Límite técnico por agente en tu plan actual:{' '}
              {ragUsage.ragEnabled
                ? `${ragUsage.maxStorageMbPerAgent.toLocaleString('es')} MB o ${ragUsage.maxSourcesPerAgent.toLocaleString('es')} fuentes`
                : 'Almacenamiento no incluido en este plan'}
              .
            </p>

            <div
              className="rounded-lg px-3 py-2 mb-3"
              style={{ background: 'rgba(15,23,42,0.04)', border: '1px solid rgba(15,23,42,0.08)' }}
            >
              <p className="text-[11px] m-0" style={{ color: 'var(--muted-foreground)' }}>
                Uso total actual: {ragUsage.totals.usedSources.toLocaleString('es')} fuentes ·{' '}
                {formatMb(ragUsage.totals.usedBytes)}
              </p>
            </div>

            <div className="mb-3" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PLAN_ORDER.map((planId) => {
                const planLabel = PLAN_DISPLAY[planId]?.label ?? planId;
                const limit = PLAN_RAG_LIMITS[planId];
                const isCurrent = ragUsage.plan === planId;
                return (
                  <div
                    key={planId}
                    className="rounded-lg px-3 py-2"
                    style={{
                      border: isCurrent ? `1px solid ${BRAND.primary}40` : '1px solid var(--border)',
                      background: isCurrent ? `${BRAND.primary}10` : 'var(--background)',
                    }}
                  >
                    <p className="text-[11px] m-0">
                      <strong>{planLabel}</strong>{' '}
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        — {limit ? `${limit.mb.toLocaleString('es')} MB / ${limit.sources.toLocaleString('es')} fuentes por agente` : 'sin almacenamiento'}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>

            {ragUsage.ragEnabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ragUsage.perAgent.length === 0 ? (
                  <p className="text-[11px] m-0" style={{ color: 'var(--muted-foreground)' }}>
                    Aún no tienes agentes propios para administrar almacenamiento.
                  </p>
                ) : (
                  ragUsage.perAgent.map((agent) => (
                    <div
                      key={agent.id}
                      className="rounded-lg p-3"
                      style={{ border: '1px solid var(--border)', background: 'var(--background)' }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-[12px] font-semibold m-0">{agent.name}</p>
                        <Link href={`/dashboard/agents/${agent.id}`} className="text-[11px] font-bold landing-link-accent">
                          Administrar
                        </Link>
                      </div>
                      <p className="text-[11px] m-0" style={{ color: 'var(--muted-foreground)' }}>
                        {agent.usedSources.toLocaleString('es')} / {ragUsage.maxSourcesPerAgent.toLocaleString('es')} fuentes ·{' '}
                        {formatMb(agent.usedBytes)} / {ragUsage.maxStorageMbPerAgent.toLocaleString('es')} MB
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <p className="text-[11px] m-0" style={{ color: 'var(--muted-foreground)' }}>
                Para administrar fuentes y almacenamiento, cambia a un plan con almacenamiento.
              </p>
            )}
          </div>
        )}

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
                  background: `${BRAND.primary}12`,
                  color: BRAND.primary,
                  borderColor: `${BRAND.primary}35`,
                  cursor: busy || billingRestricted ? 'not-allowed' : 'pointer',
                  opacity: billingRestricted ? 0.55 : 1,
                }}
              >
                <CreditCard size={16} />
                Actualizar método de pago
              </button>
            <div id="settings-invoices" className="scroll-mt-24 mt-4">
              <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--foreground)' }}>Facturas recientes</p>
              <p style={{ fontSize: '11px', margin: '0 0 8px', color: 'var(--muted-foreground)' }}>
                <Link href="/dashboard/facturas" style={{ color: 'var(--brand-cool)', fontWeight: 600 }}>
                  Abrir Facturas y recibos →
                </Link>
                {' '}(datos fiscales y descarga PDF)
              </p>
              <InvoiceList showGenerate={false} />
            </div>
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
                    background: `${BRAND.primary}12`,
                    color: BRAND.primary,
                    borderColor: `${BRAND.primary}35`,
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  Mantener suscripción (anular cancelación)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setShowCancelConfirm(true)}
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

function TwoFactorSection() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/2fa/status').then(r => r.json()).then(d => setEnabled(d.enabled ?? false)).catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/auth/2fa/setup');
    setBusy(false);
    if (!r.ok) { const d = await r.json(); setMsg({ ok: false, text: d.error }); return; }
    const d = await r.json();
    setQrCode(d.qrCode); setSecret(d.secret); setCode(''); setStep('setup');
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch('/api/auth/2fa/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error }); return; }
    setEnabled(true); setStep('idle'); setMsg({ ok: true, text: 'Autenticación en dos pasos activada.' });
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch('/api/auth/2fa/setup', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: d.error }); return; }
    setEnabled(false); setStep('idle'); setPassword(''); setMsg({ ok: true, text: 'Autenticación en dos pasos desactivada.' });
  }

  const cardStyle: React.CSSProperties = { padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', marginBottom: '12px' };

  return (
    <div id="settings-security" className="scroll-mt-24 rounded-2xl overflow-hidden border mb-5 card-texture" style={{ borderColor: 'var(--border)' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
      <div style={{ padding: '20px 20px 24px' }}>
        <h2 className="text-[15px] font-bold m-0 mb-4">Seguridad</h2>

        {/* Estado actual */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {enabled
              ? <ShieldCheck size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
              : <ShieldOff size={18} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />}
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Autenticación en dos pasos (2FA)</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                {enabled === null ? 'Cargando…' : enabled ? 'Activado — tu cuenta está protegida con TOTP.' : 'Desactivado — actívalo para mayor seguridad.'}
              </p>
            </div>
          </div>
          {step === 'idle' && enabled !== null && (
            <button
              type="button"
              onClick={() => { setMsg(null); enabled ? setStep('disable') : startSetup(); }}
              disabled={busy}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                background: enabled ? 'transparent' : 'var(--brand-primary)',
                color: enabled ? 'var(--muted-foreground)' : '#fff',
                border: enabled ? '1px solid var(--border)' : 'none',
              }}
            >
              {enabled ? 'Desactivar' : 'Activar 2FA'}
            </button>
          )}
        </div>

        {/* Paso: escanear QR */}
        {step === 'setup' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>1. Escanea el código QR con tu app autenticadora</p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted-foreground)' }}>
              Usa Google Authenticator, Authy o cualquier app compatible con TOTP.
            </p>
            {qrCode && <img src={qrCode} alt="QR 2FA" style={{ width: 180, height: 180, borderRadius: 8, display: 'block', marginBottom: 12 }} />}
            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--muted-foreground)' }}>O introduce el código manual:</p>
            <code style={{ fontSize: 11, letterSpacing: '0.1em', background: 'var(--muted)', padding: '4px 8px', borderRadius: 6, display: 'inline-block', marginBottom: 16 }}>{secret}</code>

            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>2. Ingresa el código de 6 dígitos para confirmar</p>
            <form onSubmit={confirmSetup} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text" inputMode="numeric" maxLength={6} pattern="\d{6}"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000" required autoFocus
                style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 18, fontFamily: 'monospace', letterSpacing: '0.2em', textAlign: 'center', background: 'var(--background)' }}
              />
              <button type="submit" disabled={busy || code.length < 6}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Verificando…' : 'Confirmar'}
              </button>
              <button type="button" onClick={() => setStep('idle')}
                style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </form>
          </div>
        )}

        {/* Paso: desactivar */}
        {step === 'disable' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Confirma tu contraseña para desactivar 2FA</p>
            <form onSubmit={confirmDisable} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Tu contraseña actual" required autoFocus
                style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--background)' }}
              />
              <button type="submit" disabled={busy || !password}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Verificando…' : 'Desactivar 2FA'}
              </button>
              <button type="button" onClick={() => { setStep('idle'); setPassword(''); }}
                style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </form>
          </div>
        )}

        {msg && (
          <p style={{ margin: 0, fontSize: 13, padding: '10px 14px', borderRadius: 8, background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: msg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            {msg.text}
          </p>
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

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 100) return `${Math.round(mb).toLocaleString('es')} MB`;
  return `${mb.toFixed(1)} MB`;
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
