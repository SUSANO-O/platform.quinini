'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Divider,
  Container,
  Menu,
  MenuItem,
  Collapse,
} from '@mui/material';
import { ChevronDown, Menu as MenuIcon, X as CloseIcon } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';
import { BotivaOrbLogo } from '@/components/brand/botiva-orb-logo';
import { BRAND_NAME } from '@/lib/brand';

const NAV_LINKS = [
  { href: '#agents', key: 'agents' as const },
  { href: '#training', key: 'training' as const },
  { href: '/pricing', key: 'pricing' as const },
];

const RESOURCE_LINKS = [
  { href: '/preguntas-frecuentes', key: 'faq' as const },
  { href: '/demos', key: 'demos' as const },
  { href: '/soluciones', key: 'solutions' as const },
];

const navBtnSx = {
  fontFamily: '"Inter", system-ui, sans-serif',
  fontWeight: 500,
  letterSpacing: '-0.015em',
  textTransform: 'none' as const,
  color: '#475569',
};

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [resourcesEl, setResourcesEl] = useState<null | HTMLElement>(null);
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false);
  const { user, loading } = useAuth();
  const t = useTranslations('nav');
  const resourcesOpen = Boolean(resourcesEl);

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'rgba(255,255,255,0.78)',
          color: 'text.primary',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          boxShadow: 'none',
        }}
      >
        <Container maxWidth="lg" disableGutters sx={{ px: 2.5 }}>
          <Toolbar disableGutters sx={{ minHeight: 64, gap: 1 }}>
            <Box
              component={Link}
              href="/"
              className="landing-nav-brand"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textDecoration: 'none',
                color: 'text.primary',
                mr: 'auto',
                fontFamily: '"Inter", system-ui, sans-serif',
              }}
            >
              <BotivaOrbLogo size={32} className="shrink-0" />
              <Box component="span" sx={{ fontWeight: 700, letterSpacing: '-0.03em', display: { xs: 'none', sm: 'inline' } }}>
                {BRAND_NAME}
              </Box>
            </Box>

            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
              {NAV_LINKS.map((item) => (
                <Button key={item.key} component={Link} href={item.href} color="inherit" size="small" sx={navBtnSx}>
                  {t(item.key)}
                </Button>
              ))}

              <Button
                color="inherit"
                size="small"
                aria-haspopup="menu"
                aria-expanded={resourcesOpen ? 'true' : undefined}
                aria-controls={resourcesOpen ? 'landing-resources-menu' : undefined}
                onClick={(e) => setResourcesEl(e.currentTarget)}
                endIcon={<ChevronDown size={16} />}
                sx={navBtnSx}
              >
                {t('resources')}
              </Button>
              <Menu
                id="landing-resources-menu"
                anchorEl={resourcesEl}
                open={resourcesOpen}
                onClose={() => setResourcesEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                  paper: {
                    sx: {
                      mt: 1,
                      minWidth: 220,
                      borderRadius: '12px',
                      border: '1px solid rgba(15,23,42,0.08)',
                      boxShadow: '0 12px 32px rgba(15,23,42,0.1)',
                    },
                  },
                }}
              >
                {RESOURCE_LINKS.map((item) => (
                  <MenuItem
                    key={item.key}
                    component={Link}
                    href={item.href}
                    onClick={() => setResourcesEl(null)}
                    sx={{ fontSize: '0.875rem', fontWeight: 500, letterSpacing: '-0.015em', py: 1.1 }}
                  >
                    {t(item.key)}
                  </MenuItem>
                ))}
              </Menu>

              <LanguageSwitcher />
              {!loading &&
                (user ? (
                  <Button
                    component={Link}
                    href="/dashboard"
                    variant="contained"
                    size="small"
                    sx={{ borderRadius: 999, px: 2, textTransform: 'none', fontWeight: 650 }}
                  >
                    {t('dashboard')}
                  </Button>
                ) : (
                  <>
                    <Button
                      component={Link}
                      href="/login"
                      color="inherit"
                      size="small"
                      sx={{ textTransform: 'none', fontWeight: 500, color: '#334155' }}
                    >
                      {t('signIn')}
                    </Button>
                    <Button
                      component={Link}
                      href="/pricing"
                      variant="contained"
                      size="small"
                      sx={{
                        borderRadius: 999,
                        px: 2.1,
                        textTransform: 'none',
                        fontWeight: 650,
                        bgcolor: '#0f172a',
                        '&:hover': { bgcolor: '#1e293b' },
                      }}
                    >
                      {t('startFree')}
                    </Button>
                  </>
                ))}
            </Stack>

            <IconButton
              edge="end"
              color="inherit"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setOpen((v) => !v)}
              sx={{ display: { md: 'none' } }}
            >
              {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{ display: { md: 'none' } }}
        PaperProps={{ sx: { width: 'min(320px, 88vw)', pt: 1 } }}
      >
        <Toolbar />
        <List>
          {NAV_LINKS.map((item) => (
            <ListItemButton
              key={item.key}
              component={Link}
              href={item.href}
              onClick={() => setOpen(false)}
            >
              <ListItemText primary={t(item.key)} />
            </ListItemButton>
          ))}
          <ListItemButton onClick={() => setMobileResourcesOpen((v) => !v)}>
            <ListItemText primary={t('resources')} />
            <ChevronDown
              size={18}
              style={{
                transform: mobileResourcesOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform .15s ease',
              }}
            />
          </ListItemButton>
          <Collapse in={mobileResourcesOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {RESOURCE_LINKS.map((item) => (
                <ListItemButton
                  key={item.key}
                  component={Link}
                  href={item.href}
                  sx={{ pl: 4 }}
                  onClick={() => setOpen(false)}
                >
                  <ListItemText primary={t(item.key)} />
                </ListItemButton>
              ))}
            </List>
          </Collapse>
        </List>
        <Box sx={{ px: 2, pb: 1 }}>
          <LanguageSwitcher />
        </Box>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={1} sx={{ px: 2, pb: 3 }}>
          {!loading &&
            (user ? (
              <Button component={Link} href="/dashboard" variant="contained" fullWidth onClick={() => setOpen(false)}>
                {t('dashboard')}
              </Button>
            ) : (
              <>
                <Button component={Link} href="/login" variant="outlined" fullWidth onClick={() => setOpen(false)}>
                  {t('signIn')}
                </Button>
                <Button component={Link} href="/pricing" variant="contained" fullWidth onClick={() => setOpen(false)}>
                  {t('startFree')}
                </Button>
              </>
            ))}
        </Stack>
      </Drawer>
    </>
  );
}
