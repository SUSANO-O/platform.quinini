'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  defaultHueFromHex,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
  iridescentOrbBlendModes,
} from '@/lib/widget-iridescent';
import Link from 'next/link';
import { Trash2, Plus, Code2, Boxes, Pencil, Play, Sparkles, Copy, Check } from 'lucide-react';

const BRAND_R = '#e41414';
const BRAND_O = '#f87600';
const BRAND_B = '#00acf8';

interface Widget {
  _id: string;
  name: string;
  agentId: string;
  agentName?: string | null;
  color: string;
  position: string;
  theme: string;
  createdAt: string;
  afhubToken?: string | null;
  humanSupportPhone?: string;
  avatar?: string | null;
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

function buildMinimalSnippet(w: Widget, origin: string) {
  return [
    `<script src="${origin}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${w.afhubToken || 'wt_…'}',`,
    `    host:  '${origin}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}

function buildFullSnippet(w: Widget, origin: string) {
  return [
    `<script src="${origin}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    // — Identificación (requerido) —`,
    `    token: '${w.afhubToken || 'wt_…'}',`,
    `    host:  '${origin}',`,
    ``,
    `    // — Posición —`,
    `    // position:     'bottom-right', // bottom-right | bottom-left | bottom`,
    `    //                               // top | left | right | center | custom`,
    `    // edgeInset:    20,             // distancia al borde (px)`,
    `    // offsetBottom: 20,             // distancia al borde inferior (px)`,
    `    // autoOpen:     false,          // abrir chat automáticamente`,
    `    // fabDraggable: true,           // usuario puede reubicar el botón`,
    ``,
    `    // — Visual (si usas token, el servidor lo gestiona) —`,
    `    // color:        '#6366f1',      // color principal HEX`,
    `    // title:        'Asistente',    // nombre en la cabecera`,
    `    // subtitle:     'En línea',`,
    `    // welcome:      '¡Hola! ¿En qué puedo ayudarte?',`,
    `    // fabHint:      '¿Necesitas ayuda?', // texto flotante`,
    `    // avatar:       '',             // URL de imagen de avatar`,
    `    // theme:        'light',        // 'light' | 'dark'`,
    `    // borderRadius: 16,             // radio borde chat (0-32 px)`,
    ``,
    `    // — Voz —`,
    `    // voiceEnabled: true,           // micrófono + lectura en voz alta`,
    `    // voiceLang:    'es-MX',        // idioma BCP-47 (ej: 'en-US')`,
    `    // voiceName:    '',             // nombre exacto de voz SpeechSynthesis`,
    ``,
    `    // — Soporte humano —`,
    `    // humanSupportPhone: '521234567890', // WhatsApp con código de país`,
    ``,
    `    // — Callbacks —`,
    `    // onOpen:            () => {},`,
    `    // onClose:           () => {},`,
    `    // onMessageSent:     (msg) => console.log('enviado', msg),`,
    `    // onMessageReceived: (msg) => console.log('recibido', msg),`,
    `    // onError:           (err) => console.error(err),`,
    `  });`,
    `</script>`,
  ].join('\n');
}

export default function WidgetsPage() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [snippetTab, setSnippetTab] = useState<'minimal' | 'full'>('minimal');
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');

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

  function copySnippet(w: Widget) {
    const code = snippetTab === 'full' ? buildFullSnippet(w, origin) : buildMinimalSnippet(w, origin);
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Reset tab when expanding a different widget
  function toggleExpanded(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      setSnippetTab('minimal');
      setCopied(false);
    }
  }

  useEffect(() => {
    loadWidgets();
  }, []);

  return (
    <div className="relative overflow-hidden min-h-full">
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_B, top: '100px', left: '-100px' }} />

      <div className="relative px-4 py-4 max-w-4xl mx-auto">
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
            style={{
              background: `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
              color: '#fff',
              boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo widget
          </Link>
        </div>

        {/* Info: widgets ilimitados */}
        <div
          className="card-texture rounded-2xl border p-4 mb-8 flex items-center gap-3"
          style={{ borderColor: `${BRAND_B}30`, background: `${BRAND_B}07` }}
        >
          <span className="text-xs font-semibold" style={{ color: BRAND_B }}>
            Puedes crear tantos widgets como necesites — cada widget debe tener un nombre único.
          </span>
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
                    {w.avatar ? (
                      <img
                        src={w.avatar}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm m-0 mb-0.5">{w.name}</p>
                    <p className="text-xs m-0 mb-0.5 truncate font-semibold" style={{ color: 'var(--foreground)' }}>
                      Agente: {w.agentName?.trim() || '—'}
                    </p>
                    <p className="text-xs m-0 truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {w._id} · {w.position} · {w.theme} · {new Date(w.createdAt).toLocaleDateString('es')}
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
                      Probar
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
                      onClick={() => toggleExpanded(w._id)}
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
                  <div className="border-t overflow-hidden" style={{ borderColor: 'var(--border)', background: '#0d1117' }}>
                    {/* Header bar */}
                    <div
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#161b22' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
                        </div>
                        {/* Tab switcher */}
                        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {(['minimal', 'full'] as const).map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setSnippetTab(tab)}
                              className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all border-0 cursor-pointer"
                              style={{
                                background: snippetTab === tab ? 'rgba(255,255,255,0.12)' : 'transparent',
                                color: snippetTab === tab ? '#e2e8f0' : '#6b7280',
                              }}
                            >
                              {tab === 'minimal' ? 'Mínimo' : 'SDK Completo'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copySnippet(w)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border-0 cursor-pointer transition-all shrink-0"
                        style={{
                          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                          color: copied ? '#4ade80' : '#94a3b8',
                        }}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>

                    {/* Token badge */}
                    {w.afhubToken && w.afhubToken.startsWith('wt_') && (
                      <div
                        className="flex items-center gap-2 px-4 py-2.5 border-b"
                        style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(99,102,241,0.07)' }}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: '#818cf8' }}>Token</span>
                        <code className="text-[11px] font-mono flex-1 truncate" style={{ color: '#c7d2fe' }}>{w.afhubToken}</code>
                        <button
                          type="button"
                          onClick={() => { void navigator.clipboard.writeText(w.afhubToken!); }}
                          className="shrink-0 border-0 cursor-pointer rounded px-2 py-0.5 text-[10px] font-semibold transition-all"
                          style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8' }}
                        >
                          Copiar
                        </button>
                      </div>
                    )}

                    {/* Code block */}
                    <pre
                      className="p-4 text-[11px] overflow-x-auto m-0"
                      style={{
                        color: '#e2e8f0',
                        lineHeight: 1.7,
                        fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                        tabSize: 2,
                      }}
                    >
                      {snippetTab === 'full'
                        ? buildFullSnippet(w, origin)
                        : buildMinimalSnippet(w, origin)}
                    </pre>

                    {/* Footer */}
                    <div
                      className="px-4 py-2.5 border-t flex items-center gap-2"
                      style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#161b22' }}
                    >
                      <span style={{ fontSize: 10, color: '#4b5563' }}>
                        {snippetTab === 'minimal'
                          ? '✓ Pega esto antes de </body>. Los cambios del builder se propagan automáticamente.'
                          : '✓ Descomenta solo las opciones que quieras sobreescribir. Con token, el servidor gestiona el resto.'}
                      </span>
                    </div>
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
