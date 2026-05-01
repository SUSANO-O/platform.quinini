'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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

function ScatterPoints({ points }: { points: VizPoint[] }) {
  const obj = useMemo(() => {
    const n = points.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const palette: Record<string, [number, number, number]> = {
      document: [0.35, 0.9, 0.45],
      chunk: [0.35, 0.55, 1],
      conversation: [1, 0.52, 0.28],
      knowledge: [0.88, 0.38, 1],
      preference: [0.72, 0.78, 0.95],
    };

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
      const c = palette[p.type] ?? [0.55, 0.58, 0.62];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    return new THREE.Points(geom, mat);
  }, [points]);

  useEffect(() => {
    return () => {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    };
  }, [obj]);

  return <primitive object={obj} />;
}

const TYPE_OPTIONS = ['', 'document', 'chunk', 'conversation', 'knowledge', 'preference'] as const;

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

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    setMessage(null);
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
          {count} vectores · dimensión original {dim} · proyección PCA 3D (AIBackHub)
        </p>
      )}

      <div
        style={{
          height: 'min(560px, 70vh)',
          width: '100%',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: '#07070c',
        }}
      >
        {points.length > 0 ? (
          <Canvas gl={{ antialias: true, alpha: false }} camera={{ position: [2.2, 1.8, 2.4], fov: 50 }}>
            <color attach="background" args={['#07070c']} />
            <ambientLight intensity={0.4} />
            <ScatterPoints points={points} />
            <OrbitControls enableDamping dampingFactor={0.08} />
          </Canvas>
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
