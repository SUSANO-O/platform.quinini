import type { ReactNode } from 'react';

export function DashboardShell({
  children,
  className = '',
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  /** Más ancho para grids de tarjetas (widgets, asistentes). */
  wide?: boolean;
}) {
  return (
    <div className={`dashboard-shell ${className}`.trim()}>
      <div className="hero-glow pointer-events-none" style={{ background: 'var(--primary)', top: '-200px', right: '-60px' }} />
      <div className={`dashboard-shell__inner${wide ? ' dashboard-shell__inner--wide' : ''}`}>{children}</div>
    </div>
  );
}
