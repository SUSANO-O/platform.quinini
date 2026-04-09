'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { LayoutDashboard, Users, LogOut, Shield, UserPlus } from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/promote', label: 'Promover admin', icon: UserPlus },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '200px', flexShrink: 0, background: 'var(--card)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        padding: '20px 12px', position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', marginBottom: '24px' }}>
          <Shield size={16} style={{ color: '#6366f1' }} />
          <span style={{ fontSize: '16px', fontWeight: 800, color: '#6366f1' }}>Admin</span>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{
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
          <Link href="/dashboard" style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px',
            borderRadius: '10px', textDecoration: 'none', fontSize: '13px',
            color: 'var(--muted-foreground)', marginTop: '8px',
          }}>
            ← Mi dashboard
          </Link>
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

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
