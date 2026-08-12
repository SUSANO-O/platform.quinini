'use client';

import type { LucideIcon } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export function DashboardMetaRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      component="p"
      className="dashboard-meta-row"
      sx={{ m: 0, color: 'text.secondary', minWidth: 0 }}
    >
      <Icon size={12} aria-hidden className="dashboard-meta-row__icon" />
      <Typography
        component="span"
        variant="caption"
        color="inherit"
        sx={{ fontSize: '0.6875rem', lineHeight: 1.35, fontWeight: 500, minWidth: 0 }}
      >
        {children}
      </Typography>
    </Stack>
  );
}
