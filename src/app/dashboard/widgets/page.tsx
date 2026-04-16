'use client';

import { useEffect, useState, type CSSProperties } from 'react';
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

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

/** Avatar circular con gradiente tipo “lava” y variación estable por widget. */
function widgetLavaAvatarStyle(baseHex: string, widgetId: string): CSSProperties {
  const rgb = hexToRgb(baseHex) ?? { r: 13, g: 148, b: 136 };
  const n = hashSeed(widgetId);
  const u = (k: number) => ((n >>> k) & 0xffff) / 0xffff;
  const t1 = 0.28 + u(0) * 0.22;
  const t2 = 0.22 + u(8) * 0.2;
  const light = {
    r: mix(rgb.r, 255, t1),
    g: mix(rgb.g, 255, t2),
    b: mix(rgb.b, 255, 0.32 + u(16) * 0.18),
  };
  const deep = {
    r: mix(rgb.r, 0, 0.18 + u(4) * 0.22),
    g: mix(rgb.g, 0, 0.12 + u(12) * 0.15),
    b: mix(rgb.b, 40, 0.1 + u(20) * 0.12),
  };
  const hot = {
    r: mix(rgb.r, 255, 0.45 + u(24) * 0.15),
    g: mix(rgb.g, 120, 0.25),
    b: mix(rgb.b, 255, 0.2),
  };
  const blobX1 = 18 + (n % 35);
  const blobY1 = 22 + ((n >>> 6) % 38);
  const blobX2 = 58 + ((n >>> 12) % 32);
  const blobY2 = 55 + ((n >>> 18) % 30);
  const angle = 118 + (n % 48);
  const grainAngle = 42 + ((n >>> 3) % 36);

  const layers = [
    `radial-gradient(ellipse 95% 85% at ${blobX1}% ${blobY1}%, ${rgba(light.r, light.g, light.b, 0.92)} 0%, transparent 68%)`,
    `radial-gradient(circle at ${blobX2}% ${blobY2}%, ${rgba(hot.r, hot.g, hot.b, 0.55)} 0%, transparent 42%)`,
    `radial-gradient(circle at ${50 + (u(28) - 0.5) * 20}% ${12 + (u(30) - 0.5) * 15}%, ${rgba(255, 255, 255, 0.22)} 0%, transparent 28%)`,
    `linear-gradient(${angle}deg, ${rgba(deep.r, deep.g, deep.b, 1)} 0%, ${rgba(rgb.r, rgb.g, rgb.b, 1)} 38%, ${rgba(light.r, light.g, light.b, 0.95)} 100%)`,
    `repeating-linear-gradient(${grainAngle}deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px)`,
    `repeating-linear-gradient(${grainAngle + 55}deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 5px)`,
  ].join(', ');

  const borderA = 0.38 + u(2) * 0.12;
  return {
    background: layers,
    backgroundBlendMode: 'normal, normal, soft-light, normal, overlay, multiply',
    border: `2px solid ${rgba(mix(rgb.r, 255, 0.25), mix(rgb.g, 255, 0.25), mix(rgb.b, 255, 0.25), borderA)}`,
    boxShadow:
      'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -3px 8px rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.08)',
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
          <div className="flex flex-col gap-4">
            {widgets.map((w) => (
              <div
                key={w._id}
                className="card-hover rounded-2xl overflow-hidden border"
                style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
              >
                <div style={{ height: 3, background: `linear-gradient(90deg, ${w.color}, ${BRAND_B}99)` }} />
                <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
                  <div
                    className="w-10 h-10 rounded-full shrink-0 shadow-sm overflow-hidden"
                    style={widgetLavaAvatarStyle(w.color, w._id)}
                    aria-hidden
                  />
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
