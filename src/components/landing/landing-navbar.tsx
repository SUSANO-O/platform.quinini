'use client';

import Link from 'next/link';
import Image from 'next/image';
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
} from '@mui/material';
import { Menu as MenuIcon, X as CloseIcon } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

const NAV_LINKS = [
  { href: '#agents', key: 'agents' as const },
  { href: '#training', key: 'training' as const },
  { href: '/pricing', key: 'pricing' as const },
  { href: '/preguntas-frecuentes', key: 'faq' as const },
];

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const t = useTranslations('nav');

  return (
    <>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Container maxWidth="lg" disableGutters sx={{ px: 2.5 }}>
          <Toolbar disableGutters sx={{ minHeight: 64, gap: 1 }}>
            <Box
              component={Link}
              href="/"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'text.primary', mr: 'auto' }}
            >
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={100}
                height={30}
                style={{ height: 28, width: 'auto', objectFit: 'contain', borderRadius: 8 }}
                priority
              />
              <Box component="span" sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: { xs: 'none', sm: 'inline' } }}>
                {BRAND_NAME}
              </Box>
            </Box>

            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
              {NAV_LINKS.map((item) => (
                <Button key={item.key} component={Link} href={item.href} color="inherit" size="small">
                  {t(item.key)}
                </Button>
              ))}
              <LanguageSwitcher />
              {!loading &&
                (user ? (
                  <Button component={Link} href="/dashboard" variant="contained" size="small">
                    {t('dashboard')}
                  </Button>
                ) : (
                  <>
                    <Button component={Link} href="/login" color="inherit" size="small">
                      {t('signIn')}
                    </Button>
                    <Button component={Link} href="/pricing" variant="contained" size="small">
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
