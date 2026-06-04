'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function DashboardDropdownMenu({
  trigger,
  children,
  align = 'right',
  placement = 'bottom',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: 'right' | 'left';
  /** `bottom` abre hacia abajo (menú en cabecera de tarjeta). `top` hacia arriba (pie de tarjeta). */
  placement?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const alignClass = align === 'left' ? 'dashboard-dropdown--left' : '';
  const placementClass = placement === 'bottom' ? 'dashboard-dropdown--placement-bottom' : 'dashboard-dropdown--placement-top';

  return (
    <div
      className={`dashboard-dropdown relative${open ? ' dashboard-dropdown--open' : ''} ${alignClass} ${placementClass}`.trim()}
      ref={ref}
    >
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div className="dashboard-menu" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardMenuItem({
  children,
  onClick,
  href,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  const className = `dashboard-menu__item${danger ? ' dashboard-menu__item--danger' : ''}`;

  if (href) {
    return (
      <Link href={href} className={className} role="menuitem" onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className} role="menuitem" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function DashboardMenuDivider() {
  return <div className="dashboard-menu__divider" role="separator" />;
}
