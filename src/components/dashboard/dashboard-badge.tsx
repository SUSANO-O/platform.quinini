'use client';

import Chip from '@mui/material/Chip';

export function DashboardBadge({
  children,
  variant = 'muted',
}: {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'muted';
}) {
  const color =
    variant === 'success' ? 'success' : variant === 'danger' ? 'error' : 'default';

  return (
    <Chip size="small" color={color} label={children} variant={variant === 'muted' ? 'outlined' : 'filled'} />
  );
}
