'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Wifi } from 'lucide-react';

type ServiceStatus = 'operational' | 'degraded' | 'down';

interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

interface StatusData {
  status: ServiceStatus;
  timestamp: string;
  services: ServiceCheck[];
}

const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string; Icon: typeof CheckCircle }> = {
  operational: { label: 'Operacional', color: '#22c55e', bg: '#f0fdf4', Icon: CheckCircle },
  degraded:    { label: 'Degradado',  color: '#f59e0b', bg: '#fffbeb', Icon: AlertTriangle },
  down:        { label: 'Caído',      color: '#ef4444', bg: '#fef2f2', Icon: XCircle },
};

const OVERALL_MESSAGES: Record<ServiceStatus, string> = {
  operational: 'Todos los sistemas están operativos.',
  degraded:    'Algunos servicios presentan problemas menores.',
  down:        'Hay servicios críticos caídos. El equipo está trabajando en ello.',
};

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        setData(await res.json() as StatusData);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(interval);
  }, []);

  const cfg = data ? STATUS_CONFIG[data.status] : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '20px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wifi size={22} color="#0d9488" />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Estado del Sistema</span>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151',
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Overall status banner */}
        {cfg && data && (
          <div style={{
            background: cfg.bg,
            border: `1px solid ${cfg.color}40`,
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <cfg.Icon size={36} color={cfg.color} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 20, color: cfg.color }}>{cfg.label}</div>
              <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{OVERALL_MESSAGES[data.status]}</div>
            </div>
          </div>
        )}

        {/* Services table */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 14 }}>
            Servicios
          </div>
          {loading && !data && (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Verificando servicios...</div>
          )}
          {data?.services.map((svc, i) => {
            const scfg = STATUS_CONFIG[svc.status];
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < data.services.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <scfg.Icon size={16} color={scfg.color} />
                  <span style={{ fontSize: 14, color: '#111827' }}>{svc.name}</span>
                  {svc.message && (
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4 }}>— {svc.message}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {svc.latencyMs != null && (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>{svc.latencyMs}ms</span>
                  )}
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: scfg.color,
                    background: scfg.bg,
                    padding: '3px 10px',
                    borderRadius: 99,
                  }}>
                    {scfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Last updated */}
        {lastUpdated && (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 20 }}>
            Última verificación: {lastUpdated.toLocaleTimeString()} · Se actualiza cada 60s
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
