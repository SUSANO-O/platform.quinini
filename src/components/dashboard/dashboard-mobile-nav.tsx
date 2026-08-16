'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogOut, Menu } from '@/components/ui/icons';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import { X as CloseIcon } from '@/components/ui/icons';
import {
  buildDashboardNavGroups,
  InboxBadge,
  SIDEBAR_TOUR_KEY_BY_HREF,
  isActive,
  type SidebarUser,
} from '@/components/dashboard/dashboard-sidebar';
import { UserAvatar } from '@/components/shared/user-avatar';
import { PwaInstallButton } from '@/components/shared/pwa-install-button';
import { SidebarVersionLink } from '@/components/dashboard/sidebar-version-link';
import { BRAND_FAVICON_SRC, BRAND_NAME } from '@/lib/brand';
import { useInboxOpenCount } from '@/hooks/use-inbox-open-count';
import { useSubscription } from '@/hooks/use-subscription';
import { canUseApiAccess, canUseConversationFlows, effectiveProductPlan, isApiOnlyPlan, isSoloChatOnlyPlan } from '@/lib/plan-catalog';

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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
          {navGroups.map((group) => (
            <Box key={group.title} sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ px: 1.25, mb: 0.5, display: 'block' }}>
                {group.title}
              </Typography>
              {group.items.map((item) => {
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
                    {item.href === '/dashboard/inbox' ? (
                      <InboxBadge count={inboxOpenCount} collapsed={false} />
                    ) : null}
                  </ListItemButton>
                );
              })}
            </Box>
          ))}
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
        className="dashboard-mobile-nav-bar"
        elevation={8}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          borderRadius: 0,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            minHeight: MOBILE_NAV_HEIGHT_PX,
            px: 0.5,
            pb: 'env(safe-area-inset-bottom)',
          }}
        >
          <Stack direction="row" alignItems="center" sx={{ justifySelf: 'start' }}>
            <IconButton
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(true)}
              sx={{ width: 48, height: 48, color: 'text.primary', flexShrink: 0 }}
            >
              <Menu size={24} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <Typography component="span" variant="body2" fontWeight={700} sx={{ ml: 0.25 }}>
              Menú
            </Typography>
          </Stack>

          <Box
            component={Link}
            href="/dashboard"
            aria-label="Ir al inicio del panel"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              lineHeight: 0,
              textDecoration: 'none',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND_FAVICON_SRC}
              alt={BRAND_NAME}
              width={30}
              height={30}
              style={{
                display: 'block',
                width: 30,
                height: 30,
                objectFit: 'contain',
                objectPosition: 'center',
              }}
              draggable={false}
            />
          </Box>

          <Box aria-hidden sx={{ justifySelf: 'end', width: 48 }} />
        </Box>
      </Paper>
    </>
  );
}

export const MOBILE_NAV_HEIGHT_PX = 52;
