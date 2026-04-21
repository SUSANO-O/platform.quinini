'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  defaultHueFromHex,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
  iridescentOrbBlendModes,
} from '@/lib/widget-iridescent';
import Link from 'next/link';
import { Trash2, Plus, Code2, Boxes, Pencil, Play, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';
import { getWidgetLimit } from '@/lib/agent-plans';

const BRAND_R = '#e41414';
const BRAND_O = '#f87600';
const BRAND_B = '#00acf8';

interface Widget {
  _id: string;
  name: string;
  agentId: string;
  color: string;
  position: string;
  theme: string;
  createdAt: string;
  afhubToken?: string | null;
  humanSupportPhone?: string;
}

function widgetIridescentOrbInnerStyle(baseHex: string, widgetId: string): CSSProperties {
  const h = defaultHueFromHex(baseHex);
  const seed = hashWidgetSeed(`${widgetId}|${baseHex}`);
  return {
    background: iridescentOrbBackgroundCss(h, seed),
    ...( { backgroundBlendMode: iridescentOrbBlendModes() } as Pick<CSSProperties, 'backgroundBlendMode'> ),
    filter: 'saturate(1.28) contrast(1.08) brightness(1.06)',
  };
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
  const pct = widgetLimit > 0 ? Math.min(100, (usedWidgets / widgetLimit) * 100) : 0;

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

  useEffect(() => {
    loadWidgets();
  }, []);

  return (
    <div className="relative overflow-hidden min-h-full">
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_B, top: '100px', left: '-100px' }} />

      <div className="relative px-6 py-10 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <div className="badge-primary mb-3 w-fit">
              <Sparkles size={13} />
              Widgets
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight m-0 flex items-center gap-2 flex-wrap">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${BRAND_B}18`, border: `1px solid ${BRAND_B}35` }}
              >
                <Boxes size={22} style={{ color: BRAND_B }} strokeWidth={1.75} />
              </span>
              <span>
                Mis <span className="gradient-text">widgets</span>
              </span>
            </h1>
            <p className="text-sm mt-2 m-0" style={{ color: 'var(--muted-foreground)' }}>
              Gestiona todos tus chat widgets — misma línea visual que el resto del panel.
            </p>
          </div>
          <Link
            href="/dashboard/widget-builder"
            data-tour="widgets-new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold no-underline shrink-0 transition-all"
            style={
              atLimit
                ? {
                    background: 'var(--muted)',
                    color: 'var(--muted-foreground)',
                    pointerEvents: 'none',
                    opacity: 0.65,
                  }
                : {
                    background: `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
                    color: '#fff',
                    boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
                  }
            }
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo widget
          </Link>
        </div>

        {/* Uso del plan */}
        <div
          className="card-texture rounded-2xl border p-5 mb-8"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex justify-between text-xs font-semibold mb-2">
                <span>Widgets usados</span>
                <span style={{ color: atLimit ? '#ef4444' : 'var(--muted-foreground)' }}>
                  {usedWidgets} / {widgetLimit}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: atLimit ? '#ef4444' : `linear-gradient(90deg, ${BRAND_R}, ${BRAND_B})`,
                  }}
                />
              </div>
            </div>
            <div className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>
              Plan:{' '}
              <span className="font-bold capitalize" style={{ color: 'var(--foreground)' }}>
                {plan}
              </span>
            </div>
            {atLimit && (
              <Link
                href="/dashboard"
                className="text-xs font-bold px-3 py-1.5 rounded-full no-underline transition-opacity hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgba(228,20,20,0.12), rgba(0,172,248,0.1))',
                  color: 'var(--primary)',
                  border: '1px solid rgba(228,20,20,0.22)',
                }}
              >
                Actualizar plan →
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 py-12 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            <div
              className="w-5 h-5 rounded-full animate-spin shrink-0"
              style={{ border: '2px solid var(--border)', borderTopColor: 'var(--primary)' }}
            />
            Cargando widgets...
          </div>
        ) : widgets.length === 0 ? (
          <div
            className="card-texture rounded-2xl border border-dashed text-center py-14 px-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl"
              style={{ background: `${BRAND_R}12`, border: `1px solid ${BRAND_R}28` }}
            >
              🤖
            </div>
            <p className="font-bold text-base mb-1 m-0">Aún no tienes widgets</p>
            <p className="text-sm mb-6 m-0 max-w-sm mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Crea tu primer chat widget con el Widget Builder.
            </p>
            <Link
              href="/dashboard/widget-builder"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white no-underline transition-transform hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
                boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
              }}
            >
              <Plus size={16} />
              Crear widget
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4" data-tour="widgets-list">
            {widgets.map((w) => (
              <div
                key={w._id}
                className="card-hover rounded-2xl overflow-hidden border"
                style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${w.color}, ${BRAND_B}99)` }} />
                <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
                  <div
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full shadow-md ring-1 ring-white/40"
                    aria-hidden
                  >
                    <div
                      className="absolute inset-[-38%] rounded-full"
                      style={widgetIridescentOrbInnerStyle(w.color, w._id)}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{
                        boxShadow:
                          'inset 0 2px 10px rgba(255,255,255,0.55), inset 0 -6px 14px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.25)',
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm m-0 mb-0.5">{w.name}</p>
                    <p className="text-xs m-0 truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {w.agentId} · {w.position} · {w.theme} · {new Date(w.createdAt).toLocaleDateString('es')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
                    <Link
                      href={`/dashboard/widget-preview?id=${w._id}`}
                      title="Probar el chat con este widget"
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold no-underline transition-opacity hover:opacity-90"
                      style={{
                        background: `${BRAND_B}14`,
                        border: `1px solid ${BRAND_B}40`,
                        color: BRAND_B,
                      }}
                    >
                      <Play size={12} />
                      Preview
                    </Link>
                    <Link
                      href={`/dashboard/widget-builder?edit=${w._id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold no-underline transition-opacity hover:opacity-90"
                      style={{
                        background: `${BRAND_R}10`,
                        border: `1px solid ${BRAND_R}30`,
                        color: BRAND_R,
                      }}
                    >
                      <Pencil size={12} />
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === w._id ? null : w._id)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors hover:bg-slate-50"
                      style={{ borderColor: 'var(--border)', background: 'var(--muted)', color: 'var(--foreground)' }}
                    >
                      <Code2 size={12} />
                      Código
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteWidget(w._id)}
                      className="inline-flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-colors hover:bg-red-50"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        borderColor: 'rgba(239,68,68,0.22)',
                        color: '#ef4444',
                      }}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {expanded === w._id && (
                  <div className="border-t overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 border-b"
                      style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                        <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                        <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                      </div>
                      <span className="text-[10px] font-mono font-semibold truncate" style={{ color: 'var(--muted-foreground)' }}>
                        {(w.name?.trim() || 'widget').replace(/\s+/g, '-').toLowerCase()}-embed.html
                      </span>
                    </div>
                    <pre
                      className="p-4 m-0 text-[11px] overflow-x-auto leading-relaxed"
                      style={{ background: '#0f1729', color: '#e2e8f0' }}
                    >
                      {`<script src="${origin || 'https://TU-DOMINIO'}/widget.js"></script>
<script>
  window.AgentFlowhub.init({
    agentId: '${w.agentId}',
    token: '${w.afhubToken || 'wt_…'}',
    host: '${origin || 'https://TU-DOMINIO'}',
    color: '${w.color}',
    position: '${w.position}',
    theme: '${w.theme}',${w.humanSupportPhone?.trim() ? `
    humanSupportPhone: ${JSON.stringify(w.humanSupportPhone.trim())},` : ''}
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
    </div>
  );
}

