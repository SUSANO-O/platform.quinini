'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Copy, Check, Save, ExternalLink, Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/use-subscription';
import { AvatarEditor } from '@/components/ui/AvatarEditor';
import { WizardSteps } from '@/components/ui/wizard-steps';
import {
  defaultHueFromHex,
  fabOrbitBlendModes,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
} from '@/lib/widget-iridescent';
import {
  createDefaultPipelineConfig,
  isContentCapableAgent,
  isCreativeCapableAgent,
  normalizePipelineConfig,
  validatePipelineConfig,
  validatePipelineWidgetSetup,
  type PipelineConfig,
} from '@/lib/widget-pipeline-ui';
import type { HandoffNotifyMode } from '@/lib/handoff-notify';
import { HANDOFF_NOTIFY_MODE_LABELS } from '@/lib/handoff-notify';
import { PipelineEditor } from '@/components/dashboard/pipeline-editor';

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

import { BRAND } from '@/lib/brand-colors';

const BRAND_R = BRAND.primary;
const BRAND_O = BRAND.warm;
const BRAND_B = BRAND.cool;

interface ClientAgentRow {
  _id: string;
  name: string;
  description?: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  agentHubId?: string | null;
  syncStatus?: string;
  model?: string;
  enabledMcpToolIds?: string[];
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

function agentProfileFromRow(a: ClientAgentRow) {
  return {
    name: a.name,
    description: a.description,
    model: a.model,
    enabledMcpToolIds: a.enabledMcpToolIds,
  };
}

function resolveAgentProfileByWidgetId(
  list: ClientAgentRow[],
  widgetAgentId: string,
) {
  for (const a of list) {
    const eff = effectiveWidgetAgentId(a);
    if (eff === widgetAgentId || a._id === widgetAgentId) return agentProfileFromRow(a);
  }
  return undefined;
}

const POSITIONS = [
  ['top-left',    'top',    'top-right'   ],
  ['left',        'center', 'right'       ],
  ['bottom-left', 'bottom', 'bottom-right'],
];

// ── Config type ───────────────────────────────────────────────────────────────

interface WidgetShortcut {
  id: string;
  label: string;
  message: string;
  emoji: string;
  enabled: boolean;
}

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
  /** Oferta WhatsApp por palabras clave en el chat */
  humanSupportEnabled: boolean;
  /** Destino externo al escalar: inbox | webhook | slack | both */
  handoffNotifyMode: HandoffNotifyMode;
  /** Muestra el botón «Hablar con una persona» y permite enviar escalaciones. */
  handoffEnabled: boolean;
  avatar: string;
  position: string;
  theme: 'light' | 'dark';
  borderRadius: string;
  autoOpen: boolean;
  voiceEnabled: boolean;
  multiAgentEnabled: boolean;
  multiAgentMode: 'triage' | 'parallel' | 'pipeline';
  agentIds: string[];
  orchestratorAgentIds: string[];
  pipelineConfig: PipelineConfig | null;
}

interface OrchestratorSubAgent {
  _id: string;
  name: string;
  description?: string;
  status?: string;
  parentName?: string;
}

const DEFAULT: WidgetConfig = {
  name: 'Mi Widget',
  agentId: '',
  color: BRAND_R,
  title: 'BotIvA Assistant',
  subtitle: 'Siempre aquí para ayudarte',
  welcome: '¡Hola! ¿En qué puedo ayudarte?',
  fabHint: '¿Necesitas ayuda?',
  avatar: '',
  position: 'bottom-right',
  theme: 'light',
  borderRadius: '16px',
  autoOpen: false,
  voiceEnabled: true,
  humanSupportPhone: '',
  humanSupportEnabled: true,
  handoffNotifyMode: 'both',
  handoffEnabled: true,
  multiAgentEnabled: false,
  multiAgentMode: 'triage',
  agentIds: [],
  orchestratorAgentIds: [],
  pipelineConfig: null,
};

// ── Mock preview ─────────────────────────────────────────────────────────────

function MockPreview({ cfg, shortcuts = [] }: { cfg: WidgetConfig; shortcuts?: WidgetShortcut[] }) {
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
      position: 'relative', width: '100%', height: '380px', minHeight: '380px',
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
          width: 260, height: 300,
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
                <p style={{ fontWeight: 700, fontSize: 11, margin: 0 }}>{cfg.title || 'BotIvA'}</p>
                <p style={{ fontSize: 9, opacity: 0.85, margin: 0 }}>{cfg.subtitle || ''}</p>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ marginLeft: 'auto', flexShrink: 0, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✕</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 6, overflowY: 'auto' }}>
            <div style={{ background: cfg.color + '22', borderRadius: '10px 10px 10px 2px', padding: '7px 10px', fontSize: 10, maxWidth: '85%' }}>
              {cfg.welcome || '¡Hola! ¿En qué puedo ayudarte?'}
            </div>
            <div style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
              <div style={{ background: cfg.color, color: '#fff', borderRadius: '10px 10px 2px 10px', padding: '6px 9px', fontSize: 10 }}>
                ¿Hay atención humana?
              </div>
            </div>
            {(() => {
              if (!cfg.humanSupportEnabled) {
                return (
                  <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.35 }}>
                    WhatsApp desactivado en este widget.
                  </p>
                );
              }
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
            {shortcuts.filter((s) => s.enabled !== false).length > 0 && (
              <div style={{ borderTop: `1px solid ${cfg.color}18`, marginTop: 4 }}>
                <div style={{ padding: '4px 6px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: cfg.color }}>Accesos rápidos</span>
                  <span style={{ fontSize: 11, color: cfg.color, lineHeight: 1 }}>‹</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 6px 6px' }}>
                  {shortcuts.filter((s) => s.enabled !== false).slice(0, 3).map((sc) => (
                    <div
                      key={sc.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 5,
                        padding: '5px 8px', borderRadius: 7,
                        border: `1px solid ${cfg.color}28`,
                        background: `${cfg.color}0a`,
                        fontSize: 8, fontWeight: 500,
                        color: cfg.theme === 'dark' ? '#e2e8f0' : '#1e293b',
                      }}
                    >
                      <span style={{ fontSize: 9, flexShrink: 0, width: 14, textAlign: 'center' }}>{sc.emoji || '💬'}</span>
                      <span style={{ flex: 1, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {sc.message || sc.label}
                      </span>
                      <span style={{ fontSize: 11, color: cfg.color, flexShrink: 0 }}>›</span>
                    </div>
                  ))}
                  {shortcuts.filter((s) => s.enabled !== false).length > 3 && (
                    <div style={{ textAlign: 'center', fontSize: 7, color: cfg.color, opacity: 0.7 }}>
                      +{shortcuts.filter((s) => s.enabled !== false).length - 3} más
                    </div>
                  )}
                </div>
              </div>
            )}
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
  _cfg: WidgetConfig,
  token: string = 'YOUR_TOKEN',
) {
  const host =
    typeof window !== 'undefined' ? window.location.origin : 'https://tudominio.com';
  return [
    `<script src="${host}/widget.js"></script>`,
    `<script>`,
    `  window.AgentFlowhub.init({`,
    `    token: '${token}',`,
    `    host:  '${host}',`,
    `  });`,
    `</script>`,
  ].join('\n');
}

// ── Main component ────────────────────────────────────────────────────────────

const WIDGET_WIZARD_STEPS = [
  { id: 'identity', label: 'Identidad' },
  { id: 'appearance', label: 'Apariencia' },
  { id: 'behavior', label: 'Comportamiento' },
  { id: 'publish', label: 'Publicar' },
] as const;

export default function WidgetBuilderPage() {
  const { subscription } = useSubscription();
  const [cfg, setCfg] = useState<WidgetConfig>(DEFAULT);
  const [agents, setAgents] = useState<ClientAgentRow[]>([]);
  const [orchestratorSubs, setOrchestratorSubs] = useState<OrchestratorSubAgent[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [editWidgetId, setEditWidgetId] = useState<string | null>(null);
  const [snippetToken, setSnippetToken] = useState('YOUR_TOKEN');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shortcuts, setShortcuts] = useState<WidgetShortcut[]>([]);
  const [suggestingShortcuts, setSuggestingShortcuts] = useState(false);
  const [shortcutSuggestErr, setShortcutSuggestErr] = useState('');
  const [wizardStep, setWizardStep] = useState(0);

  const plan = subscription?.plan ?? 'free';
  const planActive =
    subscription?.status === 'active' || subscription?.status === 'trialing';
  const multiAgentEligible = planActive && (plan === 'business' || plan === 'enterprise');

  const selectedOrchestratorIds = useMemo(
    () =>
      (cfg.multiAgentEnabled ? [cfg.agentId, ...cfg.orchestratorAgentIds] : [cfg.agentId]).filter(
        (id) => /^[a-f0-9]{24}$/i.test(id),
      ),
    [cfg.agentId, cfg.orchestratorAgentIds, cfg.multiAgentEnabled],
  );

  const pipelineSetup = useMemo(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return null;
    return validatePipelineWidgetSetup(selectedOrchestratorIds, (id) =>
      resolveAgentProfileByWidgetId(agents, id),
    );
  }, [cfg.multiAgentEnabled, cfg.multiAgentMode, selectedOrchestratorIds, agents]);

  const pipelineConfigValidation = useMemo(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return null;
    return validatePipelineConfig(cfg.pipelineConfig, selectedOrchestratorIds, (id) =>
      resolveAgentProfileByWidgetId(agents, id),
    );
  }, [cfg.multiAgentEnabled, cfg.multiAgentMode, cfg.pipelineConfig, selectedOrchestratorIds, agents]);

  const orchestratorOptions = useMemo(
    () =>
      selectedOrchestratorIds
        .map((id) => {
          const row = agents.find(
            (a) => effectiveWidgetAgentId(a) === id || a._id === id,
          );
          if (!row) return null;
          return {
            id,
            name: row.name,
            profile: agentProfileFromRow(row),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    [selectedOrchestratorIds, agents],
  );

  useEffect(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return;
    if (selectedOrchestratorIds.length < 2) return;
    setCfg((prev) => {
      if (prev.multiAgentMode !== 'pipeline') return prev;
      const resolve = (id: string) => resolveAgentProfileByWidgetId(agents, id);
      const normalized = normalizePipelineConfig(prev.pipelineConfig, selectedOrchestratorIds);
      const next =
        normalized ??
        createDefaultPipelineConfig(selectedOrchestratorIds, resolve);
      if (
        prev.pipelineConfig &&
        JSON.stringify(prev.pipelineConfig) === JSON.stringify(next)
      ) {
        return prev;
      }
      return { ...prev, pipelineConfig: next };
    });
  }, [
    cfg.multiAgentEnabled,
    cfg.multiAgentMode,
    selectedOrchestratorIds.join(','),
    agents,
  ]);

  useEffect(() => {
    const orchIds = (cfg.multiAgentEnabled
      ? [cfg.agentId, ...cfg.orchestratorAgentIds]
      : [cfg.agentId]
    ).filter((id) => /^[a-f0-9]{24}$/i.test(id));
    if (!orchIds.length) {
      setOrchestratorSubs([]);
      return;
    }
    let cancelled = false;
    setLoadingSubs(true);
    void (async () => {
      try {
        const merged = new Map<string, OrchestratorSubAgent>();
        for (const oid of orchIds) {
          const res = await fetch(`/api/agents/${oid}`);
          if (!res.ok) continue;
          const data = (await res.json()) as {
            subAgents?: OrchestratorSubAgent[];
            agent?: { name?: string };
          };
          const parentName = data.agent?.name ?? '';
          for (const sub of data.subAgents ?? []) {
            if (!sub || typeof sub._id !== 'string' || sub.status === 'disabled') continue;
            if (!merged.has(sub._id)) {
              merged.set(sub._id, { ...sub, parentName });
            }
          }
        }
        if (cancelled) return;
        const subs = [...merged.values()];
        setOrchestratorSubs(subs);
        setCfg((prev) => {
          const valid = new Set(subs.map((s) => s._id));
          const filtered = prev.agentIds.filter((id) => valid.has(id));
          return filtered.length === prev.agentIds.length ? prev : { ...prev, agentIds: filtered };
        });
      } catch {
        if (!cancelled) setOrchestratorSubs([]);
      } finally {
        if (!cancelled) setLoadingSubs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg.agentId, cfg.orchestratorAgentIds, cfg.multiAgentEnabled]);

  function isOrchestratorSelected(id: string) {
    return cfg.agentId === id || cfg.orchestratorAgentIds.includes(id);
  }

  function toggleOrchestratorAgent(id: string) {
    if (!cfg.multiAgentEnabled) {
      update({ agentId: id, orchestratorAgentIds: [] });
      return;
    }
    if (cfg.agentId === id) {
      if (cfg.orchestratorAgentIds.length === 0) return;
      update({
        agentId: cfg.orchestratorAgentIds[0],
        orchestratorAgentIds: cfg.orchestratorAgentIds.slice(1),
      });
      return;
    }
    if (cfg.orchestratorAgentIds.includes(id)) {
      update({ orchestratorAgentIds: cfg.orchestratorAgentIds.filter((x) => x !== id) });
      return;
    }
    const total = 1 + cfg.orchestratorAgentIds.length;
    if (total >= 5) {
      toast.error('Máximo 5 agentes orquestadores en el widget');
      return;
    }
    update({ orchestratorAgentIds: [...cfg.orchestratorAgentIds, id] });
  }

  function toggleTeamAgent(id: string) {
    setCfg((prev) => {
      const has = prev.agentIds.includes(id);
      if (has) {
        return { ...prev, agentIds: prev.agentIds.filter((x) => x !== id) };
      }
      if (prev.agentIds.length >= 5) {
        toast.error('Máximo 5 especialistas adicionales en el equipo');
        return prev;
      }
      return { ...prev, agentIds: [...prev.agentIds, id] };
    });
  }

  function goNextStep() {
    if (wizardStep === 0) {
      if (!cfg.name.trim()) { toast.error('Indica un nombre para el widget'); return; }
      if (!cfg.agentId) { toast.error('Selecciona un agente'); return; }
      if (pipelineConfigValidation && !pipelineConfigValidation.ok) {
        toast.error(pipelineConfigValidation.errors[0] ?? 'Revisa la configuración del pipeline');
        return;
      }
      if (pipelineSetup && !pipelineSetup.ok && !cfg.pipelineConfig) {
        toast.error(pipelineSetup.warnings[0] ?? 'Revisa la configuración del pipeline');
        return;
      }
    }
    setWizardStep((s) => Math.min(WIDGET_WIZARD_STEPS.length - 1, s + 1));
  }

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
              humanSupportEnabled: widget.humanSupportEnabled !== false,
              handoffNotifyMode:
                widget.handoffNotifyMode === 'inbox' ||
                widget.handoffNotifyMode === 'webhook' ||
                widget.handoffNotifyMode === 'slack' ||
                widget.handoffNotifyMode === 'both'
                  ? widget.handoffNotifyMode
                  : 'both',
              handoffEnabled: widget.handoffEnabled !== false,
              avatar: String(widget.avatar ?? ''),
              position: String(widget.position ?? 'bottom-right'),
              theme: th,
              borderRadius: String(widget.borderRadius ?? '16px'),
              autoOpen: Boolean(widget.autoOpen),
              voiceEnabled: widget.voiceEnabled !== false,
              multiAgentEnabled: widget.multiAgentEnabled === true,
              multiAgentMode:
                widget.multiAgentMode === 'parallel'
                  ? 'parallel'
                  : widget.multiAgentMode === 'pipeline'
                    ? 'pipeline'
                    : 'triage',
              agentIds: Array.isArray(widget.agentIds)
                ? (widget.agentIds as string[]).filter((id) => typeof id === 'string')
                : [],
              orchestratorAgentIds: Array.isArray(widget.orchestratorAgentIds)
                ? (widget.orchestratorAgentIds as string[]).filter((id) => typeof id === 'string')
                : [],
              pipelineConfig: normalizePipelineConfig(
                widget.pipelineConfig,
                [
                  resolveStoredWidgetAgentId(rawAgent, list) || rawAgent,
                  ...(Array.isArray(widget.orchestratorAgentIds)
                    ? (widget.orchestratorAgentIds as string[])
                    : []),
                ].filter((id) => /^[a-f0-9]{24}$/i.test(String(id))),
              ),
            });
            if (Array.isArray(widget.shortcuts)) {
              setShortcuts((widget.shortcuts as WidgetShortcut[]).map((s) => ({
                id: s.id || crypto.randomUUID(),
                label: s.label || '',
                message: s.message || '',
                emoji: s.emoji || '',
                enabled: s.enabled !== false,
              })));
            }
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

  async function suggestShortcuts() {
    const agentName = agents.find((a) => effectiveWidgetAgentId(a) === cfg.agentId)?.name ?? cfg.title ?? '';
    if (!agentName) return;
    setSuggestingShortcuts(true);
    setShortcutSuggestErr('');
    try {
      const resp = await fetch('/api/ai/suggest-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          agentPurpose: cfg.subtitle || cfg.title || agentName,
          faqCount: 3,
          rulesCount: 3,
        }),
      });
      const json = await resp.json() as {
        success?: boolean;
        data?: { faqs?: Array<{ question: string }>; rules?: Array<{ title: string; description: string }> };
        error?: { code?: string; userMessage?: string; message?: string };
      };

      if (!json.success) {
        const msg = json.error?.userMessage ?? json.error?.message ?? 'No se pudieron generar shortcuts. Intenta de nuevo.';
        setShortcutSuggestErr(msg);
        return;
      }
      if (!json.data) return;

      const suggested: WidgetShortcut[] = [
        ...(json.data.faqs ?? []).slice(0, 3).map((f) => ({
          id: crypto.randomUUID(), label: f.question, message: f.question, emoji: '❓', enabled: true,
        })),
        ...(json.data.rules ?? []).slice(0, 2).map((r) => ({
          id: crypto.randomUUID(), label: r.title, message: r.description, emoji: '⚡', enabled: true,
        })),
      ];
      setShortcuts((prev) => {
        const existingMessages = new Set(prev.map((s) => s.message));
        const newOnes = suggested.filter((s) => !existingMessages.has(s.message));
        return [...prev, ...newOnes].slice(0, 20);
      });
    } catch {
      setShortcutSuggestErr('Error de conexión. Intenta de nuevo.');
    } finally {
      setSuggestingShortcuts(false);
    }
  }

  function copySnippet() {
    const code = generateSnippet(cfg, snippetToken);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveWidget() {
    if (cfg.multiAgentEnabled && cfg.multiAgentMode === 'pipeline') {
      const check = validatePipelineConfig(cfg.pipelineConfig, selectedOrchestratorIds, (id) =>
        resolveAgentProfileByWidgetId(agents, id),
      );
      if (!check.ok) {
        toast.error(check.errors[0] ?? 'Configura el pipeline con dos pasos y agentes distintos');
        return;
      }
    }
    setSaving(true);
    try {
      if (editWidgetId) {
        const res = await fetch(`/api/widgets/${editWidgetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cfg, shortcuts }),
        });
        if (res.ok) {
          setSaved(true);
          toast.success('Widget actualizado');
          setTimeout(() => setSaved(false), 3000);
        } else {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? 'No se pudo guardar el widget');
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
          toast.success('Widget creado correctamente');
          setTimeout(() => setSaved(false), 3000);
        } else {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? 'No se pudo crear el widget');
        }
      }
    } catch {
      toast.error('Error de red al guardar');
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

      <div className="relative flex flex-col xl:flex-row gap-4 max-w-[1440px] mx-auto px-2 py-2 xl:items-start">
        {/* Formulario — columna principal */}
        <div className="w-full xl:flex-[1.45] xl:min-w-[min(100%,480px)] shrink-0 xl:max-h-[calc(100vh-5rem)] overflow-y-auto">
          <div className="card-texture rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--border)' }}>
            <div className="badge-primary mb-3 w-fit">Widget</div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight m-0 mb-1" data-tour="widget-builder-header">
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

        <WizardSteps
          steps={[...WIDGET_WIZARD_STEPS]}
          current={wizardStep}
          onStepClick={setWizardStep}
        />

        {wizardStep === 0 && (
        <>
        {/* Widget name */}
        <div style={fieldStyle} data-tour="widget-builder-name">
          <label style={labelStyle}>Nombre del widget</label>
          <input style={inputStyle} value={cfg.name} onChange={(e) => update({ name: e.target.value })} placeholder="Mi widget" />
        </div>

        {multiAgentEligible && (
          <div
            style={{
              marginBottom: 20,
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(99,102,241,0.25)',
              background: 'rgba(99,102,241,0.06)',
            }}
            data-tour="widget-builder-multi-agent"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <input
                type="checkbox"
                id="multiAgentEnabled"
                checked={cfg.multiAgentEnabled}
                onChange={(e) =>
                  update({
                    multiAgentEnabled: e.target.checked,
                    ...(e.target.checked
                      ? {}
                      : {
                          agentIds: [],
                          orchestratorAgentIds: [],
                          multiAgentMode: 'triage',
                          pipelineConfig: null,
                        }),
                  })
                }
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="multiAgentEnabled" style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Widget multiagente avanzado
              </label>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: 'rgba(99,102,241,0.15)',
                  color: '#6366f1',
                }}
              >
                Business · Enterprise
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
              {cfg.multiAgentEnabled
                ? 'Selecciona varios agentes en la grilla de abajo. Cada uno aporta su equipo al triaje.'
                : 'Sin activar esto, un solo agente en la grilla; sus sub-agentes se enrutan solos si existen.'}
            </p>
          </div>
        )}

        {/* Agent selector (widget.agentId = ObjectId landing; el hub resuelve por landingClientAgentId) */}
        <div style={fieldStyle} data-tour="widget-builder-agent">
          <label style={labelStyle}>
            {cfg.multiAgentEnabled ? 'Agentes orquestadores' : 'Agente'}
          </label>
          {cfg.multiAgentEnabled ? (
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 8px', lineHeight: 1.45 }}>
              Selecciona uno o más agentes. Cada uno aporta su equipo de sub-agentes al triaje.
            </p>
          ) : null}
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
                const selected = selectable && isOrchestratorSelected(agentIdForWidget);
                const icon = AGENT_ICONS[i % AGENT_ICONS.length];
                const short =
                  a.name.length > 14 ? `${a.name.slice(0, 12)}…` : a.name;
                const profile = agentProfileFromRow(a);
                const pipelineCreative =
                  cfg.multiAgentEnabled &&
                  cfg.multiAgentMode === 'pipeline' &&
                  selected &&
                  isCreativeCapableAgent(profile);
                const pipelineContent =
                  cfg.multiAgentEnabled &&
                  cfg.multiAgentMode === 'pipeline' &&
                  selected &&
                  isContentCapableAgent(profile);
                return (
                  <button
                    key={a._id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectable && toggleOrchestratorAgent(agentIdForWidget)}
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
                    {pipelineCreative || pipelineContent ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 3,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                          marginTop: 4,
                        }}
                      >
                        {pipelineContent ? (
                          <span
                            style={{
                              fontSize: 7,
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: 4,
                              background: 'rgba(59,130,246,0.15)',
                              color: 'rgb(37,99,235)',
                            }}
                          >
                            Contenido
                          </span>
                        ) : null}
                        {pipelineCreative ? (
                          <span
                            style={{
                              fontSize: 7,
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: 4,
                              background: 'rgba(168,85,247,0.15)',
                              color: 'rgb(126,34,206)',
                            }}
                          >
                            Creativo
                          </span>
                        ) : null}
                      </div>
                    ) : null}
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
          {!cfg.multiAgentEnabled && orchestratorSubs.length > 0 ? (
            <p
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground)',
                margin: '8px 0 0',
                lineHeight: 1.45,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(34,197,94,0.25)',
                background: 'rgba(34,197,94,0.06)',
              }}
            >
              Este agente tiene {orchestratorSubs.length} sub-agente{orchestratorSubs.length !== 1 ? 's' : ''}.
              El chat los usará automáticamente (triaje) sin activar el modo multiagente avanzado.
            </p>
          ) : null}
        </div>

        {multiAgentEligible && cfg.multiAgentEnabled && (
          <div
            style={{
              marginBottom: 20,
              padding: 14,
              borderRadius: 12,
              border: '1px solid rgba(99,102,241,0.25)',
              background: 'rgba(99,102,241,0.06)',
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {([
                ['triage', 'Triaje (rápido)', 'Deriva a un especialista y responde con una llamada.'],
                ['pipeline', 'Pipeline contenido→creativo', 'Primero datos del catálogo (vendedor), luego banner/imagen (creativo). Requiere 2+ agentes en la grilla.'],
                ['parallel', 'Paralelo + síntesis', 'Consulta orquestador y especialista en paralelo; una respuesta unificada.'],
              ] as const).map(([mode, label, hint]) => {
                const selected = cfg.multiAgentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (mode === 'pipeline') {
                        const resolve = (id: string) => resolveAgentProfileByWidgetId(agents, id);
                        const orchIds = selectedOrchestratorIds;
                        update({
                          multiAgentMode: mode,
                          pipelineConfig:
                            cfg.pipelineConfig ??
                            (orchIds.length >= 2
                              ? createDefaultPipelineConfig(orchIds, resolve)
                              : null),
                        });
                        return;
                      }
                      update({ multiAgentMode: mode, pipelineConfig: null });
                    }}
                    title={hint}
                    style={{
                      flex: '1 1 140px',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: selected ? '1px solid rgba(99,102,241,0.45)' : '1px solid var(--border)',
                      background: selected ? 'rgba(99,102,241,0.12)' : 'var(--background)',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3, lineHeight: 1.35 }}>
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>
            {cfg.multiAgentMode === 'pipeline' &&
            cfg.pipelineConfig &&
            orchestratorOptions.length >= 2 ? (
              <div style={{ marginBottom: 12 }}>
                <PipelineEditor
                  config={cfg.pipelineConfig}
                  orchestratorOptions={orchestratorOptions}
                  onChange={(pipelineConfig) => update({ pipelineConfig })}
                  resolveAgentProfile={(id) => resolveAgentProfileByWidgetId(agents, id)}
                />
              </div>
            ) : cfg.multiAgentMode === 'pipeline' && pipelineSetup ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(245,158,11,0.45)',
                  background: 'rgba(245,158,11,0.1)',
                }}
              >
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgb(180,83,9)' }}>
                  Selecciona al menos 2 agentes orquestadores para configurar el pipeline.
                </p>
                {pipelineSetup.warnings.length > 0 ? (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.45 }}>
                    {pipelineSetup.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {loadingSubs ? (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Cargando equipo…</p>
            ) : orchestratorSubs.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
                Ningún orquestador seleccionado tiene sub-agentes.{' '}
                <Link href={`/dashboard/agents/${cfg.agentId}`} className="font-semibold landing-link-accent">
                  Configura sub-agentes
                </Link>{' '}
                para activar el triaje.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 4px', color: 'var(--foreground)' }}>
                  Especialistas del equipo (opcional — vacío = todos los sub-agentes de cada orquestador)
                </p>
                {orchestratorSubs.map((sub) => {
                  const checked = cfg.agentIds.includes(sub._id);
                  return (
                    <label
                      key={sub._id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 12,
                        cursor: 'pointer',
                        padding: '6px 8px',
                        borderRadius: 8,
                        border: checked ? '1px solid rgba(99,102,241,0.35)' : '1px solid var(--border)',
                        background: checked ? 'rgba(99,102,241,0.08)' : 'var(--background)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeamAgent(sub._id)}
                        style={{ marginTop: 2, cursor: 'pointer' }}
                      />
                      <span>
                        <strong>{sub.name}</strong>
                        {sub.parentName ? (
                          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 6 }}>
                            · {sub.parentName}
                          </span>
                        ) : null}
                        {sub.description ? (
                          <span style={{ display: 'block', color: 'var(--muted-foreground)', marginTop: 2 }}>
                            {sub.description.slice(0, 120)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
        )}

        {wizardStep === 1 && (
        <>
        {/* Branding */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }} data-tour="widget-builder-branding">
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
        <div data-tour="widget-builder-chat-texts">
        <div style={fieldStyle}>
          <label style={labelStyle}>Título</label>
          <input style={inputStyle} value={cfg.title} onChange={(e) => update({ title: e.target.value })} placeholder="BotIvA Assistant" />
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
        </div>
        <div data-tour="widget-builder-look">
        <div style={fieldStyle}>
          <label style={labelStyle}>URL de avatar / orbe</label>
          <input style={inputStyle} value={cfg.avatar} onChange={(e) => update({ avatar: e.target.value })} placeholder="https://..." />
          <AvatarEditor
            currentUrl={cfg.avatar}
            agentContext={{ name: cfg.title, purpose: cfg.title }}
            onResult={(url) => update({ avatar: url })}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Border radius</label>
          <input style={inputStyle} value={cfg.borderRadius} onChange={(e) => update({ borderRadius: e.target.value })} placeholder="16px" />
        </div>
        </div>

        {/* Position grid */}
        <div style={fieldStyle} data-tour="widget-builder-position">
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
        </>
        )}

        {wizardStep === 2 && (
        <>
        <div style={fieldStyle} data-tour="widget-builder-support">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: cfg.humanSupportEnabled ? 10 : 0 }}>
            <button
              type="button"
              role="switch"
              aria-checked={cfg.humanSupportEnabled}
              onClick={() => update({ humanSupportEnabled: !cfg.humanSupportEnabled })}
              style={{
                position: 'relative', flexShrink: 0,
                width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0,
                background: cfg.humanSupportEnabled ? cfg.color : 'var(--border)',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: cfg.humanSupportEnabled ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <label
              style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => update({ humanSupportEnabled: !cfg.humanSupportEnabled })}
            >
              WhatsApp — atención humana
            </label>
          </div>
          {cfg.humanSupportEnabled && (
            <>
              <input
                style={inputStyle}
                value={cfg.humanSupportPhone ?? ''}
                onChange={(e) => update({ humanSupportPhone: e.target.value.slice(0, 48) })}
                placeholder="+52 55 1234 5678 (con código de país)"
              />
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 6, marginBottom: 0, lineHeight: 1.45 }}>
                Si el visitante escribe palabras como «persona», «humano» o «atención humana», aparece en el chat un acceso a WhatsApp (con número válido). Opcional.
              </p>
            </>
          )}
          {!cfg.humanSupportEnabled && (
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
              Desactivado: no se mostrarán enlaces a WhatsApp aunque el visitante pida atención humana.
            </p>
          )}
        </div>
        <div style={fieldStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: cfg.handoffEnabled ? 10 : 0 }}>
            <button
              type="button"
              role="switch"
              aria-checked={cfg.handoffEnabled}
              onClick={() => update({ handoffEnabled: !cfg.handoffEnabled })}
              style={{
                position: 'relative', flexShrink: 0,
                width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0,
                background: cfg.handoffEnabled ? cfg.color : 'var(--border)',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: cfg.handoffEnabled ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <label
              style={{ fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => update({ handoffEnabled: !cfg.handoffEnabled })}
            >
              Botón «Hablar con una persona»
            </label>
          </div>
          {cfg.handoffEnabled && (
            <>
              <label style={labelStyle}>Destino al escalar</label>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={cfg.handoffNotifyMode}
                onChange={(e) => update({ handoffNotifyMode: e.target.value as HandoffNotifyMode })}
              >
                {(Object.keys(HANDOFF_NOTIFY_MODE_LABELS) as HandoffNotifyMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {HANDOFF_NOTIFY_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 6, marginBottom: 0, lineHeight: 1.45 }}>
                El <strong>Inbox</strong> del panel siempre recibe la solicitud. Elige si además notificar por{' '}
                <Link href="/dashboard/compliance" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                  webhook saliente
                </Link>{' '}
                y/o Slack (configúralos en Cumplimiento).
              </p>
            </>
          )}
          {!cfg.handoffEnabled && (
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
              Desactivado: el visitante no verá el botón de escalación en el chat.
            </p>
          )}
        </div>
        <div data-tour="widget-builder-embed-options">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="checkbox" id="autoOpen" checked={cfg.autoOpen} onChange={(e) => update({ autoOpen: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="autoOpen" style={{ fontSize: '13px', cursor: 'pointer' }}>Abrir automáticamente</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              role="switch"
              aria-checked={cfg.voiceEnabled}
              onClick={() => update({ voiceEnabled: !cfg.voiceEnabled })}
              style={{
                position: 'relative', flexShrink: 0,
                width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0,
                background: cfg.voiceEnabled ? cfg.color : 'var(--border)',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: cfg.voiceEnabled ? 19 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
            <label
              style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => update({ voiceEnabled: !cfg.voiceEnabled })}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: cfg.voiceEnabled ? 1 : 0.4 }}>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              Lectura en voz alta
            </label>
          </div>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '0 0 18px', lineHeight: 1.5 }}>
          El código embed solo contiene el token. El color, título, avatar y demás ajustes se cargan en tiempo real desde el servidor — cualquier cambio aquí se refleja automáticamente en todos los sitios donde esté instalado el widget.
        </p>
        </div>

        {/* Shortcuts */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} style={{ color: '#6366f1' }} />
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6366f1' }}>
                Shortcuts del widget
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={suggestShortcuts} disabled={suggestingShortcuts || !cfg.agentId}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: 'none', background: cfg.agentId && !suggestingShortcuts ? 'rgba(99,102,241,0.1)' : 'var(--border)', color: cfg.agentId && !suggestingShortcuts ? '#6366f1' : 'var(--muted-foreground)', cursor: cfg.agentId && !suggestingShortcuts ? 'pointer' : 'not-allowed' }}>
                {suggestingShortcuts ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {suggestingShortcuts ? 'Generando...' : 'Sugerir con AI'}
              </button>
              <button type="button"
                onClick={() => setShortcuts((prev) => [...prev, { id: crypto.randomUUID(), label: '', message: '', emoji: '', enabled: true }])}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}>
                <Plus size={11} /> Agregar
              </button>
            </div>
          </div>
          {shortcutSuggestErr && (
            <p style={{ fontSize: 11, color: '#ef4444', margin: '0 0 8px', padding: '6px 10px', background: 'rgba(239,68,68,0.07)', borderRadius: 7, lineHeight: 1.4 }}>
              {shortcutSuggestErr}
            </p>
          )}
          {shortcuts.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
              Sin shortcuts. Agrega acciones rápidas que aparecerán como pills en el chat.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shortcuts.map((sc, i) => (
                <div key={sc.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--background)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <input value={sc.emoji} onChange={(e) => setShortcuts((p) => p.map((x, j) => j === i ? { ...x, emoji: e.target.value } : x))}
                      placeholder="🚀" style={{ width: 34, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, padding: '4px', fontSize: 14, background: 'var(--card)', flexShrink: 0 }} />
                    <input value={sc.label} onChange={(e) => setShortcuts((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Etiqueta" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--card)' }} />
                    <button type="button" onClick={() => setShortcuts((p) => p.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4, display: 'flex', flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <input value={sc.message} onChange={(e) => setShortcuts((p) => p.map((x, j) => j === i ? { ...x, message: e.target.value } : x))}
                    placeholder="Mensaje que se envía al hacer clic" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, background: 'var(--card)' }} />
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {wizardStep < 3 && (
          <div className="flex gap-2 mt-2 mb-4">
            {wizardStep > 0 && (
              <button
                type="button"
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="flex-1 py-2.5 rounded-xl font-bold text-[13px] border"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              >
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={goNextStep}
              className="flex-1 py-2.5 rounded-xl font-bold text-[13px] text-white border-0"
              style={{ background: BRAND_R }}
            >
              Siguiente
            </button>
          </div>
        )}

        {wizardStep === 3 && (
        <>
        <p className="text-sm m-0 mb-4" style={{ color: 'var(--muted-foreground)' }}>
          Guarda el widget y copia el snippet para pegarlo antes de <code>&lt;/body&gt;</code> en tu sitio.
        </p>
        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copySnippet}
            data-tour="widget-builder-copy"
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
            data-tour="widget-builder-save"
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-[13px] text-white border-0 transition-all hover:opacity-95 disabled:opacity-60"
            style={{
              background: saved ? '#22c55e' : BRAND_R,
              boxShadow: saved ? undefined : '0 4px 18px rgba(var(--brand-primary-rgb),0.28)',
              cursor: saving || loadingInitial ? 'not-allowed' : 'pointer',
            }}
          >
            <Save size={14} />
            {saving ? 'Guardando...' : saved ? 'Guardado!' : editWidgetId ? 'Guardar cambios' : 'Guardar widget'}
          </button>
        </div>
        </>
        )}
          </div>
        </div>

      {/* Vista previa + embed (secundario) */}
      <div className="w-full xl:flex-[0.55] xl:max-w-[380px] shrink-0 flex flex-col gap-3 xl:sticky xl:top-4">
        <div data-tour="widget-builder-preview">
          <p className="text-[10px] font-bold uppercase tracking-widest m-0 mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
            Vista previa
          </p>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
            <MockPreview cfg={cfg} shortcuts={shortcuts} />
          </div>
        </div>

        {wizardStep === 3 && (
        <div
          className="rounded-xl overflow-hidden border flex flex-col"
          style={{ borderColor: 'var(--border)', background: '#0d1117', maxHeight: 'min(42vh, 360px)' }}
          data-tour="widget-builder-snippet-panel"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#161b22' }}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ background: '#ff5f57' }} />
                <div className="w-2 h-2 rounded-full" style={{ background: '#febc2e' }} />
                <div className="w-2 h-2 rounded-full" style={{ background: '#28c840' }} />
              </div>
              <span className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
                Código embed
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={copySnippet}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border-0 cursor-pointer transition-all"
                style={{
                  background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                  color: copied ? '#4ade80' : '#94a3b8',
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href="/widget"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold no-underline"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}
              >
                <ExternalLink size={10} />
                Docs
              </a>
            </div>
          </div>

          {snippetToken !== 'YOUR_TOKEN' && (
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(99,102,241,0.07)' }}>
              <span className="text-[9px] font-semibold uppercase tracking-widest shrink-0" style={{ color: '#818cf8' }}>Token</span>
              <code className="text-[10px] font-mono flex-1 truncate" style={{ color: '#c7d2fe' }}>{snippetToken}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(snippetToken); }}
                className="shrink-0 border-0 cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8' }}
              >
                Copiar
              </button>
            </div>
          )}

          <pre className="p-3 text-[10px] overflow-auto m-0 flex-1 min-h-[80px]" style={{ color: '#e2e8f0', lineHeight: 1.6, fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace", tabSize: 2 }}>
            {generateSnippet(cfg, snippetToken)}
          </pre>

          <div className="px-3 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#161b22' }}>
            <span style={{ fontSize: 9, color: '#4b5563' }}>
              Pega antes de &lt;/body&gt;. El token basta — el resto se carga del servidor.
            </span>
          </div>
        </div>
        )}
      </div>
      </div>
    </div>
  );
}

