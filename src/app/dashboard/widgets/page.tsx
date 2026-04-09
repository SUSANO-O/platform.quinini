'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, Plus, Code2, Boxes, Pencil, Play } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { getWidgetLimit } from '@/lib/agent-plans';

interface Widget {
  _id: string;
  name: string;
  agentId: string;
  color: string;
  position: string;
  theme: string;
  createdAt: string;
  afhubToken?: string | null;
}

export default function WidgetsPage() {
  const { subscription } = useSubscription();
  const hasActivePlan = subscription?.status === 'active' || subscription?.status === 'trialing';
  const plan = hasActivePlan ? (subscription?.plan ?? 'free') : 'free';
  const widgetLimit = getWidgetLimit(plan);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  const usedWidgets = widgets.length;
  const atLimit = usedWidgets >= widgetLimit;

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  async function loadWidgets() {
    try {
      const res = await fetch('/api/widgets');
      const data = await res.json();
      setWidgets(data.widgets || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }

  async function deleteWidget(id: string) {
    if (!confirm('¿Eliminar este widget?')) return;
    await fetch(`/api/widgets?id=${id}`, { method: 'DELETE' });
    setWidgets((prev) => prev.filter((w) => w._id !== id));
  }

  useEffect(() => { loadWidgets(); }, []);

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Boxes size={22} style={{ color: '#0d9488' }} />
            Mis Widgets
          </h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>Gestiona todos tus chat widgets</p>
        </div>
        <Link
          href="/dashboard/widget-builder"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 18px', borderRadius: '10px', fontWeight: 700,
            fontSize: '13px',
            background: atLimit ? 'var(--muted)' : 'linear-gradient(135deg, #0d9488, #6366f1)',
            color: atLimit ? 'var(--muted-foreground)' : '#fff',
            textDecoration: 'none',
            pointerEvents: atLimit ? 'none' : 'auto',
            opacity: atLimit ? 0.6 : 1,
          }}
        >
          <Plus size={14} />
          Nuevo widget
        </Link>
      </div>

      {/* Plan usage bar (misma idea que /dashboard/agents) */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
            <span style={{ fontWeight: 600 }}>Widgets usados</span>
            <span style={{ color: atLimit ? '#ef4444' : 'var(--muted-foreground)' }}>
              {usedWidgets} / {widgetLimit}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, widgetLimit > 0 ? (usedWidgets / widgetLimit) * 100 : 0)}%`,
              background: atLimit ? '#ef4444' : 'linear-gradient(90deg, #0d9488, #6366f1)',
              borderRadius: 3,
              transition: 'width 0.4s',
            }} />
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          Plan: <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--foreground)' }}>{plan}</span>
        </div>
        {atLimit && (
          <Link href="/dashboard" style={{
            fontSize: '12px', fontWeight: 700, color: '#0d9488', textDecoration: 'none',
            background: 'rgba(13,148,136,0.1)', padding: '4px 12px', borderRadius: '20px',
          }}>
            Actualizar plan →
          </Link>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted-foreground)', padding: '40px 0' }}>
          <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: '#0d9488', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          Cargando widgets...
        </div>
      ) : widgets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Aún no tienes widgets</p>
          <p style={{ fontSize: '13px', marginBottom: 20 }}>Crea tu primer chat widget con el Widget Builder</p>
          <Link href="/dashboard/widget-builder" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            borderRadius: '10px', background: '#0d9488', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '13px',
          }}>
            <Plus size={16} />
            Crear widget
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {widgets.map((w) => (
            <div key={w._id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
                {/* Color dot */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: w.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>{w.name}</p>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>
                    {w.agentId} · {w.position} · {w.theme} theme · {new Date(w.createdAt).toLocaleDateString('es')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Link
                    href={`/dashboard/widget-preview?id=${w._id}`}
                    title="Probar el chat con este widget"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.4)',
                      color: '#6366f1',
                      textDecoration: 'none',
                    }}
                  >
                    <Play size={12} />
                    Preview
                  </Link>
                  <Link
                    href={`/dashboard/widget-builder?edit=${w._id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'rgba(13,148,136,0.12)',
                      border: '1px solid rgba(13,148,136,0.35)',
                      color: '#0d9488',
                      textDecoration: 'none',
                    }}
                  >
                    <Pencil size={12} />
                    Editar
                  </Link>
                  <button
                    onClick={() => setExpanded(expanded === w._id ? null : w._id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <Code2 size={12} />
                    Código
                  </button>
                  <button
                    onClick={() => deleteWidget(w._id)}
                    style={{ display: 'flex', alignItems: 'center', padding: '6px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer', color: '#ef4444' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded snippet */}
              {expanded === w._id && (
                <div style={{ borderTop: '1px solid var(--border)', background: '#0f1729' }}>
                  <pre style={{ padding: '14px 18px', margin: 0, fontSize: '11px', color: '#e2e8f0', overflowX: 'auto', lineHeight: '1.6' }}>
{`<script src="${origin || 'https://TU-DOMINIO'}/widget.js"></script>
<script>
  window.AgentFlowhub.init({
    agentId: '${w.agentId}',
    token: '${w.afhubToken || 'wt_…'}',
    host: '${origin || 'https://TU-DOMINIO'}',
    color: '${w.color}',
    position: '${w.position}',
    theme: '${w.theme}',
  });
</script>`}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
