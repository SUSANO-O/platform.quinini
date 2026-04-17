'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Copy, Check, Save, ExternalLink } from 'lucide-react';
import {
  defaultHueFromHex,
  fabOrbitBlendModes,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
} from '@/lib/widget-iridescent';

// ── Orb gradient (port of orb-gradient.ts) ───────────────────────────────────

function hexToRgb(hex: string) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n = parseInt(h, 16);
  if (!isFinite(n) || h.length !== 6) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hue2rgb(p: number, q: number, t: number) {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1/6) return p + (q - p) * 6 * u;
  if (u < 1/2) return q;
  if (u < 2/3) return p + (q - p) * (2/3 - u) * 6;
  return p;
}
function hslToRgb(h: number, s: number, l: number) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  };
}
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function computeOrbGradient(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `radial-gradient(circle, ${hex}, ${hex})`;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const light = hslToRgb(h + 10, clamp(s + 8, 0, 100), clamp(l + 15, 10, 94));
  const deep  = hslToRgb(h - 12, clamp(s - 3, 12, 100), clamp(l - 20, 8, 88));
  const lHex = rgbToHex(light.r, light.g, light.b);
  const dHex = rgbToHex(deep.r, deep.g, deep.b);
  return `linear-gradient(155deg, rgba(255,255,255,.22) 0%, transparent 42%), linear-gradient(148deg, ${lHex} 0%, ${hex} 46%, ${dHex} 100%)`;
}

function computeIridescentFabBackground(hex: string): string {
  const h = defaultHueFromHex(hex);
  const seed = hashWidgetSeed(`${hex}:fab`);
  return `${iridescentOrbBackgroundCss(h, seed)}, ${computeOrbGradient(hex)}`;
}

function mockFabOrbInnerStyle(hex: string): React.CSSProperties {
  return {
    background: computeIridescentFabBackground(hex),
    ...( { backgroundBlendMode: fabOrbitBlendModes() } as Pick<React.CSSProperties, 'backgroundBlendMode'> ),
    filter: 'saturate(1.3) contrast(1.1) brightness(1.06)',
  };
}

// ── Agent list (from API; widget.agentId = id estable del ClientAgent en landing) ──

const AGENT_ICONS = ['🤖', '🧠', '💬', '✨', '📎', '🔮', '🛡️', '🌱', '📊'];

/** Alineado con index / dashboard (marca) */
const BRAND_R = '#e41414';
const BRAND_O = '#f87600';
const BRAND_B = '#00acf8';

interface ClientAgentRow {
  _id: string;
  name: string;
  description?: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  agentHubId?: string | null;
  syncStatus?: string;
  /** Agente de plataforma: si aún no hay slug en hub, el widget puede usar el ObjectId (24 hex) y el hub resuelve por landingClientAgentId. */
  isPlatform?: boolean;
}

/**
 * Id para el SDK y Mongo del widget: el `_id` hex del ClientAgent en landing.
 * AIBackHub resuelve `GET /api/agents/:id` por `landingClientAgentId`; coincide con la URL
 * `/dashboard/agents/[id]` y con MCP / `enabledMcpToolIds` guardados en ese agente.
 * Si no hay `_id` válido, se usa `agentHubId` (slug) como respaldo.
 */
function effectiveWidgetAgentId(a: ClientAgentRow): string {
  if (/^[a-fA-F0-9]{24}$/.test(a._id)) return a._id;
  const hub = typeof a.agentHubId === 'string' ? a.agentHubId.trim() : '';
  if (hub) return hub;
  return '';
}

/** Normaliza `widget.agentId` antiguo (slug hub) al `_id` landing actual cuando coincide un agente. */
function resolveStoredWidgetAgentId(stored: string, list: ClientAgentRow[]): string {
  const s = stored.trim();
  if (!s) return '';
  for (const a of list) {
    const eff = effectiveWidgetAgentId(a);
    if (eff && (eff === s || eff.toLowerCase() === s.toLowerCase())) return eff;
    const hub = typeof a.agentHubId === 'string' ? a.agentHubId.trim() : '';
    if (hub && (hub === s || hub.toLowerCase() === s.toLowerCase())) return eff;
    if (a._id === s || a._id.toLowerCase() === s.toLowerCase()) return eff;
  }
  return s;
}

function sortAgentsForWidgetPicker(list: ClientAgentRow[]): ClientAgentRow[] {
  return [...list].sort((x, y) => {
    const px = x.isPlatform ? 1 : 0;
    const py = y.isPlatform ? 1 : 0;
    if (py !== px) return py - px;
    return x.name.localeCompare(y.name, 'es');
  });
}

function firstSelectableWidgetAgentId(list: ClientAgentRow[]): string | null {
  for (const a of sortAgentsForWidgetPicker(list)) {
    const id = effectiveWidgetAgentId(a);
    if (id) return id;
  }
  return null;
}

const POSITIONS = [
  ['top-left',    'top',    'top-right'   ],
  ['left',        'center', 'right'       ],
  ['bottom-left', 'bottom', 'bottom-right'],
];

// ── Config type ───────────────────────────────────────────────────────────────

interface WidgetConfig {
  name: string;
  agentId: string;
  color: string;
  title: string;
  subtitle: string;
  welcome: string;
  fabHint: string;
  /** WhatsApp / teléfono con código de país (solo dígitos y símbolos al pegar). */
  humanSupportPhone: string;
  avatar: string;
  position: string;
  theme: 'light' | 'dark';
  borderRadius: string;
  autoOpen: boolean;
}

const DEFAULT: WidgetConfig = {
  name: 'Mi Widget',
  agentId: '',
  color: BRAND_R,
  title: 'MatIAsAssistant',
  subtitle: 'Siempre aquí para ayudarte',
  welcome: '¡Hola! ¿En qué puedo ayudarte?',
  fabHint: '¿Necesitas ayuda?',
  avatar: '',
  position: 'bottom-right',
  theme: 'light',
  borderRadius: '16px',
  autoOpen: false,
  humanSupportPhone: '',
};

// ── Mock preview ─────────────────────────────────────────────────────────────

function MockPreview({ cfg }: { cfg: WidgetConfig }) {
  const [chatOpen, setChatOpen] = useState(false);
  /** Evita mutar el DOM con innerHTML en onError (rompe a React). */
  const [fabAvatarFailed, setFabAvatarFailed] = useState(false);
  const [headerAvatarFailed, setHeaderAvatarFailed] = useState(false);
  const grad = computeIridescentFabBackground(cfg.color);

  useEffect(() => {
    setFabAvatarFailed(false);
    setHeaderAvatarFailed(false);
  }, [cfg.avatar]);

  const pos: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 20, right: 20 },
    'bottom-left':  { bottom: 20, left: 20 },
    'bottom':       { bottom: 20, left: '50%', transform: 'translateX(-50%)' },
    'top-right':    { top: 20, right: 20 },
    'top-left':     { top: 20, left: 20 },
    'top':          { top: 20, left: '50%', transform: 'translateX(-50%)' },
    'left':         { top: '50%', left: 20, transform: 'translateY(-50%)' },
    'right':        { top: '50%', right: 20, transform: 'translateY(-50%)' },
    'center':       { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' },
  };

  const fabPos = pos[cfg.position] || pos['bottom-right'];

  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '16/9', minHeight: '300px',
      background: cfg.theme === 'dark' ? '#1a1a2e' : '#f8fafc',
      borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)',
    }}>
      {/* Mock browser bar */}
      <div style={{ background: cfg.theme === 'dark' ? '#0f0f23' : '#e2e8f0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {['#ef4444','#f59e0b','#22c55e'].map((c) => <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />)}
        <div style={{ flex: 1, background: cfg.theme === 'dark' ? '#1a1a2e' : '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 10, color: cfg.theme === 'dark' ? '#64748b' : '#94a3b8' }}>
          yoursite.com
        </div>
      </div>

      {/* Mock page content */}
      <div style={{ padding: '16px', color: cfg.theme === 'dark' ? '#e2e8f0' : '#1e293b' }}>
        {[60, 80, 45, 70].map((w, i) => (
          <div key={i} style={{ height: 8, background: cfg.theme === 'dark' ? '#2d2d4e' : '#e2e8f0', borderRadius: 4, marginBottom: 8, width: `${w}%` }} />
        ))}
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div style={{
          position: 'absolute', ...fabPos,
          width: 240, height: 280,
          background: cfg.theme === 'dark' ? '#1e1e3a' : '#fff',
          borderRadius: cfg.borderRadius,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.08)',
          // Offset up from FAB
          ...(cfg.position.includes('bottom') ? { bottom: 72, right: fabPos.right, left: fabPos.left, top: 'auto', transform: fabPos.left === '50%' ? 'translateX(-50%)' : undefined } : {}),
        }}>
          <div
            style={{
              background: grad,
              ...( { backgroundBlendMode: fabOrbitBlendModes() } as Pick<React.CSSProperties, 'backgroundBlendMode'> ),
    filter: 'saturate(1.3) contrast(1.1) brightness(1.06)',
              padding: '12px',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {cfg.avatar && !headerAvatarFailed ? (
                <img
                  src={cfg.avatar}
                  alt="avatar"
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  onError={() => setHeaderAvatarFailed(true)}
                />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 11, margin: 0 }}>{cfg.title || 'MatIAs'}</p>
                <p style={{ fontSize: 9, opacity: 0.85, margin: 0 }}>{cfg.subtitle || ''}</p>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✕</button>
            </div>
          </div>
          <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
            <div style={{ background: cfg.color + '22', borderRadius: '10px 10px 10px 2px', padding: '7px 10px', fontSize: 10, maxWidth: '85%' }}>
              {cfg.welcome || '¡Hola! ¿En qué puedo ayudarte?'}
            </div>
            <div style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
              <div style={{ background: cfg.color, color: '#fff', borderRadius: '10px 10px 2px 10px', padding: '6px 9px', fontSize: 10 }}>
                ¿Hay atención humana?
              </div>
            </div>
            {(() => {
              const d = String(cfg.humanSupportPhone ?? '').replace(/\D/g, '');
              const ok = d.length >= 8;
              if (!ok) {
                return (
                  <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.35 }}>
                    Si el visitante escribe p. ej. «persona» o «atención humana» y hay número válido, aparece aquí un enlace a WhatsApp.
                  </p>
                );
              }
              return (
                <div
                  style={{
                    alignSelf: 'stretch',
                    fontSize: 9,
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: cfg.theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>Atención humana por WhatsApp</span>
                  <a
                    href={`https://wa.me/${d}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: `1px solid ${cfg.color}44`,
                      color: cfg.color,
                      textDecoration: 'none',
                    }}
                  >
                    WhatsApp
                  </a>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <div style={{ flex: 1, height: 26, background: cfg.theme === 'dark' ? '#2d2d4e' : '#f1f5f9', borderRadius: 8 }} />
              <div style={{ width: 26, height: 26, background: cfg.color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>➤</div>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <div style={{ position: 'absolute', ...fabPos, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {!chatOpen && cfg.fabHint && (
          <div style={{
            background: '#fff', color: '#333', fontSize: 10, padding: '4px 8px',
            borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap',
            border: '1px solid #e2e8f0',
          }}>
            {cfg.fabHint}
          </div>
        )}
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className="relative overflow-hidden rounded-full border-0 shadow-lg ring-1 ring-white/35"
          style={{
            width: 44,
            height: 44,
            cursor: 'pointer',
            boxShadow: `0 4px 16px ${cfg.color}66`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {cfg.avatar && !fabAvatarFailed ? (
            <img
              src={cfg.avatar}
              alt=""
              className="relative z-10 h-full w-full object-cover"
              onError={() => setFabAvatarFailed(true)}
            />
          ) : (
            <>
              <div
                className="absolute inset-[-36%] rounded-full"
                style={mockFabOrbInnerStyle(cfg.color)}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-0 z-[1] rounded-full"
                style={{
                  boxShadow:
                    'inset 0 2px 10px rgba(255,255,255,0.5), inset 0 -5px 12px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.22)',
                }}
                aria-hidden
              />
              <span className="relative z-[2] text-[20px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                {chatOpen ? '✕' : '💬'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Snippet generator ─────────────────────────────────────────────────────────

function generateSnippet(
  cfg: WidgetConfig,
  token: string = 'YOUR_TOKEN',
  opts?: { includeToken?: boolean },
) {
  const includeToken = opts?.includeToken !== false;
  const host =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3200';
  const lines = [`<script src="${host}/widget.js"></script>`, `<script>`, `  window.AgentFlowhub.init({`];
  lines.push(`    agentId: '${cfg.agentId || 'TU_AGENT_ID_HUB'}',`);
  if (includeToken) {
    lines.push(`    token: '${token}',`);
  }
  lines.push(`    host: '${host}',`);
  if (cfg.title) lines.push(`    title: '${cfg.title}',`);
  if (cfg.subtitle) lines.push(`    subtitle: '${cfg.subtitle}',`);
  if (cfg.welcome) lines.push(`    welcome: '${cfg.welcome}',`);
  if (cfg.fabHint) lines.push(`    fabHint: '${cfg.fabHint}',`);
  const phone = String(cfg.humanSupportPhone ?? '').trim();
  if (phone) lines.push(`    humanSupportPhone: ${JSON.stringify(phone)},`);
  if (cfg.avatar) lines.push(`    avatar: '${cfg.avatar}',`);
  lines.push(`    color: '${cfg.color}',`);
  lines.push(`    position: '${cfg.position}',`);
  lines.push(`    theme: '${cfg.theme}',`);
  lines.push(`    borderRadius: '${cfg.borderRadius}',`);
  if (cfg.autoOpen) lines.push(`    autoOpen: true,`);
  lines.push(`  });`, `</script>`);
  return lines.join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WidgetBuilderPage() {
  const [cfg, setCfg] = useState<WidgetConfig>(DEFAULT);
  const [agents, setAgents] = useState<ClientAgentRow[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [editWidgetId, setEditWidgetId] = useState<string | null>(null);
  const [snippetToken, setSnippetToken] = useState('YOUR_TOKEN');
  /** Si false, el snippet no incluye la línea `token` (p. ej. agentes sin token de widget). */
  const [includeTokenInSnippet, setIncludeTokenInSnippet] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const editParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('edit')
        : null;
    const editId =
      editParam && /^[a-f0-9]{24}$/i.test(editParam) ? editParam : null;

    async function run() {
      try {
        const agentsRes = await fetch('/api/agents');
        const agentsData = (await agentsRes.json()) as { agents?: ClientAgentRow[] };
        const list = sortAgentsForWidgetPicker(
          (agentsData.agents ?? []).filter(
            (a) => a.type === 'agent' && a.status === 'active',
          ),
        );
        if (cancelled) return;
        setAgents(list);

        if (editId) {
          const wRes = await fetch(`/api/widgets/${editId}`);
          if (!wRes.ok) {
            setEditWidgetId(null);
            setCfg((prev) => {
              const okIds = new Set(
                list.map((a) => effectiveWidgetAgentId(a)).filter(Boolean),
              );
              const normalized = prev.agentId
                ? resolveStoredWidgetAgentId(prev.agentId, list)
                : '';
              if (normalized && okIds.has(normalized)) {
                return normalized === prev.agentId
                  ? prev
                  : { ...prev, agentId: normalized };
              }
              const first = firstSelectableWidgetAgentId(list);
              if (first) return { ...prev, agentId: first };
              return prev;
            });
          } else {
            const data = (await wRes.json()) as {
              widget?: Record<string, unknown>;
            };
            const widget = data.widget;
            if (cancelled || !widget) return;
            setEditWidgetId(editId);
            const tok =
              typeof widget.afhubToken === 'string' && widget.afhubToken.startsWith('wt_')
                ? widget.afhubToken
                : 'YOUR_TOKEN';
            setSnippetToken(tok);
            const th = widget.theme === 'dark' ? 'dark' : 'light';
            const rawAgent = String(widget.agentId ?? '');
            setCfg({
              name: String(widget.name ?? DEFAULT.name),
              agentId: resolveStoredWidgetAgentId(rawAgent, list) || rawAgent,
              color: String(widget.color ?? DEFAULT.color),
              title: String(widget.title ?? DEFAULT.title),
              subtitle: String(widget.subtitle ?? ''),
              welcome: String(widget.welcome ?? ''),
              fabHint: String(widget.fabHint ?? ''),
              humanSupportPhone: String(widget.humanSupportPhone ?? ''),
              avatar: String(widget.avatar ?? ''),
              position: String(widget.position ?? 'bottom-right'),
              theme: th,
              borderRadius: String(widget.borderRadius ?? '16px'),
              autoOpen: Boolean(widget.autoOpen),
            });
          }
        } else {
          setCfg((prev) => {
            const okIds = new Set(
              list.map((a) => effectiveWidgetAgentId(a)).filter(Boolean),
            );
            const normalized = prev.agentId
              ? resolveStoredWidgetAgentId(prev.agentId, list)
              : '';
            if (normalized && okIds.has(normalized)) {
              return normalized === prev.agentId ? prev : { ...prev, agentId: normalized };
            }
            const first = firstSelectableWidgetAgentId(list);
            if (first) return { ...prev, agentId: first };
            return prev;
          });
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<WidgetConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
  }, []);

  function copySnippet() {
    navigator.clipboard.writeText(
      generateSnippet(cfg, snippetToken, { includeToken: includeTokenInSnippet }),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveWidget() {
    setSaving(true);
    try {
      if (editWidgetId) {
        const res = await fetch(`/api/widgets/${editWidgetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        }
      } else {
        const res = await fetch('/api/widgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            widget?: { afhubToken?: string; _id?: string };
          };
          const wid = data.widget?._id;
          if (wid) {
            setEditWidgetId(String(wid));
            if (typeof window !== 'undefined') {
              window.history.replaceState(
                null,
                '',
                `/dashboard/widget-builder?edit=${wid}`,
              );
            }
          }
          if (data.widget?.afhubToken?.startsWith('wt_')) {
            setSnippetToken(data.widget.afhubToken);
          }
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        }
      }
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontSize: '13px', boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '5px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const fieldStyle: React.CSSProperties = { marginBottom: '14px' };

  return (
    <div className="relative overflow-hidden min-h-full">
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_R, top: '-200px', right: '-80px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: BRAND_B, top: '120px', left: '-100px' }} />

      <div className="relative flex flex-col xl:flex-row gap-8 max-w-7xl mx-auto px-6 py-10">
        {/* Formulario */}
        <div className="w-full xl:w-[360px] shrink-0 xl:max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
          <div className="card-texture rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="badge-primary mb-3 w-fit">Widget</div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight m-0 mb-1">
              {editWidgetId ? (
                <>
                  Editar <span className="gradient-text">widget</span>
                </>
              ) : (
                <>
                  Widget <span className="gradient-text">Builder</span>
                </>
              )}
            </h1>
            <p className="text-[13px] m-0 mb-6" style={{ color: 'var(--muted-foreground)' }}>
              {editWidgetId
                ? 'Cambios guardados con el mismo token de integración.'
                : 'Diseña tu chat widget. El preview se actualiza en tiempo real — misma estética que la landing.'}
            </p>
            {editWidgetId && (
              <p className="mb-6 m-0">
                <Link href="/dashboard/widgets" className="text-xs font-semibold landing-link-accent no-underline">
                  ← Volver a Mis widgets
                </Link>
              </p>
            )}

        {/* Widget name */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Nombre del widget</label>
          <input style={inputStyle} value={cfg.name} onChange={(e) => update({ name: e.target.value })} placeholder="Mi widget" />
        </div>

        {/* Agent selector (widget.agentId = ObjectId landing; el hub resuelve por landingClientAgentId) */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Agente</label>
          {loadingInitial ? (
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>Cargando…</p>
          ) : agents.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
              No tienes agentes activos.{' '}
              <Link href="/dashboard/agents/new" className="font-semibold landing-link-accent text-[13px]">
                Crear agente
              </Link>
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {agents.map((a, i) => {
                const agentIdForWidget = effectiveWidgetAgentId(a);
                const selectable = agentIdForWidget.length > 0;
                const selected = selectable && cfg.agentId === agentIdForWidget;
                const icon = AGENT_ICONS[i % AGENT_ICONS.length];
                const short =
                  a.name.length > 14 ? `${a.name.slice(0, 12)}…` : a.name;
                return (
                  <button
                    key={a._id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectable && update({ agentId: agentIdForWidget })}
                    title={
                      selectable
                        ? `${a.description || a.name}${a.isPlatform ? ' · Agente de plataforma' : ''}`
                        : 'ID de agente no válido. Revisa que el agente exista y esté activo.'
                    }
                    style={{
                      padding: '8px 6px',
                      borderRadius: '8px',
                      border: `1px solid ${selected ? cfg.color : 'var(--border)'}`,
                      background: selected ? cfg.color + '18' : 'var(--background)',
                      cursor: selectable ? 'pointer' : 'not-allowed',
                      textAlign: 'center',
                      opacity: selectable ? 1 : 0.55,
                      position: 'relative',
                    }}
                  >
                    {a.isPlatform ? (
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          fontSize: 7,
                          fontWeight: 800,
                          color: BRAND_B,
                          lineHeight: 1,
                        }}
                        title="Plataforma"
                      >
                        P
                      </span>
                    ) : null}
                    <div style={{ fontSize: 16 }}>{icon}</div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: selected ? 700 : 500,
                        marginTop: 2,
                        color: selected ? cfg.color : 'var(--foreground)',
                      }}
                    >
                      {short}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!loadingInitial &&
            agents.some((a) => !effectiveWidgetAgentId(a)) && (
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '8px', marginBottom: 0 }}>
              Los agentes atenuados no tienen un <code style={{ fontSize: '10px' }}>_id</code> Mongo válido (24 hex) ni <code style={{ fontSize: '10px' }}>agentHubId</code>. Si acabas de crear el agente, abre{' '}
              <Link href="/dashboard/agents" className="font-semibold landing-link-accent text-[11px]">Mis agentes</Link>
              {' '}y pulsa sincronizar con el hub, o espera a que pase de estado pendiente a sincronizado.
            </p>
          )}
          {!loadingInitial && agents.length > 0 && (
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '8px', marginBottom: 0, lineHeight: 1.45 }}>
              El snippet usará el <strong>ID de este agente en la landing</strong> (misma clave que en la URL al editarlo). El chat y el MCP del hub siguen resolviendo al catálogo vía <code style={{ fontSize: '10px' }}>landingClientAgentId</code>.
            </p>
          )}
        </div>

        {/* Branding */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="color" value={cfg.color} onChange={(e) => update({ color: e.target.value })}
                style={{ width: 36, height: 36, border: 'none', borderRadius: '8px', cursor: 'pointer', padding: 2 }} />
              <input style={{ ...inputStyle, flex: 1 }} value={cfg.color} onChange={(e) => update({ color: e.target.value })} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Tema</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['light','dark'] as const).map((t) => (
                <button key={t} onClick={() => update({ theme: t })} style={{
                  flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  border: `1px solid ${cfg.theme === t ? cfg.color : 'var(--border)'}`,
                  background: cfg.theme === t ? cfg.color + '18' : 'var(--background)',
                  color: cfg.theme === t ? cfg.color : 'var(--foreground)', cursor: 'pointer',
                }}>
                  {t === 'light' ? '☀️' : '🌙'} {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Texts */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Título</label>
          <input style={inputStyle} value={cfg.title} onChange={(e) => update({ title: e.target.value })} placeholder="MatIAsAssistant" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Subtítulo</label>
          <input style={inputStyle} value={cfg.subtitle} onChange={(e) => update({ subtitle: e.target.value })} placeholder="Siempre aquí para ayudarte" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Mensaje de bienvenida</label>
          <input style={inputStyle} value={cfg.welcome} onChange={(e) => update({ welcome: e.target.value })} placeholder="¡Hola! ¿En qué puedo ayudarte?" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Mensaje FAB (hint)</label>
          <input style={inputStyle} value={cfg.fabHint} onChange={(e) => update({ fabHint: e.target.value })} placeholder="¿Necesitas ayuda?" />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>WhatsApp — atención humana</label>
          <input
            style={inputStyle}
            value={cfg.humanSupportPhone ?? ''}
            onChange={(e) => update({ humanSupportPhone: e.target.value.slice(0, 48) })}
            placeholder="+52 55 1234 5678 (con código de país)"
          />
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 6, marginBottom: 0, lineHeight: 1.45 }}>
            Si el visitante escribe palabras como «persona», «humano» o «atención humana», aparece en el chat un acceso a WhatsApp (con número válido). Opcional.
          </p>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>URL de avatar / orbe</label>
          <input style={inputStyle} value={cfg.avatar} onChange={(e) => update({ avatar: e.target.value })} placeholder="https://..." />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Border radius</label>
          <input style={inputStyle} value={cfg.borderRadius} onChange={(e) => update({ borderRadius: e.target.value })} placeholder="16px" />
        </div>

        {/* Position grid */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Posición</label>
          <div style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
            {POSITIONS.flat().map((p) => (
              <button
                key={p}
                onClick={() => update({ position: p })}
                title={p}
                style={{
                  width: 34, height: 34, borderRadius: '6px', fontSize: 9, fontWeight: 600,
                  border: `1px solid ${cfg.position === p ? cfg.color : 'var(--border)'}`,
                  background: cfg.position === p ? cfg.color : 'var(--background)',
                  color: cfg.position === p ? '#fff' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
              >
                {p.split('-').map((w) => w[0].toUpperCase()).join('')}
              </button>
            ))}
          </div>
        </div>

        {/* Auto open */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <input type="checkbox" id="autoOpen" checked={cfg.autoOpen} onChange={(e) => update({ autoOpen: e.target.checked })}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="autoOpen" style={{ fontSize: '13px', cursor: 'pointer' }}>Abrir automáticamente</label>
        </div>

        {/* Token en snippet */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <input
              type="checkbox"
              id="includeTokenSnippet"
              checked={includeTokenInSnippet}
              onChange={(e) => setIncludeTokenInSnippet(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <label htmlFor="includeTokenSnippet" style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                Incluir token en el código
              </label>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.45 }}>
                Desactívalo si el agente no exige token de widget. Tras guardar, el token sigue existiendo en el servidor; solo cambia el snippet copiado.
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copySnippet}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-[13px] border transition-colors hover:bg-slate-50"
            style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          >
            {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
          <button
            type="button"
            onClick={saveWidget}
            disabled={saving || loadingInitial}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-[13px] text-white border-0 transition-all hover:opacity-95 disabled:opacity-60"
            style={{
              background: saved ? '#22c55e' : `linear-gradient(135deg, ${BRAND_R}, ${BRAND_O})`,
              boxShadow: saved ? undefined : '0 4px 18px rgba(228,20,20,0.28)',
              cursor: saving || loadingInitial ? 'not-allowed' : 'pointer',
            }}
          >
            <Save size={14} />
            {saving ? 'Guardando...' : saved ? 'Guardado!' : editWidgetId ? 'Guardar cambios' : 'Guardar widget'}
          </button>
        </div>
          </div>
        </div>

      {/* Preview + snippet */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Live preview */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest m-0 mb-2" style={{ color: 'var(--muted-foreground)' }}>
            Vista previa — prueba el botón
          </p>
          <div className="rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: 'var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
            <MockPreview cfg={cfg} />
          </div>
        </div>

        {/* Code snippet */}
        <div className="rounded-2xl overflow-hidden border flex flex-col flex-1 min-h-0 card-texture" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-b"
            style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
              </div>
              <span className="text-xs font-bold font-mono truncate" style={{ color: 'var(--muted-foreground)' }}>
                embed-snippet.html
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={copySnippet}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors hover:bg-white/80"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                {copied ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href="/widget"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border no-underline transition-colors hover:bg-white/80"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: BRAND_R }}
              >
                <ExternalLink size={12} />
                Docs SDK
              </a>
            </div>
          </div>
          <pre className="p-4 text-xs overflow-x-auto m-0 flex-1 min-h-[120px]" style={{ background: '#0f1729', color: '#e2e8f0', lineHeight: 1.6 }}>
            {generateSnippet(cfg, snippetToken, { includeToken: includeTokenInSnippet })}
          </pre>
        </div>
      </div>
      </div>
    </div>
  );
}

