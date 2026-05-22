'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Boxes,
  Settings,
  LogOut,
  Cpu,
  Bot,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { UserAvatar } from '@/components/shared/user-avatar';

export const SIDEBAR_EXPANDED_PX = 252;
export const SIDEBAR_COLLAPSED_PX = 72;

const SIDEBAR_SURFACE = '#f5f6f8';
const SIDEBAR_ACTIVE = 'rgba(var(--brand-primary-rgb), 0.12)';

function SoftDivider({ margin }: { margin?: string }) {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        background: 'var(--divider-soft)',
        margin: margin ?? '8px 0 12px',
        border: 'none',
      }}
    />
  );
}

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: 'Panel',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Agentes y widgets',
    items: [
      { href: '/dashboard/agents', label: 'Mis Agentes', icon: Bot },
      { href: '/dashboard/widgets', label: 'Mis Widgets', icon: Boxes },
      { href: '/dashboard/widget-builder', label: 'Widget Builder', icon: Cpu },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      { href: '/dashboard/compliance', label: 'Cumplimiento', icon: Shield },
      { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
    ],
  },
];

export const SIDEBAR_TOUR_KEY_BY_HREF: Record<string, string> = {
  '/dashboard': 'sidebar-inicio',
  '/dashboard/agents': 'sidebar-agentes',
  '/dashboard/widget-builder': 'sidebar-widget-builder',
  '/dashboard/widgets': 'sidebar-widgets',
  '/dashboard/compliance': 'sidebar-cumplimiento',
  '/dashboard/settings': 'sidebar-ajustes',
};

type SidebarUser = {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
};

function userRoleLabel(role?: string) {
  if (role === 'admin') return 'Administrador';
  return 'Usuario';
}

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
      title={label}
      className={`dashboard-sidebar-link${active ? ' dashboard-sidebar-link--active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 12,
        padding: collapsed ? '11px 0' : '10px 12px',
        borderRadius: 12,
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        background: active ? SIDEBAR_ACTIVE : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        transition: 'background 0.15s ease, color 0.15s ease',
        width: collapsed ? '100%' : undefined,
      }}
    >
      <Icon size={20} strokeWidth={1.75} style={{ flexShrink: 0 }} aria-hidden />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav
      id="dashboard-sidebar-nav"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.title}>
          {groupIndex > 0 ? (
            <SoftDivider margin={collapsed ? '10px 6px' : '8px 8px 12px'} />
          ) : null}
          {!collapsed ? (
            <p
              style={{
                margin: 0,
                padding: groupIndex === 0 ? '4px 12px 8px' : '4px 12px 8px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                letterSpacing: '0.01em',
              }}
            >
              {group.title}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.items.map((item) => (
              <SidebarNavLink
                key={item.href}
                {...item}
                active={isActive(pathname, item.href)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

type DashboardSidebarProps = {
  variant: 'desktop' | 'mobile';
  pathname: string;
  user: SidebarUser;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  footer?: React.ReactNode;
};

export function DashboardSidebar({
  variant,
  pathname,
  user,
  collapsed = false,
  onToggleCollapse,
  onLogout,
  onNavigate,
  footer,
}: DashboardSidebarProps) {
  const isDesktop = variant === 'desktop';
  const rail = isDesktop && collapsed;

  return (
    <aside
      aria-label="Navegación del panel"
      className={isDesktop ? 'hidden md:flex dashboard-sidebar' : undefined}
      style={{
        display: 'flex',
        width: isDesktop ? (collapsed ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX) : SIDEBAR_EXPANDED_PX,
        flexShrink: 0,
        minHeight: 0,
        height: isDesktop ? 'calc(100% - 24px)' : '100%',
        margin: isDesktop ? '12px 0 12px 12px' : 0,
        background: SIDEBAR_SURFACE,
        border: 'none',
        borderRadius: isDesktop ? 20 : 0,
        flexDirection: 'column',
        padding: rail ? '16px 10px' : '18px 14px',
        overflow: 'hidden',
        transition: 'width 0.22s ease, padding 0.22s ease, box-shadow 0.22s ease',
        boxShadow: isDesktop ? 'var(--shadow-surface-lg)' : undefined,
      }}
    >
      {/* Cabecera */}
      <div
        className="shrink-0"
        style={{
          display: 'flex',
          flexDirection: rail ? 'column' : 'row',
          alignItems: rail ? 'center' : 'center',
          justifyContent: rail ? 'center' : 'space-between',
          gap: rail ? 10 : 8,
          marginBottom: rail ? 14 : 16,
        }}
      >
        {rail ? (
          <>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={false}
              aria-controls="dashboard-sidebar-nav"
              title="Expandir menú"
              className="dashboard-sidebar-toggle"
            >
              <ChevronRight size={18} aria-hidden />
            </button>
            <Link href="/" className="flex items-center justify-center no-underline" title={BRAND_NAME}>
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={36}
                height={36}
                className="h-9 w-auto object-contain rounded-full shrink-0 bg-white"
                style={{ boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' }}
              />
            </Link>
            <UserAvatar
              displayName={user.displayName}
              email={user.email}
              avatarUrl={user.avatarUrl}
              size={36}
            />
          </>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5 no-underline min-w-0" title="Ir al inicio">
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={32}
                height={32}
                className="h-8 w-auto object-contain rounded-full shrink-0 bg-white"
                style={{ boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' }}
              />
              <span className="text-base font-bold text-black truncate">{BRAND_NAME}</span>
            </Link>
            {isDesktop && onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-expanded
                aria-controls="dashboard-sidebar-nav"
                title="Solo iconos"
                className="dashboard-sidebar-toggle"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Perfil (expandido) */}
      {!rail ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '4px 4px 16px',
              marginBottom: 4,
            }}
          >
            <UserAvatar
              displayName={user.displayName}
              email={user.email}
              avatarUrl={user.avatarUrl}
            />
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
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
                {userRoleLabel(user.role)}
              </p>
            </div>
          </div>
          <SoftDivider margin="0 0 12px" />
        </>
      ) : null}

      {footer}

      <SidebarNav pathname={pathname} collapsed={rail} onNavigate={onNavigate} />

      {/* Pie */}
      <SoftDivider margin="12px 0 0" />
      <div
        style={{
          flexShrink: 0,
          paddingTop: rail ? 12 : 14,
        }}
      >
        <PwaInstallButton collapsed={rail} />
        <button
          type="button"
          onClick={onLogout}
          title="Cerrar sesión"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: rail ? 'center' : 'flex-start',
            gap: rail ? 0 : 10,
            padding: rail ? '11px 0' : '10px 12px',
            marginTop: 8,
            borderRadius: 12,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted-foreground)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
            transition: 'background 0.15s ease',
          }}
          className="dashboard-sidebar-link"
        >
          <LogOut size={20} strokeWidth={1.75} aria-hidden />
          {!rail ? 'Cerrar sesión' : null}
        </button>
      </div>
    </aside>
  );
}
