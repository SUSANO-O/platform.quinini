'use client';

import Chip from '@mui/material/Chip';

export function DashboardStatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <Chip
      size="small"
      role="status"
      color={active ? 'success' : 'default'}
      variant={active ? 'filled' : 'outlined'}
      label={active ? 'Activo' : 'Inactivo'}
      sx={{
        height: 22,
        fontSize: '0.625rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        '& .MuiChip-label': { px: 0.85 },
      }}
    />
  );
}
