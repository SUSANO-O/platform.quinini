'use client';

import { useEffect, useState } from 'react';
import { Users, Boxes, TrendingUp, Clock, XCircle, CheckCircle } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalWidgets: number;
  trialing: number;
  active: number;
  canceled: number;
  mrr: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats').then((r) => r.json()).then(setStats);
  }, []);

  const cards = stats ? [
    { label: 'Usuarios totales', value: stats.totalUsers, icon: Users, color: '#6366f1' },
    { label: 'Widgets creados', value: stats.totalWidgets, icon: Boxes, color: '#0d9488' },
    { label: 'En trial', value: stats.trialing, icon: Clock, color: '#f59e0b' },
    { label: 'Suscripciones activas', value: stats.active, icon: CheckCircle, color: '#22c55e' },
    { label: 'Canceladas', value: stats.canceled, icon: XCircle, color: '#ef4444' },
    { label: 'MRR estimado', value: `$${stats.mrr}`, icon: TrendingUp, color: '#a855f7' },
  ] : [];

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Panel Admin</h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '32px' }}>
        Resumen general de la plataforma
      </p>

      {!stats ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--muted-foreground)' }}>
          <div style={{ width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Cargando...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {cards.map((c) => (
            <div key={c.label} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>{c.label}</span>
                <c.icon size={16} style={{ color: c.color }} />
              </div>
              <p style={{ fontSize: '28px', fontWeight: 800, color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
