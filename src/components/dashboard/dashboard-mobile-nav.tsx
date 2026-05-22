'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Bot, Boxes, LogOut, Menu, X } from 'lucide-react';
import {
  NAV_GROUPS,
  SIDEBAR_TOUR_KEY_BY_HREF,
  isActive,
  type SidebarUser,
} from '@/components/dashboard/dashboard-sidebar';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';

/** Accesos directos en la barra inferior (estilo app móvil). */
const BOTTOM_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard/agents', label: 'Agentes', icon: Bot },
  { href: '/dashboard/widgets', label: 'Widgets', icon: Boxes },
];

const MENU_ONLY_PREFIXES = ['/dashboard', '/dashboard/widget-builder', '/dashboard/compliance', '/dashboard/settings'];

function isMenuSectionActive(pathname: string) {
  return MENU_ONLY_PREFIXES.some((prefix) =>
    prefix === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(prefix),
  );
}

type DashboardMobileNavProps = {
  pathname: string;
  user: SidebarUser;
  onLogout: () => void;
  menuFooter?: React.ReactNode;
};

export function DashboardMobileNav({
  pathname,
  user,
  onLogout,
  menuFooter,
}: DashboardMobileNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const menuActive = menuOpen || isMenuSectionActive(pathname);

  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="dashboard-mobile-nav__backdrop md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {menuOpen ? (
        <div className="dashboard-mobile-nav__sheet md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="dashboard-mobile-nav__sheet-handle" aria-hidden />
          <div className="dashboard-mobile-nav__sheet-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <UserAvatar
                displayName={user.displayName}
                email={user.email}
                avatarUrl={user.avatarUrl}
                size={44}
              />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.displayName || user.email.split('@')[0]}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {user.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setMenuOpen(false)}
              className="dashboard-mobile-nav__sheet-close"
            >
              <X size={18} />
            </button>
          </div>

          {menuFooter}

          <nav className="dashboard-mobile-nav__sheet-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} style={{ marginBottom: 16 }}>
                <p className="dashboard-mobile-nav__group-title">{group.title}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-tour={SIDEBAR_TOUR_KEY_BY_HREF[item.href]}
                        onClick={() => setMenuOpen(false)}
                        className={`dashboard-mobile-nav__sheet-link${active ? ' dashboard-mobile-nav__sheet-link--active' : ''}`}
                      >
                        <Icon size={20} strokeWidth={1.75} aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div style={{ paddingTop: 8 }}>
            <PwaInstallButton collapsed={false} />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="dashboard-mobile-nav__sheet-link"
              style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', marginTop: 8 }}
            >
              <LogOut size={20} strokeWidth={1.75} aria-hidden />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      ) : null}

      <nav className="dashboard-mobile-nav md:hidden" aria-label="Navegación móvil">
        {BOTTOM_TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
              className={`dashboard-mobile-nav__tab${active ? ' dashboard-mobile-nav__tab--active' : ''}`}
            >
              <Icon size={22} strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`dashboard-mobile-nav__tab${menuActive ? ' dashboard-mobile-nav__tab--active' : ''}`}
        >
          <Menu size={22} strokeWidth={1.75} aria-hidden />
          <span>Menú</span>
        </button>
      </nav>
    </>
  );
}

/** Altura reservada para la barra inferior + safe area. */
export const MOBILE_NAV_HEIGHT_PX = 64;
