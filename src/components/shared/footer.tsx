'use client';

import Link from 'next/link';
import Image from 'next/image';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import MuiLink from '@mui/material/Link';
import { SITE_COMPANY_LINKS, SITE_LEGAL_LINKS, SITE_PRODUCT_LINKS } from '@/lib/site-nav';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import {
  buildContactWhatsAppUrl,
  SALES_WHATSAPP_DISPLAY,
  SALES_WHATSAPP_LINK_PROPS,
} from '@/lib/sales-whatsapp';

function LinkList({
  title,
  links,
}: {
  title: string;
  links: readonly { readonly href: string; readonly label: string; readonly external?: boolean }[];
}) {
  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Stack spacing={1}>
        {links.map((l) =>
          'external' in l && l.external ? (
            <MuiLink key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" underline="hover" color="text.secondary" variant="body2">
              {l.label}
            </MuiLink>
          ) : (
            <MuiLink key={l.href} component={Link} href={l.href} underline="hover" color="text.secondary" variant="body2">
              {l.label}
            </MuiLink>
          ),
        )}
      </Stack>
    </Box>
  );
}

export function Footer() {
  return (
    <Box component="footer" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={36}
                height={36}
                style={{ height: 32, width: 32, objectFit: 'contain', borderRadius: 8 }}
              />
              <Typography fontWeight={700}>{BRAND_NAME}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Agentes de IA como servicio.
              <br />
              API REST full, integración en minutos.
            </Typography>
            <MuiLink href={buildContactWhatsAppUrl()} {...SALES_WHATSAPP_LINK_PROPS} underline="hover" color="inherit" fontWeight={600} variant="body2">
              WhatsApp {SALES_WHATSAPP_DISPLAY}
            </MuiLink>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <LinkList title="Producto" links={SITE_PRODUCT_LINKS} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <LinkList title="Empresa" links={SITE_COMPANY_LINKS} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <LinkList title="Legal" links={SITE_LEGAL_LINKS} />
          </Grid>
        </Grid>
        <Divider sx={{ my: 4 }} />
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} {BRAND_NAME}. Todos los derechos reservados.
        </Typography>
      </Container>
    </Box>
  );
}
