'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Activity } from '@/components/ui/icons';

export type WavePoint = { date: string; agents: number; api: number; sessions?: number };

const W = 800;
const H = 200;
const PAD = { t: 18, r: 12, b: 30, l: 42 };

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function formatDayLong(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function formatAxisY(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function pickXLabelIndices(count: number, maxLabels = 9): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const indices = new Set<number>([0, count - 1]);
  const step = (count - 1) / (maxLabels - 1);
  for (let i = 1; i < maxLabels - 1; i++) indices.add(Math.round(i * step));
  return [...indices].sort((a, b) => a - b);
}

function niceCeilMax(raw: number): number {
  if (raw <= 0) return 1;
  if (raw <= 5) return 5;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / exp;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * exp;
}

function slotCenterX(idx: number, slotW: number): number {
  return PAD.l + idx * slotW + slotW / 2;
}

type WavePathPoint = { x: number; y: number };

function buildLinePath(points: WavePathPoint[]): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function buildAreaPath(points: WavePathPoint[], baseline: number): string {
  if (!points.length) return '';
  const line = buildLinePath(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function ConversationWaveChart({
  data,
  showApi,
  loading,
  error,
}: {
  data: WavePoint[];
  showApi: boolean;
  loading?: boolean;
  error?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<'bars' | 'wave'>('bars');

  const stats = useMemo(() => {
    if (!data.length) return null;
    let totalWidget = 0;
    let totalApi = 0;
    let peakVal = 0;
    let peakDate = '';
    let activeDays = 0;
    for (const d of data) {
      totalWidget += d.agents;
      totalApi += d.api;
      const dayTotal = d.agents + d.api;
      if (dayTotal > 0) activeDays++;
      if (dayTotal > peakVal) {
        peakVal = dayTotal;
        peakDate = d.date;
      }
    }
    const total = totalWidget + totalApi;
    return {
      total,
      totalWidget,
      totalApi,
      avg: Math.round(total / data.length),
      activeDays,
      peakVal,
      peakDate,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="conv-wave conv-wave--loading">
        <div className="metric-skeleton" style={{ width: '100%', height: H, borderRadius: 8 }} />
      </div>
    );
  }

  if (error) {
    return <p className="conv-wave-empty">No se pudo cargar el gráfico. Recarga la página.</p>;
  }

  if (!data.length) {
    return <p className="conv-wave-empty">Sin conversaciones en este periodo.</p>;
  }

  const hasApiData = showApi && data.some((d) => d.api > 0);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const baseline = PAD.t + innerH;
  const slotW = innerW / data.length;
  const barGap = hasApiData ? 1.5 : 0;
  const groupW = Math.max(3, slotW * 0.72);
  const singleBarW = Math.max(2, groupW);
  const splitBarW = Math.max(2, (groupW - barGap) / 2);

  const rawMax = Math.max(
    ...data.map((d) => (hasApiData ? Math.max(d.agents, d.api) : d.agents)),
    1,
  );
  const maxVal = niceCeilMax(rawMax);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    pct,
    val: Math.round(maxVal * pct),
    y: PAD.t + innerH * (1 - pct),
  }));

  const barH = (val: number) => (val / maxVal) * innerH;
  const xLabelIndices = pickXLabelIndices(data.length);
  const activeIdx = hoverIdx ?? -1;
  const active = activeIdx >= 0 ? data[activeIdx] : null;
  const activeCenterX = activeIdx >= 0 ? slotCenterX(activeIdx, slotW) : 0;

  const widgetPoints = data.map((d, i) => ({ x: slotCenterX(i, slotW), y: baseline - barH(d.agents) }));
  const apiPoints = hasApiData ? data.map((d, i) => ({ x: slotCenterX(i, slotW), y: baseline - barH(d.api) })) : [];

  return (
    <div className="conv-wave">
      {stats && (
        <div className="conv-wave__stats">
          <div className="conv-wave__stat">
            <span className="conv-wave__stat-label">Total periodo</span>
            <strong className="conv-wave__stat-value">{stats.total.toLocaleString('es')}</strong>
          </div>
          <div className="conv-wave__stat">
            <span className="conv-wave__stat-label">Promedio / día</span>
            <strong className="conv-wave__stat-value">{stats.avg.toLocaleString('es')}</strong>
          </div>
          <div className="conv-wave__stat">
            <span className="conv-wave__stat-label">Días con actividad</span>
            <strong className="conv-wave__stat-value">
              {stats.activeDays} <span className="conv-wave__stat-muted">/ {data.length}</span>
            </strong>
          </div>
          {stats.peakVal > 0 && (
            <div className="conv-wave__stat">
              <span className="conv-wave__stat-label">Día pico</span>
              <strong className="conv-wave__stat-value">
                {formatDay(stats.peakDate)} <span className="conv-wave__stat-muted">({stats.peakVal})</span>
              </strong>
            </div>
          )}
        </div>
      )}

      <div className="conv-wave__mode-toggle-row">
        <div className="conv-wave__mode-toggle" role="group" aria-label="Tipo de gráfico">
          <button
            type="button"
            className={`conv-wave__mode-btn${mode === 'bars' ? ' is-active' : ''}`}
            aria-pressed={mode === 'bars'}
            onClick={() => setMode('bars')}
          >
            <BarChart3 size={12} /> Barras
          </button>
          <button
            type="button"
            className={`conv-wave__mode-btn${mode === 'wave' ? ' is-active' : ''}`}
            aria-pressed={mode === 'wave'}
            onClick={() => setMode('wave')}
          >
            <Activity size={12} /> Onda
          </button>
        </div>
      </div>

      <div className="conv-wave__chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="conv-wave__svg"
          preserveAspectRatio="none"
          role="img"
          aria-label={mode === 'bars' ? 'Gráfico de barras de conversaciones por día' : 'Gráfico de onda de conversaciones por día'}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <rect x={PAD.l} y={PAD.t} width={innerW} height={innerH} className="conv-wave__plane" rx={8} />

          {yTicks.map(({ pct, val, y }) => (
            <g key={`y-${pct}`}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y}
                y2={y}
                className={pct === 0 ? 'conv-wave__baseline' : 'conv-wave__grid'}
              />
              <text x={PAD.l - 6} y={y + 3} className="conv-wave__y-label" textAnchor="end">
                {formatAxisY(val)}
              </text>
            </g>
          ))}

          {xLabelIndices.map((i) => (
            <line
              key={`vx-${i}`}
              x1={slotCenterX(i, slotW)}
              x2={slotCenterX(i, slotW)}
              y1={PAD.t}
              y2={baseline}
              className="conv-wave__grid conv-wave__grid--v"
            />
          ))}

          {mode === 'bars' && data.map((d, i) => {
            const cx = slotCenterX(i, slotW);
            const dim = hoverIdx != null && hoverIdx !== i;
            const activeBar = hoverIdx === i;
            const agentsHeight = barH(d.agents);
            const apiHeight = barH(d.api);
            const groupLeft = cx - groupW / 2;

            if (hasApiData) {
              const widgetX = groupLeft;
              const apiX = groupLeft + splitBarW + barGap;
              return (
                <g key={d.date}>
                  {d.agents > 0 && (
                    <rect
                      x={widgetX}
                      y={baseline - agentsHeight}
                      width={splitBarW}
                      height={Math.max(agentsHeight, d.agents > 0 ? 2 : 0)}
                      rx={2}
                      className={`conv-wave__bar conv-wave__bar--widget${dim ? ' conv-wave__bar--dim' : ''}${activeBar ? ' conv-wave__bar--active' : ''}`}
                    />
                  )}
                  {d.api > 0 && (
                    <rect
                      x={apiX}
                      y={baseline - apiHeight}
                      width={splitBarW}
                      height={Math.max(apiHeight, 2)}
                      rx={2}
                      className={`conv-wave__bar conv-wave__bar--api${dim ? ' conv-wave__bar--dim' : ''}${activeBar ? ' conv-wave__bar--active' : ''}`}
                    />
                  )}
                </g>
              );
            }

            const barX = cx - singleBarW / 2;
            return (
              <g key={d.date}>
                {d.agents > 0 && (
                  <rect
                    x={barX}
                    y={baseline - agentsHeight}
                    width={singleBarW}
                    height={Math.max(agentsHeight, 2)}
                    rx={2}
                    className={`conv-wave__bar conv-wave__bar--widget${dim ? ' conv-wave__bar--dim' : ''}${activeBar ? ' conv-wave__bar--active' : ''}`}
                  />
                )}
              </g>
            );
          })}

          {mode === 'wave' && (
            <g>
              <path d={buildAreaPath(widgetPoints, baseline)} className="conv-wave__area conv-wave__area--widget" />
              {hasApiData && (
                <path d={buildAreaPath(apiPoints, baseline)} className="conv-wave__area conv-wave__area--api" />
              )}
              <path d={buildLinePath(widgetPoints)} fill="none" className="conv-wave__line conv-wave__line--widget" />
              {hasApiData && (
                <path d={buildLinePath(apiPoints)} fill="none" className="conv-wave__line conv-wave__line--api" />
              )}
              {widgetPoints.map((p, i) => (
                <circle
                  key={`pw-${data[i]!.date}`}
                  cx={p.x}
                  cy={p.y}
                  r={hoverIdx === i ? 4.5 : 3}
                  className={`conv-wave__point conv-wave__point--widget${hoverIdx === i ? ' conv-wave__point--active' : ''}`}
                />
              ))}
              {hasApiData && apiPoints.map((p, i) => (
                <circle
                  key={`pa-${data[i]!.date}`}
                  cx={p.x}
                  cy={p.y}
                  r={hoverIdx === i ? 4.5 : 3}
                  className={`conv-wave__point conv-wave__point--api${hoverIdx === i ? ' conv-wave__point--active' : ''}`}
                />
              ))}
            </g>
          )}

          {data.map((d, i) => (
            <rect
              key={`hit-${d.date}`}
              x={PAD.l + i * slotW}
              y={PAD.t}
              width={slotW}
              height={innerH}
              fill="transparent"
              className="conv-wave__hit"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}

          {hoverIdx != null && (
            <line
              x1={activeCenterX}
              x2={activeCenterX}
              y1={PAD.t}
              y2={baseline}
              className="conv-wave__cursor-line"
            />
          )}

          {xLabelIndices.map((i) => (
            <text
              key={`xl-${data[i].date}`}
              x={slotCenterX(i, slotW)}
              y={H - 6}
              className="conv-wave__axis-label"
              textAnchor="middle"
            >
              {formatDay(data[i].date)}
            </text>
          ))}
        </svg>

        {active && hoverIdx != null && (
          <div
            className="conv-wave__tooltip"
            style={{ left: `${(activeCenterX / W) * 100}%` }}
          >
            <p className="conv-wave__tooltip-date">{formatDayLong(active.date)}</p>
            <p className="conv-wave__tooltip-row">
              <i className="conv-wave__dot conv-wave__dot--widget" />
              Widget <strong>{active.agents.toLocaleString('es')}</strong>
            </p>
            {hasApiData && (
              <p className="conv-wave__tooltip-row">
                <i className="conv-wave__dot conv-wave__dot--api" />
                API <strong>{active.api.toLocaleString('es')}</strong>
              </p>
            )}
            {typeof active.sessions === 'number' && active.sessions > 0 && (
              <p className="conv-wave__tooltip-row conv-wave__tooltip-row--muted">
                Chats nuevos <strong>{active.sessions.toLocaleString('es')}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="conv-wave__legend">
        <span className="conv-wave__legend-item">
          <i className="conv-wave__dot conv-wave__dot--widget" />
          Widget / agentes
        </span>
        {hasApiData && (
          <span className="conv-wave__legend-item">
            <i className="conv-wave__dot conv-wave__dot--api" />
            API REST
          </span>
        )}
        <span className="conv-wave__legend-hint">Pasa el cursor sobre las barras para ver el detalle diario</span>
      </div>
    </div>
  );
}
