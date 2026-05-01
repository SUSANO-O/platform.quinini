'use client';

import { Canvas, type ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  Stars,
  GizmoHelper,
  GizmoViewport,
  PointMaterial,
} from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

export type VizPoint = {
  x: number;
  y: number;
  z: number;
  entryId: string;
  agentId: string;
  type: string;
  label: string;
  sourceFile?: string;
};

type VizPayload = {
  ok?: boolean;
  dim?: number;
  count?: number;
  points?: VizPoint[];
  message?: string;
  error?: string;
};

const TYPE_PALETTE: Record<string, [number, number, number]> = {
  document: [0.32, 0.92, 0.48],
  chunk: [0.38, 0.62, 1],
  conversation: [1, 0.5, 0.32],
  knowledge: [0.9, 0.42, 1],
  preference: [0.78, 0.82, 0.98],
};

const TYPE_LABELS: Record<string, string> = {
  document: 'documento',
  chunk: 'chunk',
  conversation: 'conversación',
  knowledge: 'conocimiento',
  preference: 'preferencia',
};

function buildPointCloudGeometry(points: VizPoint[]): THREE.BufferGeometry {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);

  let minx = Infinity,
    miny = Infinity,
    minz = Infinity,
    maxx = -Infinity,
    maxy = -Infinity,
    maxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
    miny = Math.min(miny, p.y);
    maxy = Math.max(maxy, p.y);
    minz = Math.min(minz, p.z);
    maxz = Math.max(maxz, p.z);
  }
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  const cz = (minz + maxz) / 2;
  const span = Math.max(maxx - minx, maxy - miny, maxz - minz, 1e-9);
  const s = 2 / span;

  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    pos[i * 3] = (p.x - cx) * s;
    pos[i * 3 + 1] = (p.y - cy) * s;
    pos[i * 3 + 2] = (p.z - cz) * s;
    const c = TYPE_PALETTE[p.type] ?? [0.58, 0.6, 0.66];
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geom;
}

function PointCloud({
  points,
  pointSize,
  onHover,
}: {
  points: VizPoint[];
  pointSize: number;
  onHover: (p: VizPoint | null) => void;
}) {
  const geometry = useMemo(() => buildPointCloudGeometry(points), [points]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const baseSize = useMemo(() => {
    const n = Math.max(points.length, 1);
    return (0.032 + 22 / Math.sqrt(n)) * pointSize;
  }, [points.length, pointSize]);

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    const idx = e.index;
    if (typeof idx === 'number' && idx >= 0 && idx < points.length) onHover(points[idx]!);
    else onHover(null);
  };

  return (
    <points geometry={geometry} onPointerMove={handleMove} onPointerOut={() => onHover(null)}>
      <PointMaterial
        vertexColors
        size={baseSize}
        sizeAttenuation
        transparent
        opacity={0.94}
        depthWrite={false}
        toneMapped
      />
    </points>
  );
}

function EmbeddingScene({
  points,
  pointSize,
  onHover,
}: {
  points: VizPoint[];
  pointSize: number;
  onHover: (p: VizPoint | null) => void;
}) {
  const axes = useMemo(() => new THREE.AxesHelper(1.12), []);
  useEffect(() => {
    return () => {
      axes.dispose();
    };
  }, [axes]);

  return (
    <>
      <color attach="background" args={['#06060d']} />
      <fog attach="fog" args={['#06060d', 2.4, 11.5]} />

      <ambientLight intensity={0.18} />
      <directionalLight position={[5.5, 7, 4.2]} intensity={0.55} color="#d4d8ff" />
      <directionalLight position={[-5, -3, -5]} intensity={0.2} color="#312e81" />
      <pointLight position={[0, 2.5, 0]} intensity={0.15} color="#6366f1" distance={8} decay={2} />

      <Stars radius={70} depth={32} count={2800} factor={2.4} saturation={0} fade speed={0.35} />

      <Grid
        position={[0, -1.14, 0]}
        args={[28, 28]}
        cellSize={0.14}
        sectionSize={1.4}
        fadeDistance={18}
        fadeStrength={1}
        infiniteGrid
        cellColor="#1a1535"
        sectionColor="#4338ca"
        cellThickness={0.85}
        sectionThickness={1.15}
      />

      <PointCloud points={points} pointSize={pointSize} onHover={onHover} />

      <primitive object={axes} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={0.65}
        maxDistance={14}
        maxPolarAngle={Math.PI * 0.92}
        minPolarAngle={0.08}
      />

      <GizmoHelper alignment="bottom-right" margin={[76, 76]}>
        <GizmoViewport
          axisColors={['#f87171', '#4ade80', '#60a5fa']}
          labelColor="#e2e8f0"
          hideNegativeAxes
        />
      </GizmoHelper>
    </>
  );
}

const TYPE_OPTIONS = ['', 'document', 'chunk', 'conversation', 'knowledge', 'preference'] as const;

function typeCounts(points: VizPoint[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of points) {
    const t = p.type || 'otro';
    m[t] = (m[t] ?? 0) + 1;
  }
  return m;
}

export default function AdminEmbeddingViz3D() {
  const [points, setPoints] = useState<VizPoint[]>([]);
  const [dim, setDim] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(500);
  const [agentId, setAgentId] = useState('');
  const [type, setType] = useState<string>('');
  const [pointSize, setPointSize] = useState(1);
  const [hover, setHover] = useState<VizPoint | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setMessage(null);
    setHover(null);
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    if (agentId.trim()) q.set('agentId', agentId.trim());
    if (type) q.set('type', type);
    fetch(`/api/admin/embedding-viz?${q.toString()}`)
      .then(async (r) => {
        const j = (await r.json()) as VizPayload;
        if (!r.ok) {
          setErr(typeof j.error === 'string' ? j.error : `HTTP ${r.status}`);
          setPoints([]);
          setDim(null);
          setCount(0);
          return;
        }
        setPoints(Array.isArray(j.points) ? j.points : []);
        setDim(typeof j.dim === 'number' ? j.dim : null);
        setCount(typeof j.count === 'number' ? j.count : (j.points?.length ?? 0));
        setMessage(typeof j.message === 'string' ? j.message : null);
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : 'Error de red');
        setPoints([]);
      })
      .finally(() => setLoading(false));
  }, [limit, agentId, type]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => typeCounts(points), [points]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
          marginBottom: '16px',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Límite de puntos</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              minWidth: '120px',
            }}
          >
            {[200, 400, 600, 800, 1000, 1500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', flex: '1 1 180px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Agent ID (opcional)</span>
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="Todos los agentes"
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Tipo metadata</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              minWidth: '140px',
            }}
          >
            <option value="">Todos</option>
            {TYPE_OPTIONS.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', minWidth: '140px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Tamaño puntos</span>
          <input
            type="range"
            min={0.45}
            max={2.2}
            step={0.05}
            value={pointSize}
            onChange={(e) => setPointSize(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: '13px',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <span className={loading ? 'spin' : ''} style={{ display: 'inline-flex' }}>
            <RefreshCw size={15} />
          </span>
          Actualizar
        </button>
      </div>

      {err && (
        <p style={{ color: '#f87171', fontSize: '14px', marginBottom: '12px' }}>{err}</p>
      )}
      {!err && message && points.length === 0 && (
        <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '12px' }}>{message}</p>
      )}
      {dim != null && count > 0 && (
        <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '10px' }}>
          {count} vectores · dimensión original {dim} · PCA 3D · arrastra para rotar, rueda para zoom · pasa el cursor sobre un punto
        </p>
      )}

      {points.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 16px',
            marginBottom: '10px',
            fontSize: '12px',
            color: 'var(--muted-foreground)',
          }}
        >
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => {
              const rgb = TYPE_PALETTE[t] ?? [0.58, 0.6, 0.66];
              const css = `rgb(${Math.round(rgb[0]! * 255)},${Math.round(rgb[1]! * 255)},${Math.round(rgb[2]! * 255)})`;
              const label = TYPE_LABELS[t] ?? t;
              return (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: css,
                      boxShadow: `0 0 8px ${css}`,
                    }}
                  />
                  {label} ({n})
                </span>
              );
            })}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          height: 'min(580px, 72vh)',
          width: '100%',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: '#06060d',
          boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.06)',
        }}
      >
        {points.length > 0 ? (
          <>
            <Canvas
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
              camera={{ position: [2.45, 1.95, 2.55], fov: 48, near: 0.08, far: 80 }}
              style={{ width: '100%', height: '100%', touchAction: 'none' }}
              onCreated={({ raycaster }) => {
                raycaster.params.Points = { threshold: 0.14 };
              }}
            >
              <EmbeddingScene points={points} pointSize={pointSize} onHover={setHover} />
            </Canvas>
            {hover && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  maxWidth: 'min(340px, 92%)',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(15, 15, 24, 0.92)',
                  border: '1px solid rgba(99,102,241,0.35)',
                  color: '#e2e8f0',
                  fontSize: '12px',
                  lineHeight: 1.45,
                  pointerEvents: 'none',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                }}
              >
                <div style={{ fontWeight: 700, color: '#a5b4fc', marginBottom: '6px' }}>
                  {TYPE_LABELS[hover.type] ?? hover.type}
                </div>
                <div style={{ opacity: 0.9, wordBreak: 'break-word' }}>{hover.label || '(sin texto)'}</div>
                <div style={{ marginTop: '8px', fontSize: '11px', opacity: 0.75 }}>
                  <div>agent: {hover.agentId}</div>
                  {hover.sourceFile ? <div>archivo: {hover.sourceFile}</div> : null}
                  <div style={{ marginTop: '4px', fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>
                    {hover.entryId}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted-foreground)',
              fontSize: '14px',
            }}
          >
            {loading ? 'Cargando…' : 'Sin puntos para mostrar.'}
          </div>
        )}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '14px', lineHeight: 1.5 }}>
        Datos desde Mongo del hub (<code style={{ fontSize: '11px' }}>vector_embeddings</code>) con cabeceras{' '}
        <code style={{ fontSize: '11px' }}>BACKEND_URL</code>, <code style={{ fontSize: '11px' }}>AIBACKHUB_API_KEY</code>{' '}
        y <code style={{ fontSize: '11px' }}>AIBACKHUB_TENANT_ID</code>. Opcional: <code style={{ fontSize: '11px' }}>AIBACKHUB_ADMIN_KEY</code> si el hub exige <code style={{ fontSize: '11px' }}>x-admin-key</code>.
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
