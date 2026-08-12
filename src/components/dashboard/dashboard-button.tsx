'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';

type DashboardButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'icon';
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
};

function mapVariant(variant: 'primary' | 'secondary' | 'icon') {
  if (variant === 'primary') return 'contained' as const;
  if (variant === 'icon') return 'text' as const;
  return 'outlined' as const;
}

export function DashboardButton({
  children,
  variant = 'secondary',
  className = '',
  disabled,
  title,
  'aria-label': ariaLabel,
  'aria-expanded': ariaExpanded,
  onClick,
}: DashboardButtonProps & { onClick?: () => void }) {
  if (variant === 'icon') {
    return (
      <IconButton
        className={className}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        onClick={onClick}
        size="small"
        color="primary"
      >
        {children}
      </IconButton>
    );
  }

  return (
    <Button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      variant={mapVariant(variant)}
      color="primary"
      size="small"
    >
      {children}
    </Button>
  );
}

export function DashboardButtonLink({
  children,
  href,
  variant = 'secondary',
  className = '',
  'data-tour': dataTour,
}: DashboardButtonProps & { href: string; 'data-tour'?: string }) {
  if (variant === 'icon') {
    return (
      <IconButton
        component={Link}
        href={href}
        className={className}
        data-tour={dataTour}
        size="small"
        color="primary"
      >
        {children}
      </IconButton>
    );
  }

  return (
    <Button
      component={Link}
      href={href}
      className={className}
      data-tour={dataTour}
      variant={mapVariant(variant)}
      color="primary"
      size="small"
    >
      {children}
    </Button>
  );
}
