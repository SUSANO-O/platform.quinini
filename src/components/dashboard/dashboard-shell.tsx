import type { ReactNode } from 'react';

export type DashboardShellWidth = 'default' | 'wide' | 'home' | 'narrow' | 'full';

const WIDTH_CLASS: Record<DashboardShellWidth, string> = {
  default: '',
  wide: ' dashboard-shell__inner--wide',
  home: ' dashboard-shell__inner--home',
  narrow: ' dashboard-shell__inner--narrow',
  full: ' dashboard-shell__inner--full',
};

export function DashboardShell({
  children,
  className = '',
  wide = false,
  width,
}: {
  children: ReactNode;
  className?: string;
  /** @deprecated Usar width="wide" */
  wide?: boolean;
  width?: DashboardShellWidth;
}) {
  const resolved = width ?? (wide ? 'wide' : 'default');
  const innerClass = `dashboard-shell__inner${WIDTH_CLASS[resolved]}`;

  return (
    <div className={`dashboard-shell ${className}`.trim()}>
      <div className="hero-glow pointer-events-none dashboard-shell__glow dashboard-shell__glow--primary" />
      <div className="hero-glow pointer-events-none dashboard-shell__glow dashboard-shell__glow--secondary" />
      <div className={innerClass}>{children}</div>
    </div>
  );
}
