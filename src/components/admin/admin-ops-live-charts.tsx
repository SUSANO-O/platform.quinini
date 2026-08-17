'use client';

import { formatTimelineTick, niceChartAxis, pointHasLatency, type LiveTimelinePoint } from '@/lib/admin-ops-live';
import { BRAND, STATE } from '@/lib/brand-colors';

const MUTE = '#9aa3ad';
const LINE = 'rgba(255,255,255,0.08)';
const NOW = '#c9843a';
const BAR = BRAND.primaryLight;

function maxOf(ns: number[], fallback: number): number {
  return Math.max(fallback, ...ns);
}

/** Mini barras de turnos — cabe en un KPI. */
export function OpsSparkBars({
  points,
  color = BAR,
}: {
  points: LiveTimelinePoint[];
  color?: string;
}) {
  if (points.length === 0) return null;
  const w = 96;
  const h = 28;
  const max = maxOf(points.map((p) => p.requests), 1);
  const gap = points.length > 40 ? 0 : 1;
  const slot = w / points.length;
  const bw = Math.max(1, slot - gap);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {points.map((p, i) => {
        const bh = p.requests <= 0 ? 1 : Math.max(2, (p.requests / max) * (h - 2));
        return (
          <rect
            key={`${p.minute}-${i}`}
            x={i * slot}
            y={h - bh}
            width={bw}
            height={bh}
            fill={p.requests > 0 ? color : LINE}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

/** Mini curva de latencia. */
export function OpsSparkLine({
  points,
  color = NOW,
}: {
  points: LiveTimelinePoint[];
  color?: string;
}) {
  if (points.length === 0) return null;
  const w = 96;
  const h = 28;
  const vals = points.map((p) => p.avgSec);
  const max = maxOf(vals, 1);
  const d = points
    .map((p, i) => {
      const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * w;
      const y = h - 2 - (p.avgSec / max) * (h - 4);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function latencyIndexRuns(points: LiveTimelinePoint[]): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [];
  points.forEach((p, i) => {
    if (pointHasLatency(p)) {
      cur.push(i);
      return;
    }
    if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);
  return runs;
}

function xLabelIndexes(n: number): number[] {
  if (n <= 1) return [0];
  if (n <= 8) return Array.from({ length: n }, (_, i) => i);
  const want = Math.min(6, n);
  const set = new Set<number>([0, n - 1]);
  for (let k = 1; k < want - 1; k++) set.add(Math.round((k * (n - 1)) / (want - 1)));
  return [...set].sort((a, b) => a - b);
}

function fmtAxisSec(n: number): string {
  return Number.isInteger(n) ? `${n} s` : `${n.toFixed(1)} s`;
}

/** Turnos (barras) + latencia (línea). Huecos sin tráfico no se pintan como 0 s. */
export function OpsComboChart({
  points,
  meanSec,
}: {
  points: LiveTimelinePoint[];
  meanSec: number;
}) {
  if (points.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: MUTE }}>
        Sin muestras en esta ventana.
      </p>
    );
  }

  const w = 760;
  const h = 248;
  const pad = { t: 18, r: 56, b: 36, l: 52 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const sampled = points.filter(pointHasLatency);
  const secAxis = niceChartAxis(maxOf([meanSec, ...sampled.map((p) => p.avgSec)], 5));
  const reqAxis = niceChartAxis(maxOf(points.map((p) => p.requests), 1), { integer: true });
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.max(1.5, slot * (n > 80 ? 0.72 : 0.58));
  const xAt = (i: number) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const ySec = (sec: number) => pad.t + innerH * (1 - sec / secAxis.max);
  const yReq = (req: number) => pad.t + innerH * (1 - req / reqAxis.max);
  const baseY = pad.t + innerH;
  const runs = latencyIndexRuns(points);
  const lineD = runs
    .map((run) =>
      run
        .map((i, k) => `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${ySec(points[i].avgSec).toFixed(1)}`)
        .join(' '),
    )
    .join(' ');
  const areaD = runs
    .filter((run) => run.length >= 1)
    .map((run) => {
      const top = run
        .map((i, k) => `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${ySec(points[i].avgSec).toFixed(1)}`)
        .join(' ');
      const last = run[run.length - 1];
      const first = run[0];
      return `${top} L${xAt(last).toFixed(1)},${baseY.toFixed(1)} L${xAt(first).toFixed(1)},${baseY.toFixed(1)} Z`;
    })
    .join(' ');
  const meanY = ySec(Math.min(meanSec, secAxis.max));
  const xLabels = xLabelIndexes(n);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={248}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Barras de turnos por minuto y línea de latencia en segundos. Los minutos sin tráfico no cuentan como cero segundos."
    >
      {secAxis.ticks.map((sec) => {
        const y = ySec(sec);
        return (
          <g key={`sec-${sec}`}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={LINE} />
            <text x={pad.l - 8} y={y + 4} textAnchor="end" fill={MUTE} fontSize={11}>
              {fmtAxisSec(sec)}
            </text>
          </g>
        );
      })}
      {reqAxis.ticks.map((req) => (
        <text
          key={`req-${req}`}
          x={w - pad.r + 8}
          y={yReq(req) + 4}
          textAnchor="start"
          fill={BAR}
          fontSize={11}
        >
          {Math.round(req)}
        </text>
      ))}
      <text x={pad.l} y={12} fill={MUTE} fontSize={10}>
        segundos
      </text>
      <text x={w - pad.r} y={12} textAnchor="end" fill={BAR} fontSize={10}>
        turnos
      </text>
      {points.map((p, i) => {
        const x = n === 1 ? pad.l + innerW / 2 - barW / 2 : pad.l + i * slot + (slot - barW) / 2;
        const top = yReq(p.requests);
        const bh = Math.max(p.requests > 0 ? 3 : 0, pad.t + innerH - top);
        if (bh <= 0) return null;
        return (
          <rect
            key={`${p.minute}-bar`}
            x={x}
            y={top}
            width={barW}
            height={bh}
            fill={BAR}
            opacity={p.requests > 0 ? 0.38 : 0.1}
          >
            <title>
              {p.minute}
              {p.requests > 0
                ? ` · ${p.requests} ${p.requests === 1 ? 'turno' : 'turnos'} · ${p.avgSec.toFixed(1).replace('.', ',')} s`
                : ' · sin tráfico'}
            </title>
          </rect>
        );
      })}
      {areaD ? <path d={areaD} fill={NOW} opacity={0.16} /> : null}
      {sampled.length > 0 ? (
        <g>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={meanY}
            y2={meanY}
            stroke={NOW}
            strokeDasharray="5 4"
            opacity={0.85}
          />
          <text x={w - pad.r - 4} y={meanY - 6} textAnchor="end" fill={NOW} fontSize={10}>
            media {meanSec.toFixed(1).replace('.', ',')} s
          </text>
        </g>
      ) : null}
      {lineD ? <path d={lineD} fill="none" stroke={NOW} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {sampled.map((p) => {
        const i = points.indexOf(p);
        return (
          <circle key={`${p.minute}-dot`} cx={xAt(i)} cy={ySec(p.avgSec)} r={3} fill={NOW}>
            <title>
              {p.minute} · {p.requests} {p.requests === 1 ? 'turno' : 'turnos'} · {p.avgSec.toFixed(1).replace('.', ',')} s
            </title>
          </circle>
        );
      })}
      {xLabels.map((i) => (
        <text key={`${points[i].minute}-lbl`} x={xAt(i)} y={h - 10} textAnchor="middle" fill={MUTE} fontSize={11}>
          {formatTimelineTick(points[i].minute)}
        </text>
      ))}
    </svg>
  );
}

export const OPS_CHART_COLORS = {
  mute: MUTE,
  line: LINE,
  now: NOW,
  bar: BAR,
  err: STATE.error,
} as const;
