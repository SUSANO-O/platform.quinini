import Link from 'next/link';
import type { ReactNode } from 'react';

type DashboardButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'icon';
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  'aria-expanded'?: boolean;
};

function btnClass(variant: string, extra = '') {
  return `dashboard-btn dashboard-btn--${variant} ${extra}`.trim();
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
  return (
    <button
      type="button"
      className={btnClass(variant, className)}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function DashboardButtonLink({
  children,
  href,
  variant = 'secondary',
  className = '',
  'data-tour': dataTour,
}: DashboardButtonProps & { href: string; 'data-tour'?: string }) {
  return (
    <Link href={href} className={btnClass(variant, className)} data-tour={dataTour}>
      {children}
    </Link>
  );
}
