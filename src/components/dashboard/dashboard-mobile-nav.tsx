'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from '@/components/ui/icons';
import { Bot, Boxes, Braces, LayoutDashboard, LogOut, Menu, Settings } from '@/components/ui/icons';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Badge from '@mui/material/Badge';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Paper from '@mui/material/Paper';
import { X as CloseIcon } from '@/components/ui/icons';
import {
  buildDashboardNavGroups,
  SIDEBAR_TOUR_KEY_BY_HREF,
  isActive,
  type SidebarUser,
} from '@/components/dashboard/dashboard-sidebar';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { SidebarVersionLink } from '@/components/dashboard/sidebar-version-link';
import { useInboxOpenCount } from '@/hooks/use-inbox-open-count';
import { useSubscription } from '@/hooks/use-subscription';
import { canUseApiAccess, canUseConversationFlows, effectiveProductPlan, isApiOnlyPlan, isSoloChatOnlyPlan } from '@/lib/plan-catalog';

const BOTTOM_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/agents', label: 'Agentes', icon: Bot },
  { href: '/dashboard/widgets', label: 'Widgets', icon: Boxes },
];

const BOTTOM_HREFS = new Set(BOTTOM_TABS.map((t) => t.href));
const MENU_ONLY_PREFIXES = ['/dashboard/widget-builder', '/dashboard/compliance', '/dashboard/settings'];

function isMenuSectionActive(pathname: string) {
  return MENU_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
  const navGroups = buildDashboardNavGroups({ showApiLink, showFlowsLink, hideQuickStart, apiOnly });
  const bottomTabs = apiOnly
    ? [
        { href: '/dashboard/api', label: 'API', icon: Braces },
        { href: '/dashboard/settings', label: 'Ajustes', icon: Settings },
      ]
    : BOTTOM_TABS;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const menuActive = menuOpen || isMenuSectionActive(pathname);
  const activeTab = bottomTabs.find((t) => isActive(pathname, t.href))?.href ?? (menuActive ? '__menu__' : '');

  return (
    <>
      <Drawer
        anchor="bottom"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        sx={{ display: { md: 'none' } }}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '88vh',
            px: 2,
            pb: 2,
          },
        }}
      >
        <Box sx={{ width: 40, height: 4, borderRadius: 999, bgcolor: 'divider', mx: 'auto', my: 1.25 }} aria-hidden />
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <UserAvatar displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} size={44} />
            <Box sx={{ minWidth: 0 }}>
              <Typography fontWeight={700} noWrap>
                {user.displayName || user.email.split('@')[0]}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {user.email}
              </Typography>
            </Box>
          </Stack>
          <IconButton aria-label="Cerrar" onClick={() => setMenuOpen(false)}>
            <CloseIcon size={22} />
          </IconButton>
        </Stack>

        {menuFooter}

        <Box component="nav" sx={{ overflowY: 'auto' }}>
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !BOTTOM_HREFS.has(item.href));
            if (items.length === 0) return null;
            return (
              <Box key={group.title} sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ px: 1.25, mb: 0.5, display: 'block' }}>
                  {group.title}
                </Typography>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  return (
                    <ListItemButton
                      key={item.href}
                      component={Link}
                      href={item.href}
                      data-tour={SIDEBAR_TOUR_KEY_BY_HREF[item.href]}
                      onClick={() => setMenuOpen(false)}
                      selected={active}
                      sx={{ borderRadius: 2 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Icon size={20} strokeWidth={1.75} aria-hidden />
                      </ListItemIcon>
                      <ListItemText primary={item.label} />
                      {item.href === '/dashboard/inbox' && inboxOpenCount > 0 ? (
                        <Badge badgeContent={inboxOpenCount > 99 ? '99+' : inboxOpenCount} color="error" />
                      ) : null}
                    </ListItemButton>
                  );
                })}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ pt: 1 }}>
          <PwaInstallButton collapsed={false} />
          <ListItemButton
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
            sx={{ borderRadius: 2, mt: 0.75 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogOut size={20} strokeWidth={1.75} aria-hidden />
            </ListItemIcon>
            <ListItemText primary="Cerrar sesión" />
          </ListItemButton>
          <SidebarVersionLink onNavigate={() => setMenuOpen(false)} />
        </Box>
      </Drawer>

      <Paper
        elevation={8}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          borderRadius: 0,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          showLabels
          value={activeTab}
          sx={{ height: MOBILE_NAV_HEIGHT_PX }}
        >
          {bottomTabs.map(({ href, label, icon: Icon }) => (
            <BottomNavigationAction
              key={href}
              component={Link}
              href={href}
              value={href}
              data-tour={SIDEBAR_TOUR_KEY_BY_HREF[href]}
              label={label}
              icon={<Icon size={22} strokeWidth={1.75} aria-hidden />}
            />
          ))}
          {!apiOnly ? (
            <BottomNavigationAction
              value="__menu__"
              label="Menú"
              icon={<Menu size={22} strokeWidth={1.75} aria-hidden />}
              onClick={() => setMenuOpen(true)}
            />
          ) : null}
        </BottomNavigation>
      </Paper>
    </>
  );
}

export const MOBILE_NAV_HEIGHT_PX = 64;
