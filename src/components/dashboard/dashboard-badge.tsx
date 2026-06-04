export function DashboardBadge({
  children,
  variant = 'muted',
}: {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'muted';
}) {
  return (
    <span className={`dashboard-badge dashboard-badge--${variant}`}>{children}</span>
  );
}
