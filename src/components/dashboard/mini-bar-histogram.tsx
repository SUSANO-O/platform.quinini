'use client';

/**
 * Mini histograma de barras verticales, reutilizable dentro de los modales de
 * métricas del dashboard (distribución horaria, y lo que se sume después).
 * Sin dependencias de gráficos externas — mismo espíritu que conv-wave-chart.
 */
/** Fila "label — valor — barra horizontal proporcional", para modales de métricas. */
export function MetricBarRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--muted-foreground)' }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function MiniBarHistogram({
  values,
  labels,
  color = '#2a78d6',
  height = 96,
  formatValue,
}: {
  values: number[];
  labels: string[];
  color?: string;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => {
        const pct = Math.max((v / max) * 100, v > 0 ? 4 : 0);
        return (
          <div
            key={i}
            title={`${labels[i]}: ${formatValue ? formatValue(v) : v}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}
          >
            <div
              style={{
                width: '100%',
                height: `${pct}%`,
                minHeight: v > 0 ? 3 : 0,
                borderRadius: '3px 3px 0 0',
                background: color,
                opacity: v > 0 ? 0.88 : 0.15,
                transition: 'opacity 0.15s',
              }}
            />
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
