'use client';

import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { DashboardPanel } from '@/components/dashboard/dashboard-panel';

export function DashboardResourceCard({
  inactive,
  avatar,
  status,
  title,
  subtitle,
  subtitleTitle,
  meta,
  actions,
  headerAction,
  footer,
}: {
  inactive?: boolean;
  avatar: ReactNode;
  status: ReactNode;
  title: string;
  subtitle?: string;
  subtitleTitle?: string;
  meta: ReactNode;
  actions: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DashboardPanel
      showAccent={false}
      inactive={inactive}
      interactive
      className="dashboard-resource-card"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box
        className="dashboard-resource-card__body"
        sx={{
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: 0.75,
          minWidth: 0,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={0.75}>
          {avatar}
          <Stack direction="row" spacing={0.5} alignItems="center" className="dashboard-resource-card__header-end">
            {status}
            {headerAction}
          </Stack>
        </Stack>

        <Typography
          component="h2"
          className="dashboard-resource-card__title"
          sx={{
            m: 0,
            fontFamily: '"Outfit", "Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: '0.9375rem',
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '-0.02em',
            color: 'text.primary',
          }}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            className="dashboard-resource-card__subtitle"
            variant="caption"
            color="text.secondary"
            title={subtitleTitle}
            noWrap
            sx={{ display: 'block', fontWeight: 500, lineHeight: 1.35, mt: -0.25 }}
          >
            {subtitle}
          </Typography>
        ) : null}

        <Box
          className="dashboard-resource-card__meta"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.35,
            color: 'text.secondary',
            flex: 1,
            minWidth: 0,
          }}
        >
          {meta}
        </Box>

        <Box
          className="dashboard-resource-card__actions"
          sx={{
            mt: 'auto',
            pt: 0.5,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0.5,
            '& .MuiButton-root': {
              width: '100%',
              minHeight: 30,
              py: 0.4,
              px: 1,
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '8px',
            },
            '& .dashboard-resource-card__action-full': {
              gridColumn: '1 / -1',
            },
          }}
        >
          {actions}
        </Box>
      </Box>

      {footer ? (
        <>
          <Divider />
          <Box sx={{ px: 1.5, py: 1 }}>{footer}</Box>
        </>
      ) : null}
    </DashboardPanel>
  );
}
