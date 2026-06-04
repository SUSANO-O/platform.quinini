export function DashboardStatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`dashboard-status-badge${active ? ' dashboard-status-badge--active' : ' dashboard-status-badge--inactive'}`}
      role="status"
    >
      <span className="dashboard-status-badge__dot" aria-hidden />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}
