'use client';

import type { LucideIcon } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import { FlowsBetaBadge } from '@/components/flows/flows-beta-badge';

export function DashboardPageHeader({
  badge,
  badgeIcon: BadgeIcon,
  titleIcon: TitleIcon,
  title,
  titleAccent,
  description,
  actions,
  beta,
  compact,
  hideIcon,
}: {
  badge: string;
  badgeIcon?: LucideIcon;
  titleIcon?: LucideIcon;
  title: string;
  titleAccent?: string;
  description?: string;
  actions?: ReactNode;
  beta?: boolean;
  compact?: boolean;
  hideIcon?: boolean;
}) {
  const HeadingIcon = TitleIcon ?? BadgeIcon;
  const showIcon = !hideIcon && HeadingIcon;

  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
      spacing={2}
      sx={{ mb: compact ? 2 : 3.5 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            icon={BadgeIcon ? <BadgeIcon size={13} /> : undefined}
            label={badge}
          />
          {beta ? <FlowsBetaBadge /> : null}
        </Stack>
        <Stack direction="row" spacing={1.25} alignItems="center">
          {showIcon ? (
            <Avatar
              variant="rounded"
              sx={{
                width: compact ? 36 : 40,
                height: compact ? 36 : 40,
                bgcolor: 'primary.main',
                color: '#fff',
              }}
            >
              <HeadingIcon size={20} strokeWidth={1.75} />
            </Avatar>
          ) : null}
          <Typography
            variant={compact ? 'h5' : 'h4'}
            component="h1"
            sx={{ m: 0, fontWeight: 800, letterSpacing: '-0.03em', textWrap: 'balance' }}
          >
            {title}
            {titleAccent ? (
              <>
                {' '}
                <Box component="span" color="primary.main">
                  {titleAccent}
                </Box>
              </>
            ) : null}
          </Typography>
        </Stack>
        {description ? (
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ shrink: 0 }}>
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}
