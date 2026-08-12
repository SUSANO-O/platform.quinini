'use client';

import type { CSSProperties, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';

export function DashboardPanel({
  children,
  accentColor = 'transparent',
  showAccent = true,
  inactive,
  interactive,
  elevated,
  className = '',
  style,
}: {
  children: ReactNode;
  accentColor?: string;
  showAccent?: boolean;
  inactive?: boolean;
  interactive?: boolean;
  elevated?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Paper
      component="article"
      elevation={elevated ? 4 : 0}
      className={className}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        opacity: inactive ? 0.72 : 1,
        zIndex: elevated ? 40 : undefined,
        transition: 'box-shadow .2s ease, transform .2s ease',
        ...(interactive
          ? {
              cursor: 'pointer',
              '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
            }
          : null),
        ...style,
      }}
    >
      {showAccent ? (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            bgcolor: accentColor === 'transparent' ? 'primary.main' : accentColor,
            opacity: accentColor === 'transparent' ? 0 : 1,
          }}
        />
      ) : null}
      {children}
    </Paper>
  );
}
