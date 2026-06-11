'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Fragment, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Boxes,
  Settings,
  LogOut,
  Cpu,
  Bot,
  CircleHelp,
  Shield,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Inbox,
  FileText,
  Braces,
  MessageSquare,
} from 'lucide-react';
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_TEXT_COLOR } from '@/lib/brand';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useInboxOpenCount } from '@/hooks/use-inbox-open-count';
import { useDashboardPrefetch } from '@/hooks/dashboard/use-dashboard-prefetch';
import { useSubscription } from '@/hooks/use-subscription';
import { canUseApiAccess, isSoloChatOnlyPlan } from '@/lib/plan-catalog';

export const SIDEBAR_EXPANDED_PX = 252;
export const SIDEBAR_COLLAPSED_PX = 72;

const SIDEBAR_SURFACE = '#f5f6f8';
const SIDEBAR_ACTIVE = 'rgba(var(--brand-primary-rgb), 0.12)';
const ASSISTANT_HELP_BG = 'rgba(239, 68, 68, 0.08)';
const ASSISTANT_HELP_BORDER = 'rgba(239, 68, 68, 0.14)';
const ASSISTANT_HELP_COLOR = '#dc2626';

function useWidgetLauncherHidden() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        if (typeof window.__BIV?.isHidden === 'function') {
          setHidden(window.__BIV.isHidden());
          return;
        }
        setHidden(false);
      } catch {
        setHidden(false);
      }
    };

    read();

    const pollId = window.setInterval(() => {
      if (typeof window.__BIV?.isHidden === 'function') {
        read();
        window.clearInterval(pollId);
      }
    }, 180);

    const stopPollId = window.setTimeout(() => window.clearInterval(pollId), 10000);

    const onVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ hidden?: boolean }>).detail;
      if (typeof detail?.hidden === 'boolean') {
        setHidden(detail.hidden);
        return;
      }
      read();
    };

    window.addEventListener('biv:assist-visibility', onVisibility);
    return () => {
      window.clearInterval(pollId);
      window.clearTimeout(stopPollId);
      window.removeEventListener('biv:assist-visibility', onVisibility);
    };
  }, []);

  return hidden;
}

function AssistantHelpRestoreItem({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const hidden = useWidgetLauncherHidden();
  if (!hidden) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.__BIV?.show?.();
        window.dispatchEvent(new CustomEvent('biv:show-assist'));
        onNavigate?.();
      }}
      title="Ayuda asistente"
      className="dashboard-sidebar-link"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 12,
        padding: collapsed ? '11px 0' : '10px 12px',
        marginTop: 2,
        borderRadius: 12,
        border: `1px solid ${ASSISTANT_HELP_BORDER}`,
        background: ASSISTANT_HELP_BG,
        color: ASSISTANT_HELP_COLOR,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'background 0.15s ease, border-color 0.15s ease',
      }}
    >
      <CircleHelp size={20} strokeWidth={1.75} style={{ flexShrink: 0 }} aria-hidden />
      {!collapsed ? <span className="truncate">Ayuda asistente</span> : null}
    </button>
  );
}

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

export const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: 'Panel',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/quick-start', label: 'Quick Start', icon: Sparkles },
      { href: '/dashboard/inbox', label: 'Inbox', icon: Inbox },
      { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
    ],
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
      { href: '/dashboard/facturas', label: 'Facturas', icon: FileText },
      { href: '/dashboard/api', label: 'API', icon: Braces },
      { href: '/dashboard/compliance', label: 'Cumplimiento', icon: Shield },
      { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
    ],
  },
];

export function buildDashboardNavGroups({
  showApiLink,
  hideQuickStart,
}: {
  showApiLink: boolean;
  hideQuickStart: boolean;
}) {
  return NAV_GROUPS.map((group) => {
    let items = group.items;

    if (group.title === 'Panel' && hideQuickStart) {
      items = items.filter((item) => item.href !== '/dashboard/quick-start');
    }

    if (group.title === 'Cuenta' && !showApiLink) {
      items = items.filter((item) => item.href !== '/dashboard/api');
    }

    return { ...group, items };
  });
}

export const SIDEBAR_TOUR_KEY_BY_HREF: Record<string, string> = {
  '/dashboard': 'sidebar-inicio',
  '/dashboard/quick-start': 'sidebar-quick-start',
  '/dashboard/inbox': 'sidebar-inbox',
  '/dashboard/agents': 'sidebar-agentes',
  '/dashboard/widget-builder': 'sidebar-widget-builder',
  '/dashboard/widgets': 'sidebar-widgets',
  '/dashboard/compliance': 'sidebar-cumplimiento',
  '/dashboard/facturas': 'sidebar-facturas',
  '/dashboard/api': 'sidebar-api',
  '/dashboard/settings': 'sidebar-ajustes',
};

export type SidebarUser = {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
};

function userRoleLabel(role?: string) {
  if (role === 'admin') return 'Administrador';
  return 'Usuario';
}

export function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function InboxBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      aria-label={`${count} solicitudes pendientes`}
      style={{
        ...(collapsed
          ? {
              position: 'absolute',
              top: 4,
              right: '50%',
              transform: 'translate(calc(50% + 8px), 0)',
            }
          : { marginLeft: 'auto' }),
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        borderRadius: 999,
        background: BRAND_TEXT_COLOR,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '20px',
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
  badge,
  onPrefetch,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badge?: number;
  onPrefetch?: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => onPrefetch?.(href)}
      onFocus={() => onPrefetch?.(href)}
      onClick={onNavigate}
      data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
      title={badge && badge > 0 ? `${label} (${badge} pendientes)` : label}
      className={`dashboard-sidebar-link${active ? ' dashboard-sidebar-link--active' : ''}`}
      style={{
        position: 'relative',
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
      <Icon size={20} strokeWidth={1.75} className="dashboard-sidebar-link__icon" aria-hidden />
      {!collapsed ? <span className="truncate">{label}</span> : null}
      <InboxBadge count={badge ?? 0} collapsed={collapsed} />
    </Link>
  );
}

function SidebarNav({
  pathname,
  collapsed,
  onNavigate,
  inboxOpenCount,
  showApiLink,
  hideQuickStart,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  inboxOpenCount: number;
  showApiLink: boolean;
  hideQuickStart: boolean;
}) {
  const prefetchRoute = useDashboardPrefetch();
  const groups = buildDashboardNavGroups({ showApiLink, hideQuickStart });

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
      {groups.map((group, groupIndex) => (
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
              <Fragment key={item.href}>
                <SidebarNavLink
                  {...item}
                  active={isActive(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  onPrefetch={prefetchRoute}
                  badge={item.href === '/dashboard/inbox' ? inboxOpenCount : undefined}
                />
                {item.href === '/dashboard/settings' ? (
                  <AssistantHelpRestoreItem collapsed={collapsed} onNavigate={onNavigate} />
                ) : null}
              </Fragment>
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
  const { openCount: inboxOpenCount } = useInboxOpenCount(true);
  const { subscription } = useSubscription();
  const showApiLink = canUseApiAccess(
    subscription?.plan ?? 'free',
    subscription?.status ?? 'free',
    subscription?.features,
  );
  const hideQuickStart = isSoloChatOnlyPlan(subscription?.plan ?? 'free');

  return (
    <aside
      aria-label="Navegación del panel"
      className={isDesktop ? 'dashboard-sidebar dashboard-sidebar--desktop' : 'dashboard-sidebar'}
      style={{
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
              <span className="text-base font-bold text-black truncate font-display">{BRAND_NAME}</span>
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

      <SidebarNav pathname={pathname} collapsed={rail} onNavigate={onNavigate} inboxOpenCount={inboxOpenCount} showApiLink={showApiLink} hideQuickStart={hideQuickStart} />

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
