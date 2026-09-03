'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import type { LucideIcon } from '@/components/ui/icons';
import {
  LayoutDashboard,
  Boxes,
  Settings,
  LogOut,
  Cpu,
  Webhook,
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
  GitBranch,
} from '@/components/ui/icons';
import { BotivaOrbLogo } from '@/components/brand/botiva-orb-logo';
import { BRAND_NAME } from '@/lib/brand';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { SidebarVersionLink } from '@/components/dashboard/sidebar-version-link';
import { UserAvatar } from '@/components/shared/user-avatar';
import { useInboxOpenCount } from '@/hooks/use-inbox-open-count';
import { useDashboardPrefetch } from '@/hooks/dashboard/use-dashboard-prefetch';
import { useSubscription } from '@/hooks/use-subscription';
import { canUseApiAccess, canUseConversationFlows, effectiveProductPlan, isApiOnlyPlan, isSoloChatOnlyPlan } from '@/lib/plan-catalog';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { FlowsBetaBadge } from '@/components/flows/flows-beta-badge';

export const SIDEBAR_EXPANDED_PX = 220;
export const SIDEBAR_COLLAPSED_PX = 60;

const SIDEBAR_SURFACE = '#f5f6f8';

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
      className="dashboard-sidebar-link dashboard-sidebar-link--assistant-help"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 12,
        padding: collapsed ? '9px 0' : '8px 10px',
        marginTop: 2,
        borderRadius: 10,
        fontSize: 13,
        width: '100%',
        textAlign: 'left',
      }}
    >
      <CircleHelp size={17} strokeWidth={1.75} style={{ flexShrink: 0 }} aria-hidden />
      {!collapsed ? <span className="truncate">Ayuda asistente</span> : null}
    </button>
  );
}

function SoftDivider({ margin }: { margin?: string }) {
  return <Divider aria-hidden sx={{ borderColor: 'divider', margin: margin ?? '8px 0 12px' }} />;
}

export function InboxBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={
        collapsed
          ? 'dashboard-sidebar-inbox-badge dashboard-sidebar-inbox-badge--dot'
          : 'dashboard-sidebar-inbox-badge'
      }
      aria-label={`${count} solicitudes pendientes`}
    >
      {collapsed ? null : count > 99 ? '99+' : count}
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
  navTag,
  onPrefetch,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badge?: number;
  navTag?: 'BETA';
  onPrefetch?: (href: string) => void;
}) {
  const title = badge && badge > 0 ? `${label} (${badge} pendientes)` : navTag ? `${label} (${navTag})` : label;

  const button = (
    <ListItemButton
      component={Link}
      href={href}
      prefetch
      onMouseEnter={() => onPrefetch?.(href)}
      onFocus={() => onPrefetch?.(href)}
      onClick={onNavigate}
      data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
      selected={active}
      sx={{
        borderRadius: 2,
        mb: 0.25,
        minHeight: 40,
        justifyContent: collapsed ? 'center' : 'flex-start',
        px: collapsed ? 1 : 1.25,
        position: 'relative',
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: collapsed ? 0 : 34,
          color: active ? 'primary.main' : 'text.secondary',
          justifyContent: 'center',
        }}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden />
      </ListItemIcon>
      {!collapsed ? (
        <ListItemText
          primary={label}
          primaryTypographyProps={{ fontSize: 13, fontWeight: active ? 700 : 500, noWrap: true }}
        />
      ) : null}
      {!collapsed && navTag === 'BETA' ? <FlowsBetaBadge /> : null}
      <InboxBadge count={badge ?? 0} collapsed={collapsed} />
    </ListItemButton>
  );

  return collapsed ? (
    <Tooltip title={title} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

export const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: LucideIcon; tag?: 'BETA' }[] }[] = [
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
      { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/dashboard/flows', label: 'Flujos', icon: GitBranch, tag: 'BETA' },
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
  showFlowsLink,
  hideQuickStart,
  apiOnly = false,
}: {
  showApiLink: boolean;
  showFlowsLink: boolean;
  hideQuickStart: boolean;
  apiOnly?: boolean;
}) {
  if (apiOnly) {
    return [
      {
        title: 'Desarrolladores',
        items: [
          { href: '/dashboard/api', label: 'API REST', icon: Braces },
          { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
        ],
      },
    ];
  }

  return NAV_GROUPS.map((group) => {
    let items = group.items;

    if (group.title === 'Panel' && hideQuickStart) {
      items = items.filter((item) => item.href !== '/dashboard/quick-start');
    }

    if (group.title === 'Agentes y widgets' && !showFlowsLink) {
      items = items.filter((item) => item.href !== '/dashboard/flows');
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
  '/dashboard/flows': 'sidebar-flows',
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

function SidebarNav({
  pathname,
  collapsed,
  onNavigate,
  inboxOpenCount,
  showApiLink,
  showFlowsLink,
  hideQuickStart,
  apiOnly,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  inboxOpenCount: number;
  showApiLink: boolean;
  showFlowsLink: boolean;
  hideQuickStart: boolean;
  apiOnly: boolean;
}) {
  const prefetchRoute = useDashboardPrefetch();
  const groups = buildDashboardNavGroups({ showApiLink, showFlowsLink, hideQuickStart, apiOnly });

  return (
    <nav
      id="dashboard-sidebar-nav"
      className="dashboard-sidebar-nav"
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
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                px: 1.25,
                pt: groupIndex === 0 ? 0.25 : 0.25,
                pb: 0.75,
                fontWeight: 600,
                color: 'text.secondary',
                letterSpacing: '0.01em',
              }}
            >
              {group.title}
            </Typography>
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
                  navTag={'tag' in item ? item.tag : undefined}
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
  const plan = effectiveProductPlan(subscription?.plan ?? 'free', subscription?.status ?? 'free');
  const apiOnly = isApiOnlyPlan(plan);
  const showApiLink = canUseApiAccess(
    subscription?.plan ?? 'free',
    subscription?.status ?? 'free',
    subscription?.features,
  );
  const showFlowsLink = canUseConversationFlows(
    subscription?.plan ?? 'free',
    subscription?.status ?? 'free',
    subscription?.features,
  );
  const hideQuickStart = isSoloChatOnlyPlan(subscription?.plan ?? 'free') || apiOnly;

  return (
    <aside
      aria-label="Navegación del panel"
      className={isDesktop ? 'dashboard-sidebar dashboard-sidebar--desktop' : 'dashboard-sidebar'}
      style={{
        width: isDesktop ? (collapsed ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX) : SIDEBAR_EXPANDED_PX,
        flexShrink: 0,
        minHeight: 0,
        height: '100%',
        margin: 0,
        background: SIDEBAR_SURFACE,
        border: 'none',
        borderRight: isDesktop ? '1px solid var(--border)' : 'none',
        borderRadius: 0,
        flexDirection: 'column',
        padding: rail ? '12px 8px' : '14px 11px',
        overflow: 'hidden',
        transition: 'width 0.22s ease, padding 0.22s ease',
        boxShadow: undefined,
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
          marginBottom: rail ? 10 : 12,
        }}
      >
        {rail ? (
          <>
            <IconButton
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={false}
              aria-controls="dashboard-sidebar-nav"
              title="Expandir menú"
              size="small"
            >
              <ChevronRight size={16} aria-hidden />
            </IconButton>
            <Link href="/" className="flex items-center justify-center no-underline" title={BRAND_NAME}>
              <BotivaOrbLogo size={32} className="shrink-0" />
            </Link>
            <UserAvatar
              displayName={user.displayName}
              email={user.email}
              avatarUrl={user.avatarUrl}
              size={32}
            />
          </>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2 no-underline min-w-0" title="Ir al inicio">
              <BotivaOrbLogo size={24} className="shrink-0" />
              <span className="text-xs font-bold text-black truncate font-display">{BRAND_NAME}</span>
            </Link>
            {isDesktop && onToggleCollapse ? (
              <IconButton
                type="button"
                onClick={onToggleCollapse}
                aria-expanded
                aria-controls="dashboard-sidebar-nav"
                title="Solo iconos"
                size="small"
              >
                <ChevronLeft size={16} aria-hidden />
              </IconButton>
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
              gap: 10,
              padding: '2px 2px 12px',
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
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.displayName || user.email.split('@')[0]}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
                {userRoleLabel(user.role)}
              </p>
            </div>
          </div>
          <SoftDivider margin="0 0 12px" />
        </>
      ) : null}

      {footer}

      <SidebarNav pathname={pathname} collapsed={rail} onNavigate={onNavigate} inboxOpenCount={inboxOpenCount} showApiLink={showApiLink} showFlowsLink={showFlowsLink} hideQuickStart={hideQuickStart} apiOnly={apiOnly} />

      {/* Pie */}
      <SoftDivider margin="8px 0 0" />
      <div
        style={{
          flexShrink: 0,
          paddingTop: rail ? 8 : 10,
        }}
      >
        <PwaInstallButton collapsed={rail} />
        <ListItemButton
          onClick={onLogout}
          title="Cerrar sesión"
          sx={{
            borderRadius: 2,
            mt: 0.75,
            minHeight: 40,
            justifyContent: rail ? 'center' : 'flex-start',
            px: rail ? 1 : 1.25,
          }}
        >
          <ListItemIcon sx={{ minWidth: rail ? 0 : 34, justifyContent: 'center', color: 'text.secondary' }}>
            <LogOut size={17} strokeWidth={1.75} aria-hidden />
          </ListItemIcon>
          {!rail ? <ListItemText primary="Cerrar sesión" primaryTypographyProps={{ fontSize: 13 }} /> : null}
        </ListItemButton>
        <SidebarVersionLink collapsed={rail} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
