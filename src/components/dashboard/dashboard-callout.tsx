'use client';

import type { LucideIcon } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';

export function DashboardCallout({
  children,
  icon: Icon,
  variant = 'default',
}: {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: 'default' | 'warm';
}) {
  return (
    <Alert
      severity={variant === 'warm' ? 'warning' : 'info'}
      icon={Icon ? <Icon size={16} aria-hidden /> : undefined}
      sx={{ borderRadius: 2, alignItems: 'center' }}
    >
      {children}
    </Alert>
  );
}
