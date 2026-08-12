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
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { SITE_NAV_LINKS } from '@/lib/site-nav';

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <>
      <AppBar position="fixed">
        <Container maxWidth="lg" disableGutters sx={{ px: 3 }}>
          <Toolbar disableGutters sx={{ minHeight: 64 }}>
            <Box
              component={Link}
              href="/"
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', color: 'text.primary', mr: 'auto' }}
            >
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={120}
                height={36}
                style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 12 }}
                priority
              />
              <Box component="span" sx={{ fontWeight: 700, fontSize: '1.05rem', display: { xs: 'none', sm: 'inline' } }}>
                {BRAND_NAME}
              </Box>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', md: 'flex' } }}>
              {SITE_NAV_LINKS.map((l) => (
                <Button key={l.href} component={Link} href={l.href} color="inherit" size="small">
                  {l.label}
                </Button>
              ))}
              {!loading &&
                (user ? (
                  <Button component={Link} href="/dashboard" variant="contained" size="small">
                    Dashboard →
                  </Button>
                ) : (
                  <>
                    <Button component={Link} href="/login" color="inherit" size="small">
                      Iniciar sesión
                    </Button>
                    <Button component={Link} href="/pricing" variant="contained" size="small">
                      Ver precios
                    </Button>
                  </>
                ))}
            </Stack>

            <IconButton
              edge="end"
              color="inherit"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              sx={{ display: { md: 'none' } }}
            >
              {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)} sx={{ display: { md: 'none' } }} PaperProps={{ sx: { width: 'min(320px, 88vw)' } }}>
        <Toolbar />
        <List>
          {SITE_NAV_LINKS.map((l) => (
            <ListItemButton key={l.href} component={Link} href={l.href} onClick={() => setOpen(false)}>
              <ListItemText primary={l.label} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <Stack spacing={1} sx={{ p: 2 }}>
          {!loading &&
            (user ? (
              <Button component={Link} href="/dashboard" variant="contained" fullWidth onClick={() => setOpen(false)}>
                Dashboard →
              </Button>
            ) : (
              <>
                <Button component={Link} href="/login" variant="outlined" fullWidth onClick={() => setOpen(false)}>
                  Iniciar sesión
                </Button>
                <Button component={Link} href="/pricing" variant="contained" fullWidth onClick={() => setOpen(false)}>
                  Ver precios
                </Button>
              </>
            ))}
        </Stack>
      </Drawer>
    </>
  );
}
