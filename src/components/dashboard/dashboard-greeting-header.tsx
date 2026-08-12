'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Crown, Clock, LayoutDashboard, Zap } from '@/components/ui/icons';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';

export function DashboardGreetingHeader({
  displayName,
  actions,
  loadingPlan,
  isPremium,
  isTrialActive,
  trialDaysRemaining,
  planLabel,
}: {
  displayName: string;
  actions?: ReactNode;
  loadingPlan?: boolean;
  isPremium?: boolean;
  isTrialActive?: boolean;
  trialDaysRemaining?: number;
  planLabel?: string;
}) {
  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={2}
      sx={{ mb: 2 }}
    >
      <Box>
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          icon={<LayoutDashboard size={13} />}
          label="Panel de Control"
          sx={{ mb: 1 }}
        />
        <Typography variant="h4" component="h1" sx={{ m: 0, fontWeight: 700 }}>
          Hola,{' '}
          <Box component="span" color="primary.main">
            {displayName}
          </Box>{' '}
          👋
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, textTransform: 'capitalize' }}>
          {new Date().toLocaleDateString('es', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {actions}
        {loadingPlan ? (
          <Chip size="small" label="…" />
        ) : isPremium ? (
          <Chip size="small" color="primary" icon={<Crown size={11} />} label={`${planLabel} — activo`} />
        ) : isTrialActive ? (
          <Chip size="small" color="warning" icon={<Clock size={11} />} label={`Trial — ${trialDaysRemaining} días`} />
        ) : (
          <Chip
            component={Link}
            href="/dashboard/settings"
            clickable
            size="small"
            color="secondary"
            icon={<Zap size={11} />}
            label="Actualizar plan →"
          />
        )}
      </Stack>
    </Stack>
  );
}
