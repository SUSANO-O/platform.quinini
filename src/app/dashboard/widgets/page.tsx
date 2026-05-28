'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EncryptedDownloadModal } from '@/components/encrypted-download-modal';
import {
  defaultHueFromHex,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
  iridescentOrbBlendModes,
} from '@/lib/widget-iridescent';
import Link from 'next/link';
import { Trash2, Plus, Code2, Boxes, Pencil, Play, Sparkles, Copy, Check, Download, GitBranch, Power, PowerOff, Share2 } from 'lucide-react';
import { useSubscription } from '@/hooks/use-subscription';

import { BRAND_TEXT_COLOR, UI_SURFACE_SECONDARY } from '@/lib/brand';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';

const BRAND_R = 'var(--primary)';
const BRAND_O = 'var(--brand-warm)';
const BTN_SECONDARY: CSSProperties = { ...UI_SURFACE_SECONDARY };

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
  multiAgentEnabled?: boolean;
  multiAgentMode?: 'triage' | 'parallel' | 'pipeline';
  active?: boolean;
}

interface MultiAgentAnalytics {
  totals?: {
    sessionsWithRouting?: number;
    totalRouted?: number;
    totalHandoffs?: number;
    totalParallel?: number;
  };
  enabledWidgets?: number;
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

export default function WidgetsPage() {
  const { subscription } = useSubscription();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [multiAgentStats, setMultiAgentStats] = useState<MultiAgentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [deleteTarget, setDeleteTarget]         = useState<string | null>(null);
  const [deleting, setDeleting]                 = useState(false);
  const [exportModalWidget, setExportModalWidget] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  async function loadWidgets() {
    try {
      const res = await fetch('/api/widgets');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWidgets(data.widgets || []);
    } catch {
      toast.error('No se pudieron cargar los widgets');
    }
    setLoading(false);
  }

  async function toggleWidgetActive(w: Widget) {
    const isActive = w.active !== false;
    setTogglingId(w._id);
    try {
      const res = await fetch(`/api/widgets/${w._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !isActive }),
      });
      if (!res.ok) {
        toast.error(isActive ? 'No se pudo desactivar el widget' : 'No se pudo activar el widget');
        return;
      }
      const data = (await res.json()) as { widget?: Widget };
      const nextActive = data.widget?.active !== false;
      setWidgets((prev) =>
        prev.map((item) => (item._id === w._id ? { ...item, active: nextActive } : item)),
      );
      toast.success(nextActive ? 'Widget activado' : 'Widget desactivado — el embed ya no acepta mensajes');
    } catch {
      toast.error('Error al cambiar el estado del widget');
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDeleteWidget() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/widgets?id=${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('No se pudo eliminar el widget');
        return;
      }
      setWidgets((prev) => prev.filter((w) => w._id !== deleteTarget));
      toast.success('Widget eliminado');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function copySnippet(w: Widget) {
    const code = buildMinimalSnippet(w, origin);
    void navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  }

  // Reset tab when expanding a different widget
  function toggleExpanded(id: string) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      setCopied(false);
    }
  }

  useEffect(() => {
    loadWidgets();
  }, []);

  const plan = subscription?.plan ?? 'free';
  const planActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const multiAgentEligible = planActive && (plan === 'business' || plan === 'enterprise');

  useEffect(() => {
    if (!multiAgentEligible) return;
    void (async () => {
      try {
        const res = await fetch('/api/widgets/multi-agent-analytics');
        if (!res.ok) return;
        const data = (await res.json()) as MultiAgentAnalytics;
        setMultiAgentStats(data);
      } catch {
        /* ignore */
      }
    })();
  }, [multiAgentEligible]);

  async function downloadWidgetEncrypted(widgetId: string, password: string) {
    const r = await fetch(`/api/widgets/${widgetId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, format: 'json' }),
    });
    if (!r.ok) { toast.error('No se pudo generar el archivo.'); return null; }
    const blob     = await r.blob();
    const filename = r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `widget-${widgetId}.html`;
    return { blob, filename };
  }

  return (
    <div className="relative overflow-hidden min-h-full">
      <EncryptedDownloadModal
        open={exportModalWidget !== null}
        onClose={() => setExportModalWidget(null)}
        title="Descargar historial cifrado"
        onDownload={(pw) => downloadWidgetEncrypted(exportModalWidget!, pw)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar widget"
        description="¿Eliminar este widget? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => void confirmDeleteWidget()}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_R, top: '-200px', right: '-60px' }} />

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
                style={BTN_SECONDARY}
              >
                <Boxes size={22} strokeWidth={1.75} />
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
              background: BRAND_R,
              color: '#fff',
              boxShadow: '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo widget
          </Link>
        </div>

        {/* Info: widgets ilimitados */}
        <div
          className="card-texture rounded-2xl border p-4 mb-8 flex items-center gap-3"
          style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
        >
          <span className="text-xs font-semibold" style={{ color: BRAND_TEXT_COLOR }}>
            Puedes crear tantos widgets como necesites — cada widget debe tener un nombre único.
          </span>
        </div>

        {multiAgentEligible && multiAgentStats && (
          <div
            className="card-texture rounded-2xl border p-4 mb-8"
            style={{ borderColor: `${BRAND_O}35`, background: `${BRAND_O}08` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={16} style={{ color: BRAND_O }} />
              <span className="text-sm font-bold m-0">Multiagente — este mes</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {[
                ['Widgets activos', multiAgentStats.enabledWidgets ?? 0],
                ['Derivaciones', multiAgentStats.totals?.totalHandoffs ?? 0],
                ['Paralelo + síntesis', multiAgentStats.totals?.totalParallel ?? 0],
                ['Sesiones con routing', multiAgentStats.totals?.sessionsWithRouting ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl px-3 py-2" style={{ background: 'var(--background)' }}>
                  <p className="text-lg font-bold m-0">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide m-0 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <AiLoadingInline label="Cargando widgets…" hint="Recuperando tus chat widgets" style={{ padding: '48px 0' }} />
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
                background: BRAND_R,
                boxShadow: '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
              }}
            >
              <Plus size={16} />
              Crear widget
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4" data-tour="widgets-list">
            {widgets.map((w) => {
              const isActive = w.active !== false;
              return (
              <div
                key={w._id}
                className="card-hover rounded-2xl overflow-hidden border"
                style={{
                  borderColor: isActive ? 'var(--border)' : 'rgba(239,68,68,0.35)',
                  background: 'var(--card)',
                  opacity: isActive ? 1 : 0.92,
                }}
              >
                <div style={{ height: 3, background: isActive ? w.color : '#94a3b8' }} />
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
                    <p className="font-bold text-sm m-0 mb-0.5 flex items-center gap-2 flex-wrap">
                      {w.name}
                      {!isActive && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                        >
                          Desactivado
                        </span>
                      )}
                      {w.multiAgentEnabled && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                          style={BTN_SECONDARY}
                        >
                          Multi ·{' '}
                          {w.multiAgentMode === 'parallel'
                            ? 'paralelo'
                            : w.multiAgentMode === 'pipeline'
                              ? 'pipeline'
                              : 'triaje'}
                        </span>
                      )}
                    </p>
                    <p className="text-xs m-0 mb-0.5 truncate font-semibold" style={{ color: 'var(--foreground)' }}>
                      Agente: {w.agentName?.trim() || '—'}
                    </p>
                    <p className="text-xs m-0 truncate" style={{ color: 'var(--muted-foreground)' }}>
                      {w._id} · {w.position} · {w.theme} · {new Date(w.createdAt).toLocaleDateString('es')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => void toggleWidgetActive(w)}
                      disabled={togglingId === w._id}
                      title={isActive ? 'Desactivar widget (bloquea mensajes en sitios embebidos)' : 'Activar widget'}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors hover:opacity-90 disabled:opacity-50"
                      style={
                        isActive
                          ? BTN_SECONDARY
                          : {
                              background: 'rgba(34,197,94,0.1)',
                              borderColor: 'rgba(34,197,94,0.28)',
                              color: '#16a34a',
                            }
                      }
                    >
                      {isActive ? <PowerOff size={12} /> : <Power size={12} />}
                      {isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <Link
                      href={`/dashboard/widget-preview?id=${w._id}`}
                      title="Probar el chat con este widget"
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold no-underline transition-opacity hover:opacity-90"
                      style={BTN_SECONDARY}
                    >
                      <Play size={12} />
                      Probar
                    </Link>
                    <Link
                      href={`/dashboard/widget-builder?edit=${w._id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold no-underline transition-opacity hover:opacity-90"
                      style={BTN_SECONDARY}
                    >
                      <Pencil size={12} />
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExportModalWidget(w._id)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors hover:opacity-90"
                      style={BTN_SECONDARY}
                      title="Descargar historial de conversaciones (cifrado)"
                    >
                      <Download size={12} />
                      Historial
                    </button>
                    <Link
                      href={`/dashboard/widgets/${w._id}/shares`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors hover:opacity-90"
                      style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1', boxShadow: 'var(--shadow-surface-sm)', textDecoration: 'none' }}
                      title="Gestionar enlaces compartidos"
                    >
                      <Share2 size={12} />
                      Compartir
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
                      onClick={() => setDeleteTarget(w._id)}
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
                        <span className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
                          Código embed
                        </span>
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
                      {buildMinimalSnippet(w, origin)}
                    </pre>

                    {/* Footer */}
                    <div
                      className="px-4 py-2.5 border-t flex items-center gap-2"
                      style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#161b22' }}
                    >
                      <span style={{ fontSize: 10, color: '#4b5563' }}>
                        ✓ Pega esto antes de &lt;/body&gt;. Los cambios del builder se propagan automáticamente.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
