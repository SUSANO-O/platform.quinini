'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SubscriptionProvider, useSubscription } from '@/hooks/use-subscription';
import { TourProvider, useTour } from '@/components/onboarding/app-tour';
// import { initPaddleClient } from '@/lib/paddle-client'; // Paddle — comentado
import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Boxes, Settings, LogOut, Cpu, Bot, ShieldAlert, Plug, Route, RotateCcw } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/dashboard/agents', label: 'Mis Agentes', icon: Bot },
  { href: '/dashboard/mcp', label: 'Integraciones MCP', icon: Plug },
  { href: '/dashboard/widget-builder', label: 'Widget Builder', icon: Cpu },
  { href: '/dashboard/widgets', label: 'Mis Widgets', icon: Boxes },
  { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
];

const SIDEBAR_TOUR_KEY_BY_HREF: Record<string, string> = {
  '/dashboard': 'sidebar-inicio',
  '/dashboard/agents': 'sidebar-agentes',
  '/dashboard/mcp': 'sidebar-mcp',
  '/dashboard/widget-builder': 'sidebar-widget-builder',
  '/dashboard/widgets': 'sidebar-widgets',
  '/dashboard/settings': 'sidebar-ajustes',
};

const SUBSCRIPTION_PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'growth', label: 'Growth' },
  { id: 'business', label: 'Business' },
] as const;

function SubscriptionExpiryGate() {
  const { loading, hasAccess, isTrialActive, subscription, startCheckout } = useSubscription();
  const [openModal, setOpenModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const trialExpired = useMemo(
    () => !loading && !hasAccess && !isTrialActive,
    [loading, hasAccess, isTrialActive],
  );
  const expiredAt = subscription?.trialEndsAt
    ? new Date(subscription.trialEndsAt).toLocaleDateString('es', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    : null;

  useEffect(() => {
    if (!trialExpired) {
      setOpenModal(false);
      setDismissed(false);
      return;
    }
    setOpenModal(true);
    setDismissed(false);
  }, [trialExpired]);

  if (!trialExpired) return null;

  return (
    <>
      {openModal ? (
        <div
          role="dialog"
          aria-modal="false"
          onClick={() => { setOpenModal(false); setDismissed(true); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(2,6,23,0.45)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="card-texture"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              borderRadius: '18px',
              border: '1px solid rgba(255,255,255,0.24)',
              boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.07))',
              backdropFilter: 'blur(14px)',
              color: '#f8fafc',
              padding: '22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: 0, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.78 }}>
                  Sesion vencida
                </p>
                <h3 style={{ margin: '8px 0 0', fontSize: '22px', lineHeight: 1.18 }}>
                  Tu trial ya expiro
                </h3>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => {
                  setOpenModal(false);
                  setDismissed(true);
                }}
                style={{
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: '10px',
                  background: 'rgba(15,23,42,0.38)',
                  color: '#fff',
                  width: '34px',
                  height: '34px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '12px 0 16px', color: 'rgba(241,245,249,0.96)', lineHeight: 1.5 }}>
              {expiredAt
                ? `Tu sesion de prueba vencio el ${expiredAt}.`
                : 'Tu sesion de prueba ya vencio.'} Para seguir disfrutando los servicios, suscribete a un plan.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SUBSCRIPTION_PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => startCheckout(plan.id)}
                  style={{
                    border: 0,
                    borderRadius: '10px',
                    padding: '9px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#fff',
                    cursor: 'pointer',
                    background:
                      plan.id === 'growth'
                        ? 'linear-gradient(135deg, #e41414, #f87600)'
                        : 'linear-gradient(135deg, #00acf8, #0284c7)',
                  }}
                >
                  Suscribirme {plan.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SidebarExpiryBadge() {
  const { loading, hasAccess, isTrialActive, startCheckout } = useSubscription();
  if (loading || hasAccess || isTrialActive) return null;
  return (
    <div style={{
      marginBottom: '12px',
      padding: '10px 12px',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      background: 'var(--muted)',
    }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>
        Período de prueba finalizado
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {SUBSCRIPTION_PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => startCheckout(plan.id)}
            style={{
              border: 0,
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              background: plan.id === 'growth'
                ? 'linear-gradient(135deg, #e41414, #f87600)'
                : 'linear-gradient(135deg, #00acf8, #0284c7)',
            }}
          >
            {plan.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function JourneyProgress() {
  const { journeyPercent, journeyComplete, completedCount, totalStages, currentStageLabel } = useTour();

  /** Con el camino al 100% no mostramos la tarjeta de progreso (evita que el “100%” quede fijo en el sidebar). */
  if (journeyComplete) return null;

  return (
    <div
      className="card-texture"
      style={{
        marginBottom: '14px',
        padding: '12px 12px 14px',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(241,244,248,0.65))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 8px 22px rgba(15,23,42,0.06)',
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
            background: 'linear-gradient(90deg, #e41414, #f87600, #00acf8)',
            transition: 'width 0.45s ease',
            boxShadow: '0 0 12px rgba(228,20,20,0.25)',
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '10px',
          border: '1px solid rgba(228,20,20,0.32)',
          background: 'rgba(228,20,20,0.08)',
          color: '#e41414',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--muted-foreground)',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <RotateCcw size={14} />
        Reiniciar guía
      </button>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, stopImpersonating } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <SubscriptionProvider>
      <TourProvider>
      <SubscriptionExpiryGate />
      <div
        className="dashboard-root-texture"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--background)' }}
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
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <aside style={{
          width: '220px', flexShrink: 0, background: 'var(--card)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          padding: '20px 12px', alignSelf: 'stretch',
        }}>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 no-underline px-2 mb-4">
            <Image src="/t1.png" alt="MatIAs" width={36} height={36} className="rounded-xl object-cover shrink-0" style={{ aspectRatio: '1/1' }} />
            <span className="text-lg font-bold gradient-text">MatIAs</span>
          </Link>

          {/* Nav */}
          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
                  borderRadius: '10px', textDecoration: 'none', fontSize: '13px', fontWeight: active ? 700 : 500,
                  background: active ? 'rgba(228,20,20,0.1)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--foreground)',
                  border: active ? '1px solid rgba(228,20,20,0.18)' : '1px solid transparent',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <SidebarExpiryBadge />
          <JourneyProgress />
          <TourActions />
          <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.displayName || user.email}
          </p>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
              borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted-foreground)', fontSize: '13px', cursor: 'pointer', width: '100%',
            }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {children}
        </main>
        </div>
      </div>
      </TourProvider>
    </SubscriptionProvider>
  );
}
