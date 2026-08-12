'use client';

import type { LucideIcon } from '@/components/ui/icons';
import { Info } from '@/components/ui/icons';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Grid from '@mui/material/Grid';

export type DashboardStatItem = {
  label: string;
  value: string | number;
  hint?: string;
};

export function DashboardStatStrip({
  title,
  titleHint,
  icon: Icon,
  stats,
}: {
  title: string;
  titleHint?: string;
  icon?: LucideIcon;
  stats: DashboardStatItem[];
}) {
  return (
    <Paper component="section" elevation={0} aria-label={title} sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        {Icon ? <Icon size={16} aria-hidden /> : null}
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          {titleHint ? (
            <Typography variant="caption" color="text.secondary">
              {titleHint}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      <Grid container spacing={2}>
        {stats.map((s) => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                {s.value}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption" color="text.secondary">
                  {s.label}
                </Typography>
                {s.hint ? (
                  <Tooltip title={s.hint}>
                    <Box component="span" sx={{ display: 'inline-flex', color: 'text.secondary' }} tabIndex={0} role="note" aria-label={s.hint}>
                      <Info size={11} strokeWidth={2.25} aria-hidden />
                    </Box>
                  </Tooltip>
                ) : null}
              </Stack>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
