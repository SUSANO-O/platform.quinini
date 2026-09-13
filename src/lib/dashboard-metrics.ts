/**
 * Cálculos del panel de inicio.
 *
 * Vivían dentro del JSX de `src/app/dashboard/page.tsx`, donde no se podían
 * probar: el runner de este repo es `environment: 'node'` y solo toma
 * `*.test.ts`, así que un componente React no entra. Sacando las decisiones
 * aquí, la pantalla se queda con el dibujo y estas reglas sí tienen pruebas.
 *
 * Nada de esto inventa datos: solo deriva de lo que ya devuelve la analítica
 * del widget. En particular no existe "periodo anterior" en la respuesta —
 * la única comparación honesta es el último mes contra el anterior.
 */

/** Papel del color, no un hex: quién lo pinta decide con qué tono. */
export type MetricTone = 'success' | 'brand' | 'warning' | 'danger' | 'neutral';

export type DashboardSummary = {
  totalSessions: number;
  avgMessagesPerSession: number;
  escalationRate: number;
  dropOffRate: number;
  resolutionRate: number;
};

export type MonthPoint = { month: string; sessions: number };

/** Altura mínima para que un mes flojo siga siendo visible en la gráfica. */
const MIN_BAR_PCT = 6;

/** Hora del día en formato de 12 h. `null` cuando todavía no hubo actividad. */
export function formatHourLabel(hour: number | null): string {
  if (hour == null) return '—';
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export type MonthDelta = {
  current: number;
  previous: number;
  /** Variación redondeada a entero; negativa si bajó. */
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
};

/**
 * Último mes contra el anterior. Devuelve `null` cuando no hay comparación
 * que mostrar — un solo mes, o un mes anterior en cero (dividir daría
 * infinito y se pintaría como "∞%").
 */
export function monthOverMonth(byMonth: MonthPoint[]): MonthDelta | null {
  if (byMonth.length < 2) return null;

  const previous = byMonth[byMonth.length - 2].sessions;
  const current = byMonth[byMonth.length - 1].sessions;
  if (previous <= 0) return null;

  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat';

  return { current, previous, deltaPct, direction };
}

export type OutcomeRow = {
  key: 'resolved' | 'escalated' | 'dropped';
  label: string;
  pct: number;
  count: number;
  tone: MetricTone;
};

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Cómo terminaron las conversaciones. Los conteos se derivan del porcentaje
 * sobre el total de sesiones — la analítica da tasas, no conteos por salida.
 */
export function outcomeBreakdown(summary: DashboardSummary): OutcomeRow[] {
  const total = Math.max(0, summary.totalSessions);
  const row = (
    key: OutcomeRow['key'],
    label: string,
    rate: number,
    tone: MetricTone,
  ): OutcomeRow => {
    const pct = clampPct(rate);
    return { key, label, pct, count: Math.round((pct / 100) * total), tone };
  };

  return [
    row('resolved', 'Resueltas', summary.resolutionRate, 'success'),
    row('escalated', 'Escaladas a humano', summary.escalationRate, 'brand'),
    row('dropped', 'Abandonadas', summary.dropOffRate, 'warning'),
  ];
}

export type MonthBar = {
  month: string;
  /** Etiqueta corta del eje: el mes sin el año. */
  label: string;
  sessions: number;
  heightPct: number;
  isCurrent: boolean;
};

/** Barras normalizadas contra el mes más alto, en el orden recibido. */
export function monthBarHeights(byMonth: MonthPoint[]): MonthBar[] {
  const max = Math.max(...byMonth.map(m => m.sessions), 0);

  return byMonth.map((m, i) => ({
    month: m.month,
    label: m.month.slice(5),
    sessions: m.sessions,
    heightPct: max > 0 ? Math.max(Math.round((m.sessions / max) * 100), MIN_BAR_PCT) : MIN_BAR_PCT,
    isCurrent: i === byMonth.length - 1,
  }));
}
