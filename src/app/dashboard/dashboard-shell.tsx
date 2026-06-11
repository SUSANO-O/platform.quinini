'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAuthSplashLoading } from '@/hooks/use-auth-splash-loading';
import { SubscriptionProvider, useSubscription } from '@/hooks/use-subscription';
import { QueryProvider } from '@/providers/query-provider';
import { AiLoadingScreen } from '@/components/ui/ai-loading-screen';
import { DashboardSidebar, SIDEBAR_COLLAPSED_PX } from '@/components/dashboard/dashboard-sidebar';
import { DashboardMobileNav } from '@/components/dashboard/dashboard-mobile-nav';
import { TourProvider, useTour } from '@/components/onboarding/app-tour';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
// import { initPaddleClient } from '@/lib/paddle-client'; // Paddle — comentado
import { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert,
  Route,
  RotateCcw,
} from 'lucide-react';
import { LandingAccessGate } from '@/components/auth/landing-access-gate';

import { CHECKOUT_UPGRADE_PLAN_IDS, PLAN_DISPLAY } from '@/lib/plan-catalog';
import { buildTrialExpiredWhatsAppUrl } from '@/lib/sales-whatsapp';

const SIDEBAR_COLLAPSED_KEY = 'dashboard-sidebar-collapsed';


function SubscriptionExpiryGate() {
  const { user, logout } = useAuth();
  const { loading, hasAccess, isTrialActive, authExpired, subscription } = useSubscription();

  const trialExpired = useMemo(
    () => Boolean(user) && !authExpired && !loading && !hasAccess && !isTrialActive,
    [user, authExpired, loading, hasAccess, isTrialActive],
  );
  const expiredAt = subscription?.trialEndsAt
    ? new Date(subscription.trialEndsAt).toLocaleDateString('es', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;

  if (!trialExpired || authExpired) return null;

  // Bloqueo permanente — no se puede cerrar. Solo suscribirse o cerrar sesión.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-expired-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(2,6,23,0.72)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="card-texture"
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '18px',
          border: '1px solid rgba(255,255,255,0.24)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
          background: 'linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.07))',
          backdropFilter: 'blur(14px)',
          color: '#f8fafc',
          padding: '28px 24px',
        }}
      >
        <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.78 }}>
          Trial finalizado
        </p>
        <h3 id="trial-expired-title" style={{ margin: '8px 0 12px', fontSize: '22px', lineHeight: 1.18 }}>
          Tu período de prueba expiró
        </h3>

        <p style={{ margin: '0 0 20px', color: 'rgba(241,245,249,0.96)', lineHeight: 1.5 }}>
          {expiredAt
            ? `Tu prueba gratuita terminó el ${expiredAt}.`
            : 'Tu prueba gratuita ya terminó.'}{' '}
          Elige un plan y contáctanos por WhatsApp para activarlo, o cierra sesión.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {CHECKOUT_UPGRADE_PLAN_IDS.map((planId) => {
            const plan = PLAN_DISPLAY[planId];
            return (
              <a
                key={planId}
                href={buildTrialExpiredWhatsAppUrl(plan.label, plan.priceLabel)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  border: 0,
                  borderRadius: '10px',
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#fff',
                  cursor: 'pointer',
                  background: 'var(--brand-primary)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {plan.label} · {plan.priceLabel}
              </a>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void logout().then(() => { window.location.href = '/login'; })}
          style={{
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#fff',
            cursor: 'pointer',
            background: 'transparent',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function SidebarExpiryBadge() {
  const { loading, hasAccess, isTrialActive } = useSubscription();
  if (loading || hasAccess || isTrialActive) return null;
  return (
    <div style={{
      marginBottom: '12px',
      padding: '10px 12px',
      borderRadius: '12px',
      border: 'none',
      background: 'var(--muted)',
      boxShadow: '0 2px 12px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>
        Período de prueba finalizado
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {CHECKOUT_UPGRADE_PLAN_IDS.map((planId) => {
          const plan = PLAN_DISPLAY[planId];
          return (
          <a
            key={planId}
            href={buildTrialExpiredWhatsAppUrl(plan.label, plan.priceLabel)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              border: 0,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              background: 'var(--brand-primary)',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            {plan.label} · {plan.priceLabel}
          </a>
        );})}
      </div>
    </div>
  );
}

function JourneyProgress() {
  const { journeyPercent, journeyComplete, completedCount, totalStages, currentStageLabel } = useTour();

  /** Con el camino al 100% no mostramos la tarjeta de progreso (evita que el "100%" quede fijo en el sidebar). */
  if (journeyComplete) return null;

  return (
    <div
      className="card-texture"
      style={{
        marginBottom: '14px',
        padding: '12px 12px 14px',
        borderRadius: '12px',
        border: 'none',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(241,244,248,0.65))',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.75)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
          Camino trial
        </span>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--foreground)' }}>{journeyPercent}%</span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '999px',
          background: 'linear-gradient(90deg, rgba(15,23,42,0.06), rgba(15,23,42,0.1))',
          overflow: 'hidden',
          border: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${journeyPercent}%`,
            borderRadius: '999px',
            background: 'var(--brand-primary)',
            transition: 'width 0.45s ease',
            boxShadow: '0 0 12px rgba(var(--brand-primary-rgb),0.25)',
          }}
        />
      </div>
      <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '8px 0 0', lineHeight: 1.45 }}>
        {`Etapa actual: ${currentStageLabel ?? '…'} · ${completedCount}/${totalStages} etapas`}
      </p>
    </div>
  );
}

function TourActions() {
  const { startTour, resetJourney, journeyComplete } = useTour();

  return (
    <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
      {!journeyComplete && (
      <button
        type="button"
        onClick={() => startTour()}
        className="dashboard-sidebar-tour-btn dashboard-sidebar-tour-btn--primary"
      >
        <Route size={14} />
        Iniciar guía
      </button>
      )}
      <button
        type="button"
        onClick={() => {
          resetJourney();
          startTour();
        }}
        className="dashboard-sidebar-tour-btn dashboard-sidebar-tour-btn--ghost"
      >
        <RotateCcw size={14} />
        Reiniciar guía
      </button>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, stopImpersonating, landingAccessLockRequired, clearLandingAccessLock, refreshUser } = useAuth();
  const showSplash = useAuthSplashLoading(loading);
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* noop */
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  };

  useEffect(() => {
    if (!showSplash && !user) router.push('/login');
  }, [user, showSplash, router]);

  if (showSplash) {
    return <AiLoadingScreen />;
  }

  if (!user) return null;

  if (landingAccessLockRequired) {
    return (
      <LandingAccessGate
        mode="session"
        onVerified={async () => {
          clearLandingAccessLock();
          await refreshUser();
        }}
      />
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <QueryProvider>
    <SubscriptionProvider>
      <TourProvider>
      <SubscriptionExpiryGate />
      <div
        className="dashboard-root-texture"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          background: 'var(--background)',
        }}
      >
        {user.impersonation && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '10px 16px',
              background: 'linear-gradient(90deg, rgba(234,179,8,0.18), rgba(220,38,38,0.12))',
              borderBottom: '1px solid rgba(234,179,8,0.35)',
              fontSize: '13px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: 'var(--foreground)' }}>
              <ShieldAlert size={16} style={{ color: '#ca8a04', flexShrink: 0 }} />
              Modo suplantación: actuando como <strong>{user.email}</strong>
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>
                (admin: {user.impersonation.adminEmail})
              </span>
            </span>
            <button
              type="button"
              onClick={async () => {
                const r = await stopImpersonating();
                if (r.ok) router.push('/admin');
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(202,138,4,0.5)',
                background: 'var(--background)',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                color: 'var(--foreground)',
              }}
            >
              Volver a administración
            </button>
          </div>
        )}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>

        {/* Topbar móvil — solo marca */}
        <header className="flex md:hidden" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
          height: 52, alignItems: 'center', justifyContent: 'center',
          padding: '0 14px', background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-surface-sm)',
        }}>
          <Link href="/dashboard" className="flex items-center gap-2 no-underline">
            <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={100} height={30} className="h-8 w-auto object-contain rounded-xl shrink-0" />
            <span className="text-base font-bold text-black">{BRAND_NAME}</span>
          </Link>
        </header>

        <DashboardSidebar
          variant="desktop"
          pathname={pathname}
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          onLogout={() => void handleLogout()}
          footer={
            !sidebarCollapsed ? (
              <>
                <SidebarExpiryBadge />
                <JourneyProgress />
                <TourActions />
              </>
            ) : null
          }
        />

        {/* Main content — única columna que crece con el documento; scroll vertical aquí */}
        <main className="dashboard-main">
          {children}
        </main>

        <DashboardMobileNav
          pathname={pathname}
          user={user}
          onLogout={() => void handleLogout()}
          menuFooter={
            <>
              <SidebarExpiryBadge />
              <JourneyProgress />
              <TourActions />
            </>
          }
        />
        </div>
      </div>
      </TourProvider>
    </SubscriptionProvider>
    </QueryProvider>
  );
}
