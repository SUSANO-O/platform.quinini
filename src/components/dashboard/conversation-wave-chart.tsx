'use client';

export type WavePoint = { date: string; agents: number; api: number };

const W = 800;
const H = 150;
const PAD = { t: 12, r: 8, b: 22, l: 8 };

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Curva suave (Catmull-Rom → Bezier) para efecto onda. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPath(linePath: string, points: { x: number; y: number }[], baseline: number): string {
  if (!points.length) return '';
  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
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

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const baseline = PAD.t + innerH;

  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.agents, showApi ? d.api : 0)),
    1,
  );

  const toXY = (idx: number, val: number) => ({
    x: PAD.l + (data.length <= 1 ? innerW / 2 : (idx / (data.length - 1)) * innerW),
    y: PAD.t + innerH - (val / maxVal) * innerH,
  });

  const agentsPts = data.map((d, i) => toXY(i, d.agents));
  const apiPts = data.map((d, i) => toXY(i, d.api));

  const agentsLine = smoothPath(agentsPts);
  const apiLine = showApi ? smoothPath(apiPts) : '';

  const labelStep = data.length <= 8 ? 1 : Math.ceil(data.length / 6);

  return (
    <div className="conv-wave">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="conv-wave__svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de conversaciones por día"
      >
        <rect
          x={PAD.l}
          y={PAD.t}
          width={innerW}
          height={innerH}
          className="conv-wave__plane"
          rx={6}
        />

        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <line
            key={pct}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={PAD.t + innerH * (1 - pct)}
            y2={PAD.t + innerH * (1 - pct)}
            className={pct === 0 ? 'conv-wave__baseline' : 'conv-wave__grid'}
          />
        ))}

        {showApi && apiLine && (
          <>
            <path d={areaPath(apiLine, apiPts, baseline)} className="conv-wave__area conv-wave__area--api" />
            <path d={apiLine} className="conv-wave__line conv-wave__line--api" fill="none" />
          </>
        )}

        <path d={areaPath(agentsLine, agentsPts, baseline)} className="conv-wave__area conv-wave__area--widget" />
        <path d={agentsLine} className="conv-wave__line conv-wave__line--widget" fill="none" />

        {data.map((d, i) =>
          i % labelStep === 0 || i === data.length - 1 ? (
            <text
              key={d.date}
              x={agentsPts[i].x}
              y={H - 4}
              className="conv-wave__axis-label"
              textAnchor="middle"
            >
              {formatDay(d.date)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="conv-wave__legend">
        <span className="conv-wave__legend-item">
          <i className="conv-wave__dot conv-wave__dot--widget" />
          Widget / agentes
        </span>
        {showApi && (
          <span className="conv-wave__legend-item">
            <i className="conv-wave__dot conv-wave__dot--api" />
            API REST
          </span>
        )}
      </div>
    </div>
  );
}
