'use client';

import { RefreshCw } from 'lucide-react';

/** Indicador discreto: refresh en segundo plano sin bloquear la UI. */
export function BackgroundRefreshIndicator({
  active,
  label = 'Actualizando…',
}: {
  active: boolean;
  label?: string;
}) {
  if (!active) return null;
  return (
    <span
      className="dashboard-bg-refresh"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <RefreshCw size={11} className="dashboard-bg-refresh__icon" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
