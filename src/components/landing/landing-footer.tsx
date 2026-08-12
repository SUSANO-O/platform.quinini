'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Grid,
  Link as MuiLink,
  Stack,
  Typography,
  Divider,
} from '@mui/material';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import {
  buildContactWhatsAppUrl,
  SALES_WHATSAPP_DISPLAY,
  SALES_WHATSAPP_LINK_PROPS,
} from '@/lib/sales-whatsapp';

export function LandingFooter() {
  const t = useTranslations('footer');

  return (
    <Box component="footer" sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Image
                src={BRAND_LOGO_SRC}
                alt={BRAND_NAME}
                width={90}
                height={27}
                style={{ height: 28, width: 'auto', objectFit: 'contain', borderRadius: 8 }}
              />
              <Typography fontWeight={700}>{BRAND_NAME}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 360 }}>
              {t('tagline')}
            </Typography>
            <MuiLink href={buildContactWhatsAppUrl()} {...SALES_WHATSAPP_LINK_PROPS} underline="hover" color="inherit" fontWeight={600}>
              WhatsApp {SALES_WHATSAPP_DISPLAY}
            </MuiLink>
          </Grid>

          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="overline" display="block" sx={{ mb: 1.5 }}>
              {t('product')}
            </Typography>
            <Stack spacing={1}>
              <MuiLink component={Link} href="/pricing#api" underline="hover" color="text.secondary" variant="body2">
                API
              </MuiLink>
              <MuiLink component={Link} href="/pricing" underline="hover" color="text.secondary" variant="body2">
                {t('plans')}
              </MuiLink>
              <MuiLink component={Link} href="#agents" underline="hover" color="text.secondary" variant="body2">
                Agentes
              </MuiLink>
            </Stack>
          </Grid>

          <Grid size={{ xs: 6, md: 2 }}>
            <Typography variant="overline" display="block" sx={{ mb: 1.5 }}>
              {t('contact')}
            </Typography>
            <Stack spacing={1}>
              <MuiLink href={buildContactWhatsAppUrl()} {...SALES_WHATSAPP_LINK_PROPS} underline="hover" color="text.secondary" variant="body2">
                WhatsApp
              </MuiLink>
              <MuiLink component={Link} href="#training" underline="hover" color="text.secondary" variant="body2">
                Capacitación
              </MuiLink>
              <MuiLink component={Link} href="/preguntas-frecuentes" underline="hover" color="text.secondary" variant="body2">
                FAQ
              </MuiLink>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="overline" display="block" sx={{ mb: 1.5 }}>
              {t('legal')}
            </Typography>
            <Stack spacing={1}>
              <MuiLink component={Link} href="/terminos-y-condiciones" underline="hover" color="text.secondary" variant="body2">
                {t('terms')}
              </MuiLink>
              <MuiLink component={Link} href="/politica-de-privacidad" underline="hover" color="text.secondary" variant="body2">
                {t('privacy')}
              </MuiLink>
              <MuiLink component={Link} href="/politica-de-cookies" underline="hover" color="text.secondary" variant="body2">
                {t('cookies')}
              </MuiLink>
              <MuiLink component={Link} href="/politica-de-reembolso" underline="hover" color="text.secondary" variant="body2">
                {t('refunds')}
              </MuiLink>
              <MuiLink component={Link} href="/compliance" underline="hover" color="text.secondary" variant="body2">
                Tratamiento de datos
              </MuiLink>
            </Stack>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            &copy; {new Date().getFullYear()} BotIvA. {t('rights')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Powered by quinini
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
