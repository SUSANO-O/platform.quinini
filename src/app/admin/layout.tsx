'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAuthSplashLoading } from '@/hooks/use-auth-splash-loading';
import { useEffect, useState } from 'react';
import { AiLoadingScreen } from '@/components/ui/ai-loading-screen';
import { LayoutDashboard, Users, LogOut, Shield, UserPlus, BarChart3, Wallet, Box, Network, Bot, Cpu, Menu, X, KeyRound, Activity, FileText } from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/widget-analytics', label: 'Widgets / uso', icon: BarChart3 },
  { href: '/admin/model-stats', label: 'Modelos', icon: Cpu },
  { href: '/admin/sub-agents', label: 'Sub-agentes', icon: Network },
  { href: '/admin/embeddings-3d', label: 'Embeddings 3D', icon: Box },
  { href: '/admin/finance', label: 'Finanzas clientes', icon: Wallet },
  { href: '/admin/facturas', label: 'Facturas manuales', icon: FileText },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/registration-codes', label: 'Códigos acceso', icon: KeyRound },
  { href: '/admin/promote', label: 'Promover admin', icon: UserPlus },
  { href: '/admin/ai-config', label: 'Asistente AI', icon: Bot },
  { href: '/admin/security-log', label: 'Log de seguridad', icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const showSplash = useAuthSplashLoading(loading);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (showSplash) return;
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin') { router.push('/dashboard'); return; }
  }, [user, showSplash, router]);

  if (showSplash || !user) {
    return <AiLoadingScreen />;
  }

  // While role check resolves, avoid flash of admin UI for non-admins
  if (user.role !== 'admin') return null;

  const navLinks = (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
        return (
          <Link key={href} href={href} onClick={() => setMobileOpen(false)} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
            borderRadius: '10px', textDecoration: 'none', fontSize: '13px',
            fontWeight: active ? 700 : 500,
            background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: active ? '#6366f1' : 'var(--foreground)',
          }}>
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
      <Link href="/dashboard" onClick={() => setMobileOpen(false)} style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
        borderRadius: '10px', textDecoration: 'none', fontSize: '13px',
        color: 'var(--muted-foreground)', marginTop: '8px',
      }}>
        ← Mi dashboard
      </Link>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* Sidebar — solo desktop */}
      <aside style={{
        width: '200px', flexShrink: 0, background: 'var(--card)',
        borderRight: '1px solid var(--border)', flexDirection: 'column',
        padding: '20px 12px', position: 'sticky', top: 0, height: '100vh',
      }} className="hidden md:flex">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', marginBottom: '24px' }}>
          <Shield size={16} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#6366f1' }}>Admin</span>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navLinks}
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
          <button
            onClick={async () => { await logout(); router.push('/'); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', width: '100%' }}
          >
            <LogOut size={13} /> Salir
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar móvil */}
        <header className="flex md:hidden" style={{
          alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: '56px', background: 'var(--card)',
          borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 40,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} style={{ color: '#6366f1' }} />
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#6366f1' }}>Admin</span>
          </div>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: '10px', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: mobileOpen ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: mobileOpen ? '#6366f1' : 'var(--foreground)',
            }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>

        {/* Overlay móvil */}
        {mobileOpen && (
          <div
            className="md:hidden"
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 38, background: 'rgba(0,0,0,0.4)' }}
            aria-hidden
          />
        )}

        {/* Drawer móvil */}
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            top: 56,
            left: 0,
            bottom: 0,
            zIndex: 39,
            width: 240,
            background: 'var(--card)',
            borderRight: '1px solid var(--border)',
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
            overflowY: 'auto',
          }}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px' }}>
            {navLinks}
          </nav>
          <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </p>
            <button
              type="button"
              onClick={async () => { await logout(); router.push('/'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}
            >
              <LogOut size={13} /> Salir
            </button>
          </div>
        </div>

        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }} className="md:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}
