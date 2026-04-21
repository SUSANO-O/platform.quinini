'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SubscriptionProvider } from '@/hooks/use-subscription';
import { TourProvider, useTour } from '@/components/onboarding/app-tour';
// import { initPaddleClient } from '@/lib/paddle-client'; // Paddle — comentado
import { useEffect, useState } from 'react';
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

function JourneyProgress() {
  const { journeyPercent, journeyComplete, completedCount, totalStages, currentStageLabel } = useTour();

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
        <span style={{ fontSize: '11px', fontWeight: 800, color: journeyComplete ? '#059669' : 'var(--foreground)' }}>
          {journeyComplete ? '100%' : `${journeyPercent}%`}
        </span>
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
            background: journeyComplete
              ? 'linear-gradient(90deg, #059669, #34d399)'
              : 'linear-gradient(90deg, #e41414, #f87600, #00acf8)',
            transition: 'width 0.45s ease',
            boxShadow: '0 0 12px rgba(228,20,20,0.25)',
          }}
        />
      </div>
      <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '8px 0 0', lineHeight: 1.45 }}>
        {journeyComplete
          ? 'Recorrido completado. Usa «Reiniciar guía» abajo si quieres volver a hacer el camino desde cero.'
          : `Etapa actual: ${currentStageLabel ?? '…'} · ${completedCount}/${totalStages} etapas`}
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
  const [usage, setUsage] = useState<{
    used: number;
    limit: number;
    percentUsed: number;
    plan: string;
    platformFreeLimit?: number;
    platformFreeUsed?: number;
    platformFreeRemaining?: number;
  } | null>(null);

  // LemonSqueezy no requiere inicialización de JS en el cliente

  useEffect(() => {
    if (!user) return;
    fetch('/api/billing/usage')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUsage(d))
      .catch(() => {});
  }, [user]);

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

        {/* Quota indicator */}
        {usage && (
          <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '12px', background: 'var(--muted)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Conversaciones
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: usage.percentUsed >= 80 ? '#ef4444' : 'var(--foreground)' }}>
                {usage.percentUsed}%
              </span>
            </div>
            <div style={{ height: '5px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(usage.percentUsed, 100)}%`,
                borderRadius: '999px',
                background: usage.percentUsed >= 80
                  ? 'linear-gradient(90deg,#f87600,#ef4444)'
                  : 'linear-gradient(90deg,#e41414,#f87600)',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '5px' }}>
              {usage.limit === -1
                ? 'Ilimitado'
                : `${usage.used.toLocaleString('es')} / ${usage.limit.toLocaleString('es')}`}
              {' · '}<span style={{ textTransform: 'capitalize' }}>{usage.plan}</span>
            </p>
            {typeof usage.platformFreeLimit === 'number' && (
              <p
                title="Cuota gratuita de regalo para usar agentes de plataforma este mes. Al agotarse, los chats pasan a contar en tu cuota normal de conversaciones."
                style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '4px', cursor: 'help' }}
              >
                Regalo plataforma (cuota gratis): {(usage.platformFreeUsed ?? 0).toLocaleString('es')} /{' '}
                {usage.platformFreeLimit.toLocaleString('es')}
                {' · '}restan {(usage.platformFreeRemaining ?? 0).toLocaleString('es')}
              </p>
            )}
            {usage.percentUsed >= 80 && (
              <Link href="/dashboard/settings" style={{ display: 'block', marginTop: '6px', fontSize: '10px', fontWeight: 700, color: '#ef4444', textDecoration: 'none' }}>
                ↑ Mejorar plan
              </Link>
            )}
          </div>
        )}

        {/* User + logout */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
