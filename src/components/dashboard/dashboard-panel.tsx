import type { CSSProperties, ReactNode } from 'react';

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
  const classes = [
    'dashboard-panel',
    inactive ? 'dashboard-panel--inactive' : '',
    interactive ? 'dashboard-panel--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} style={{ ...style, zIndex: elevated ? 40 : undefined }}>
      {showAccent ? (
        <div className="dashboard-panel__accent" style={{ background: accentColor }} />
      ) : null}
      {children}
    </article>
  );
}
