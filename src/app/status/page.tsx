'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Activity, Clock } from 'lucide-react';
import type { ServiceCheck } from '@/app/api/status/route';

type ServiceStatus = 'operational' | 'degraded' | 'down';

interface StatusData {
  status: ServiceStatus;
  timestamp: string;
  services: ServiceCheck[];
}

// ── Config visual por estado ─────────────────────────────────────────────────

const S = {
  operational: {
    label: 'Operacional',
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.07)',
    border: 'rgba(22,163,74,0.2)',
    dot: '#22c55e',
    Icon: CheckCircle,
  },
  degraded: {
    label: 'Degradado',
    color: '#d97706',
    bg: 'rgba(217,119,6,0.07)',
    border: 'rgba(217,119,6,0.2)',
    dot: '#f59e0b',
    Icon: AlertTriangle,
  },
  down: {
    label: 'Caído',
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.07)',
    border: 'rgba(220,38,38,0.2)',
    dot: '#ef4444',
    Icon: XCircle,
  },
} as const satisfies Record<ServiceStatus, {
  label: string; color: string; bg: string; border: string; dot: string;
  Icon: typeof CheckCircle;
}>;

const OVERALL_MESSAGES: Record<ServiceStatus, string> = {
  operational: 'Todos los sistemas están operativos.',
  degraded: 'Algunos servicios presentan problemas. El equipo está al tanto.',
  down: 'Hay servicios críticos fuera de línea. El equipo está trabajando en ello.',
};

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms === null) return <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>;
  const color = ms < 200 ? '#16a34a' : ms < 800 ? '#d97706' : '#dc2626';
  return (
    <span style={{ fontSize: 11, color, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
      {ms}ms
    </span>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const cfg = S[status];
  const isDown = status === 'down';
  return (
    <span
      aria-label={cfg.label}
      style={{
        display: 'inline-block',
        width: 9, height: 9,
        borderRadius: '50%',
        background: cfg.dot,
        flexShrink: 0,
        boxShadow: isDown ? `0 0 0 3px ${cfg.dot}30` : undefined,
      }}
    />
  );
}

function StatusPill({ status }: { status: ServiceStatus }) {
  const cfg = S[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
      color: cfg.color,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      padding: '3px 10px',
      borderRadius: 99,
    }}>
      <StatusDot status={status} />
      {cfg.label}
    </span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const diff = Math.round((Date.now() - date.getTime()) / 1000);
  const label =
    diff < 5  ? 'ahora mismo' :
    diff < 60 ? `hace ${diff}s` :
    date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return <>{label}</>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [data, setData]       = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0); // force re-render for relative time

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as StatusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con el servidor.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll  = setInterval(() => void refresh(true), 60_000);
    const clock = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [refresh]);

  // suppress unused tick warning
  void tick;

  const overall = data ? S[data.status] : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#0f172a',
    }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} color="#6366f1" />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>Estado del sistema</span>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Actualizar estado"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600,
            color: loading ? '#94a3b8' : '#374151',
            transition: 'background 0.15s',
          }}
        >
          <RefreshCw
            size={13}
            style={{ transition: 'transform 0.3s', animation: loading ? 'spin 0.8s linear infinite' : 'none' }}
          />
          Actualizar
        </button>
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        {/* Overall banner */}
        {overall && data && !error && (
          <div style={{
            background: overall.bg,
            border: `1px solid ${overall.border}`,
            borderRadius: 16,
            padding: '22px 24px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <overall.Icon size={32} color={overall.color} strokeWidth={2} aria-hidden />
            <div>
              <p style={{ fontWeight: 800, fontSize: 18, color: overall.color, margin: 0, lineHeight: 1.2 }}>
                {overall.label}
              </p>
              <p style={{ color: '#475569', fontSize: 13, margin: '4px 0 0', lineHeight: 1.5 }}>
                {OVERALL_MESSAGES[data.status]}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <XCircle size={18} color="#dc2626" />
            <div>
              <p style={{ fontWeight: 600, fontSize: 13, color: '#dc2626', margin: 0 }}>
                No se pudo obtener el estado
              </p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0' }}>{error}</p>
            </div>
          </div>
        )}

        {/* Services table */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>Servicios</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {data ? <><Clock size={11} style={{ display: 'inline', marginRight: 4 }} /><RelativeTime iso={data.timestamp} /></> : '—'}
            </span>
          </div>

          {/* Loading skeleton */}
          {loading && !data && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              <RefreshCw size={18} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              Verificando servicios...
            </div>
          )}

          {/* Services list */}
          {data?.services.map((svc, i) => (
            <div
              key={`${svc.name}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < data.services.length - 1 ? '1px solid #f8fafc' : 'none',
                transition: 'background 0.1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <StatusDot status={svc.status} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap' }}>
                  {svc.name}
                </span>
                {svc.message && (
                  <span style={{
                    fontSize: 11, color: '#94a3b8',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }}>
                    — {svc.message}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <LatencyBadge ms={svc.latencyMs} />
                <StatusPill status={svc.status} />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: 11,
          marginTop: 20,
          lineHeight: 1.6,
        }}>
          Se actualiza automáticamente cada 60 segundos.{' '}
          {data && (
            <>Última verificación: <RelativeTime iso={data.timestamp} />.</>
          )}
        </p>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
