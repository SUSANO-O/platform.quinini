'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, LogOut, Shield, UserPlus, BarChart3, Wallet, Box, Network, Bot, Cpu, Menu, X } from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/widget-analytics', label: 'Widgets / uso', icon: BarChart3 },
  { href: '/admin/model-stats', label: 'Modelos', icon: Cpu },
  { href: '/admin/sub-agents', label: 'Sub-agentes', icon: Network },
  { href: '/admin/embeddings-3d', label: 'Embeddings 3D', icon: Box },
  { href: '/admin/finance', label: 'Finanzas clientes', icon: Wallet },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/promote', label: 'Promover admin', icon: UserPlus },
  { href: '/admin/ai-config', label: 'Asistente AI', icon: Bot },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'admin') { router.push('/dashboard'); return; }
  }, [user, loading, router]);

  // Show spinner while auth loads
  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // While role check resolves, avoid flash of admin UI for non-admins
  if (user.role !== 'admin') return null;

  const navLinks = (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
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

        {/* Drawer móvil */}
        <div
          className="md:hidden"
          style={{
            overflow: 'hidden',
            maxHeight: mobileOpen ? '600px' : '0px',
            opacity: mobileOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.2s ease',
            background: 'var(--card)',
            borderBottom: mobileOpen ? '1px solid var(--border)' : 'none',
            zIndex: 39,
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
              onClick={async () => { await logout(); router.push('/'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}
            >
              <LogOut size={13} /> Salir
            </button>
          </div>
        </div>

        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
