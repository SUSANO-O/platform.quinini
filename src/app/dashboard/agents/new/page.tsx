'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { McpAvailablePanel } from '@/components/mcp/mcp-available-panel';
import { McpConnectModal } from '@/components/mcp/mcp-connect-modal';
import type { McpCatalogRow } from '@/lib/mcp-catalog-types';
import { Bot, ChevronLeft, Loader2, KeyRound, Plug, X, Sparkles } from 'lucide-react';
import { AIInputButton } from '@/components/ui/AIInputButton';
import Link from 'next/link';

const R = '#e41414';
const O = '#f87600';
const B = '#00acf8';

const BTN_PRIMARY: CSSProperties = {
  background: `linear-gradient(135deg, ${R}, ${O})`,
  color: '#fff',
  border: 'none',
  boxShadow: '0 4px 18px rgba(228,20,20,0.28)',
};

/** Oculto en UI por ahora; al poner `true` vuelve el bloque «agente de plataforma» (solo admins). */
const SHOW_PLATFORM_CATALOG_AGENT_UI = false;

function FormSection({
  children,
  bar = 'rb' as 'rb' | 'bo',
}: {
  children: ReactNode;
  bar?: 'rb' | 'bo';
}) {
  const barBg =
    bar === 'bo' ? `linear-gradient(90deg, ${B}, ${O})` : `linear-gradient(90deg, ${R}, ${B})`;
  return (
    <div
      className="rounded-2xl overflow-hidden border mb-4 card-texture card-hover"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="h-[3px]" style={{ background: barBg }} />
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function NewAgentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { subscription } = useSubscription();
  const plan = subscription?.plan ?? 'free';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [widgetPublicToken, setWidgetPublicToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPlatform, setIsPlatform] = useState(false);
  const [strictPurposeOnly, setStrictPurposeOnly] = useState(true);
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [showAllModels, setShowAllModels] = useState(false);
  /** Tras crear el agente, abrir modal de MCP en la ficha con esta integración. */
  const [pendingMcp, setPendingMcp] = useState<{ key: string; name: string } | null>(null);

  // ── AI Suggestions ────────────────────────────────────────────────────────
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    systemPrompt: string;
    faqs: Array<{ question: string; answer: string }>;
    rules: Array<{ title: string; description: string }>;
  } | null>(null);
  const [suggestFaqsAdded, setSuggestFaqsAdded] = useState<Set<number>>(new Set());
  const [suggestRulesAdded, setSuggestRulesAdded] = useState<Set<number>>(new Set());
  const [pendingFaqs, setPendingFaqs] = useState<Array<{ question: string; answer: string }>>([]);
  const [pendingRules, setPendingRules] = useState<Array<{ title: string; description: string }>>([]);

  async function handleSuggestAgent() {
    if (!name.trim()) return;
    setAiSuggesting(true);
    setAiSuggestions(null);
    setSuggestFaqsAdded(new Set());
    setSuggestRulesAdded(new Set());
    try {
      const resp = await fetch('/api/ai/suggest-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: name.trim(), agentPurpose: description.trim() || name.trim() }),
      });
      const json = await resp.json() as { success?: boolean; data?: typeof aiSuggestions; error?: string };
      if (!resp.ok || !json.success) throw new Error(json.error ?? 'Error al generar sugerencias');
      setAiSuggestions(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar sugerencias');
    } finally {
      setAiSuggesting(false);
    }
  }
  const [mcpInfoModal, setMcpInfoModal] = useState<McpCatalogRow | null>(null);
  const { models: clientModels, hubError: modelsHubError } = useClientModels(plan);
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return clientModels;
    return clientModels.filter((m) =>
      `${m.name} ${m.id} ${m.provider} ${m.description ?? ''}`.toLowerCase().includes(q)
    );
  }, [clientModels, modelQuery]);
  const orderedFilteredModels = useMemo(() => {
    const selectedIndex = filteredModels.findIndex((m) => m.id === model);
    if (selectedIndex <= 0) return filteredModels;
    const selectedModel = filteredModels[selectedIndex];
    return [selectedModel, ...filteredModels.slice(0, selectedIndex), ...filteredModels.slice(selectedIndex + 1)];
  }, [filteredModels, model]);
  const visibleModels = showAllModels ? orderedFilteredModels : orderedFilteredModels.slice(0, 12);

  const hubUiBase = (process.env.NEXT_PUBLIC_AGENTFLOWHUB_URL || 'http://127.0.0.1:9010').replace(
    /\/$/,
    '',
  );

  const inp: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const sectionTitle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '14px',
  };

  function generatePublicToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setWidgetPublicToken(`afhub_pub_${hex}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es requerido.');
      return;
    }
    if (!systemPrompt.trim()) {
      setError('El system prompt es requerido.');
      return;
    }
    setLoading(true);

    const payload: Record<string, unknown> = {
      name,
      description,
      systemPrompt,
      model,
      type: 'agent',
      tools: [],
      ...(isAdmin && isPlatform ? { isPlatform: true } : {}),
      strictPurposeOnly,
      ...(pendingFaqs.length > 0 ? { agentFaqs: pendingFaqs.map((f, i) => ({ id: `faq_${i}`, question: f.question, answer: f.answer, enabled: true, priority: i * 10 })) } : {}),
      ...(pendingRules.length > 0 ? { behaviorRules: pendingRules.map((r, i) => ({ id: `rule_${i}`, title: r.title, interpretedRule: r.description, enabled: true, priority: i * 10 })) } : {}),
      ...(widgetPublicToken.trim()
        ? { widgetPublicToken: widgetPublicToken.trim().slice(0, 512) }
        : {}),
    };
    const t = inferenceTemperature.trim();
    if (t !== '') {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 2) {
        setError('Temperatura: usa un número entre 0 y 2 o deja vacío.');
        setLoading(false);
        return;
      }
      payload.inferenceTemperature = n;
    }
    const mx = inferenceMaxTokens.trim();
    if (mx !== '') {
      const n = parseInt(mx, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError('Max tokens salida: entero ≥ 1 o vacío.');
        setLoading(false);
        return;
      }
      payload.inferenceMaxTokens = n;
    }

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Error al crear el agente.');
      return;
    }
    const qs = pendingMcp ? `?openMcp=${encodeURIComponent(pendingMcp.key)}` : '';
    router.push(`/dashboard/agents/${data.agent._id}${qs}`);
  }

  return (
    <div className="relative overflow-hidden" style={{ minHeight: '100%' }}>
      <div className="hero-glow pointer-events-none" style={{ background: R, top: '-200px', right: '-60px' }} />
      <div className="hero-glow pointer-events-none" style={{ background: B, top: '120px', left: '-120px' }} />

      <div className="relative px-6 py-10 max-w-3xl mx-auto">
        {mcpInfoModal && (
          <McpConnectModal
            open
            title={`Conectar ${mcpInfoModal.name}`}
            onClose={() => setMcpInfoModal(null)}
          >
            <p
              className="text-[13px] leading-relaxed m-0 mb-3.5"
              style={{ color: 'var(--foreground)' }}
            >
              Las credenciales MCP se guardan <strong>por agente</strong>. Completa el formulario de arriba y pulsa{' '}
              <strong>Crear agente</strong>: te llevaremos a la ficha y se abrirá el formulario de conexión para{' '}
              <strong>{mcpInfoModal.name}</strong> (podrás introducir usuario, tokens, etc.).
            </p>
            <p
              className="text-xs m-0 mb-4 leading-snug"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Puedes cerrar este aviso; seguirá recordado hasta que crees el agente o pulses quitar en la barra inferior.
            </p>
            <button
              type="button"
              onClick={() => setMcpInfoModal(null)}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-opacity hover:opacity-90"
              style={BTN_PRIMARY}
            >
              Entendido
            </button>
          </McpConnectModal>
        )}

        <Link
          href="/dashboard/agents"
          className="landing-link-accent inline-flex items-center gap-1 text-xs no-underline mb-4 font-semibold"
        >
          <ChevronLeft size={14} /> Mis agentes
        </Link>

        <div className="badge-primary mb-4 w-fit">
          <Sparkles size={13} />
          Nuevo agente
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
              style={{ background: `${R}14`, borderColor: `${R}33` }}
            >
              <Bot size={22} style={{ color: R }} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight m-0">
                Crear <span className="gradient-text">agente</span>
              </h1>
              <p className="text-sm m-0 mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                Define modelo, instrucciones y opciones de widget; luego podrás afinar RAG y herramientas en la ficha.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-0">
          {pendingMcp && (
            <div
              className="flex items-center gap-2.5 flex-wrap px-3.5 py-2.5 rounded-xl border mb-4 text-xs"
              style={{
                borderColor: `${R}35`,
                background: `${R}0a`,
                color: 'var(--foreground)',
              }}
            >
              <span className="font-bold">MCP:</span>
              <span>
                Tras crear el agente se abrirá la conexión para <strong>{pendingMcp.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setPendingMcp(null)}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors card-hover"
                style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
              >
                <X size={12} /> Quitar
              </button>
            </div>
          )}

          {SHOW_PLATFORM_CATALOG_AGENT_UI ? (
            <FormSection bar="bo">
              <h2 style={sectionTitle}>Catálogo hub · agente de plataforma</h2>
              <label
                className="flex items-start gap-2.5 rounded-xl border p-3.5 cursor-pointer transition-colors card-hover"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  opacity: isAdmin ? 1 : 0.92,
                  cursor: isAdmin ? 'pointer' : 'not-allowed',
                }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={isAdmin && isPlatform}
                  disabled={!isAdmin}
                  onChange={(e) => {
                    if (!isAdmin) return;
                    setIsPlatform(e.target.checked);
                  }}
                />
                <span className="text-xs leading-relaxed">
                  <strong style={{ color: 'var(--foreground)' }}>
                    Publicar como agente de plataforma en el catálogo
                  </strong>
                  <br />
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    Visible para todos los usuarios autenticados, sincronizado con AIBackHub como el resto de agentes, y no consume el cupo de agentes del plan. Solo cuentas con rol{' '}
                    <strong>administrador</strong> pueden activar esta opción.
                  </span>
                  {!isAdmin && (
                    <span className="block mt-2 text-[11px]" style={{ color: '#d97706' }}>
                      Tu cuenta no tiene rol admin: no verás el check activo hasta que un administrador te lo asigne en la base de datos (o uses una cuenta admin).
                    </span>
                  )}
                </span>
              </label>
            </FormSection>
          ) : null}

          <FormSection>
            <h2 style={sectionTitle}>Información básica</h2>
            <div className="flex flex-col gap-3" data-tour="agent-name">
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Nombre del agente <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="landing-input"
                    style={{ ...inp, paddingRight: '36px' }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Agente de soporte al cliente"
                    required
                  />
                  <AIInputButton
                    fieldType="agent_name"
                    fieldName="Nombre del agente"
                    agentContext={{ purpose: description }}
                    onResult={(text) => setName(text)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Descripción{' '}
                  <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(opcional)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="landing-input"
                    style={{ ...inp, paddingRight: '36px' }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Breve descripción de qué hace este agente"
                  />
                  <AIInputButton
                    fieldType="agent_description"
                    fieldName="Descripción del agente"
                    agentContext={{ name, purpose: description }}
                    onResult={(text) => setDescription(text)}
                  />
                </div>
              </div>
            </div>
          </FormSection>

          {/* ── Panel sugerencias AI ──────────────────────────────────────── */}
          <FormSection bar="bo">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiSuggestions ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={14} style={{ color: '#6366f1' }} />
                <h2 style={{ ...sectionTitle, marginBottom: 0, color: '#6366f1' }}>Sugerir con AI</h2>
              </div>
              <button
                type="button"
                onClick={handleSuggestAgent}
                disabled={!name.trim() || aiSuggesting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 10, border: 'none',
                  background: name.trim() && !aiSuggesting ? '#6366f1' : 'var(--border)',
                  color: name.trim() && !aiSuggesting ? '#fff' : 'var(--muted-foreground)',
                  fontSize: 12, fontWeight: 600,
                  cursor: name.trim() && !aiSuggesting ? 'pointer' : 'not-allowed',
                }}
              >
                {aiSuggesting
                  ? <><Loader2 size={12} className="animate-spin" /> Generando...</>
                  : <><Sparkles size={12} /> Generar sugerencias</>}
              </button>
            </div>
            {!name.trim() && !aiSuggestions && (
              <p className="text-xs m-0" style={{ color: 'var(--muted-foreground)' }}>
                Llena el nombre del agente para activar las sugerencias de system prompt, FAQs y reglas.
              </p>
            )}
            {aiSuggestions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* System Prompt sugerido */}
                <div style={{ padding: '12px 14px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>System Prompt sugerido</span>
                    <button
                      type="button"
                      onClick={() => setSystemPrompt(aiSuggestions.systemPrompt)}
                      style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                    >
                      Aplicar
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                    {aiSuggestions.systemPrompt}
                  </p>
                </div>

                {/* FAQs sugeridas */}
                {aiSuggestions.faqs.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>FAQs sugeridas</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingFaqs(aiSuggestions.faqs);
                          setSuggestFaqsAdded(new Set(aiSuggestions.faqs.map((_, i) => i)));
                        }}
                        style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        Agregar todas
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {aiSuggestions.faqs.map((faq, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 3px', color: 'var(--foreground)' }}>{faq.question}</p>
                            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 }}>{faq.answer}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!suggestFaqsAdded.has(i)) {
                                setPendingFaqs((prev) => [...prev, faq]);
                                setSuggestFaqsAdded((prev) => new Set([...prev, i]));
                              }
                            }}
                            disabled={suggestFaqsAdded.has(i)}
                            style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: suggestFaqsAdded.has(i) ? '#22c55e' : '#6366f1', background: suggestFaqsAdded.has(i) ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: suggestFaqsAdded.has(i) ? 'default' : 'pointer' }}
                          >
                            {suggestFaqsAdded.has(i) ? '✓ Agregada' : '+ Agregar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reglas sugeridas */}
                {aiSuggestions.rules.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>Reglas sugeridas</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingRules(aiSuggestions.rules);
                          setSuggestRulesAdded(new Set(aiSuggestions.rules.map((_, i) => i)));
                        }}
                        style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        Agregar todas
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {aiSuggestions.rules.map((rule, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 3px', color: 'var(--foreground)' }}>{rule.title}</p>
                            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 }}>{rule.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!suggestRulesAdded.has(i)) {
                                setPendingRules((prev) => [...prev, rule]);
                                setSuggestRulesAdded((prev) => new Set([...prev, i]));
                              }
                            }}
                            disabled={suggestRulesAdded.has(i)}
                            style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: suggestRulesAdded.has(i) ? '#22c55e' : '#6366f1', background: suggestRulesAdded.has(i) ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)', border: 'none', padding: '4px 10px', borderRadius: 7, cursor: suggestRulesAdded.has(i) ? 'default' : 'pointer' }}
                          >
                            {suggestRulesAdded.has(i) ? '✓ Agregada' : '+ Agregar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(pendingFaqs.length > 0 || pendingRules.length > 0) && (
                  <p style={{ fontSize: 11, color: '#22c55e', margin: 0 }}>
                    ✓ {pendingFaqs.length} FAQ{pendingFaqs.length !== 1 ? 's' : ''} y {pendingRules.length} regla{pendingRules.length !== 1 ? 's' : ''} se guardarán al crear el agente.
                  </p>
                )}
              </div>
            )}
          </FormSection>

          <FormSection>
            <h2 style={sectionTitle}>Modelo de IA</h2>
            <div data-tour="agent-model">
            {modelsHubError && (
              <p className="text-xs mb-3 leading-relaxed m-0" style={{ color: '#d97706' }}>
                {modelsHubError} Se muestran modelos de respaldo; revisa severback esté en marcha.
              </p>
            )}
            <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] font-semibold m-0" style={{ color: 'var(--muted-foreground)' }}>
                  Selecciona un modelo (busca por nombre, proveedor o capacidad)
                </p>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--muted-foreground)' }}>
                  {filteredModels.length} resultados
                </span>
              </div>
              <input
                className="landing-input"
                style={inp}
                value={modelQuery}
                onChange={(e) => {
                  setModelQuery(e.target.value);
                  setShowAllModels(false);
                }}
                placeholder="Buscar modelo..."
              />
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
              {visibleModels.map((m) => {
                const selected = model === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className="text-left rounded-xl p-3 cursor-pointer transition-all border"
                    style={{
                      borderColor: selected ? `${R}55` : 'var(--border)',
                      background: selected ? `${R}0d` : 'transparent',
                      boxShadow: selected ? `0 0 0 1px ${R}22` : undefined,
                    }}
                  >
                    <p
                      className="text-xs font-bold m-0 mb-0.5"
                      style={{ color: selected ? R : 'var(--foreground)' }}
                    >
                      {m.name}
                      {m.deprecated ? (
                        <span className="text-[10px] ml-1.5" style={{ color: '#d97706' }}>
                          (deprecado)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] m-0" style={{ color: 'var(--muted-foreground)' }}>
                      {m.provider}
                      {m.badge ? ` · ${m.badge}` : ''}
                      {m.maxTokens != null ? ` · hasta ${m.maxTokens.toLocaleString()} ctx` : ''}
                    </p>
                    {m.description ? (
                      <p
                        className="text-[10px] m-0 mt-1.5 leading-snug"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        {m.description}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {filteredModels.length > 12 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowAllModels((v) => !v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  {showAllModels ? 'Ver menos modelos' : `Ver todos (${filteredModels.length})`}
                </button>
              </div>
            )}
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              <div>
                <label
                  className="block text-[11px] font-semibold mb-1.5"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Temperatura (opcional, 0–2)
                </label>
                <input
                  className="landing-input"
                  style={inp}
                  value={inferenceTemperature}
                  onChange={(e) => setInferenceTemperature(e.target.value)}
                  placeholder="Vacío = catálogo"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label
                  className="block text-[11px] font-semibold mb-1.5"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Max tokens salida (opcional)
                </label>
                <input
                  className="landing-input"
                  style={inp}
                  value={inferenceMaxTokens}
                  onChange={(e) => setInferenceMaxTokens(e.target.value)}
                  placeholder="Vacío = catálogo"
                  inputMode="numeric"
                />
              </div>
            </div>
            </div>
          </FormSection>

          <FormSection>
            <h2
              style={{ ...sectionTitle, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <KeyRound size={14} style={{ opacity: 0.85 }} />
              Token público del widget{' '}
              <span
                style={{
                  color: 'var(--muted-foreground)',
                  fontWeight: 400,
                  textTransform: 'none',
                  letterSpacing: 'normal',
                }}
              >
                (opcional)
              </span>
            </h2>
            <p className="text-xs m-0 mb-3 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Si lo defines, queda guardado en el catálogo (AIBackHub) como en AgentFlowHub. El SDK debe enviar el mismo valor en{' '}
              <code className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--muted)' }}>
                token
              </code>{' '}
              y la API lo valida con la cabecera{' '}
              <code className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--muted)' }}>
                X-Widget-Token
              </code>
              . Si solo usas <strong>Mis widgets</strong> con un token <code className="text-[11px]">wt_…</code>, puedes dejarlo vacío.
            </p>
            <div className="flex gap-2 flex-wrap items-stretch">
              <input
                className="landing-input min-w-0 flex-[1_1_220px]"
                style={{ ...inp, flex: '1 1 220px', minWidth: 0 }}
                value={widgetPublicToken}
                onChange={(e) => setWidgetPublicToken(e.target.value)}
                placeholder="Ej: afhub_pub_… o el que uses en AgentFlowHub"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={generatePublicToken}
                className="px-3.5 py-2.5 rounded-xl font-semibold text-xs border cursor-pointer whitespace-nowrap transition-colors card-hover"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              >
                Generar token
              </button>
            </div>
          </FormSection>

          <FormSection>
            <h2 style={{ ...sectionTitle, marginBottom: '4px' }}>
              System prompt <span style={{ color: '#ef4444' }}>*</span>
            </h2>
            <p className="text-xs m-0 mb-3" style={{ color: 'var(--muted-foreground)' }}>
              Define el comportamiento y personalidad de tu agente.
            </p>
            <div style={{ position: 'relative' }}>
              <textarea
                className="landing-input"
                style={{ ...inp, minHeight: '140px', resize: 'vertical', fontFamily: 'inherit', paddingRight: '36px' }}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={`Eres un asistente de soporte de Acme Corp. Tu misión es ayudar a los clientes con sus dudas de forma amable y precisa. Siempre responde en español. Cuando no sepas algo, dilo claramente y ofrece escalar al equipo humano.`}
                required
              />
              <AIInputButton
                fieldType="system_prompt"
                fieldName="System Prompt"
                agentContext={{ name, purpose: description }}
                onResult={(text) => setSystemPrompt(text)}
                position="right-top"
              />
            </div>
          </FormSection>

          <FormSection>
            <h2 style={sectionTitle}>Solo propósito</h2>
            <p className="text-xs m-0 mb-3 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              Limita las respuestas del agente a su rol y a lo que permitan herramientas, skills y RAG. Rechaza temas ajenos (por ejemplo un agente de ventas no responde recetas de cocina).
            </p>
            <label
              className="flex items-start gap-2.5 rounded-xl border p-3.5 cursor-pointer transition-colors card-hover"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
            >
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={strictPurposeOnly}
                onChange={(e) => setStrictPurposeOnly(e.target.checked)}
              />
              <span className="text-xs leading-relaxed">
                <strong style={{ color: 'var(--foreground)' }}>Activar modo solo propósito</strong>
                <br />
                <span style={{ color: 'var(--muted-foreground)' }}>
                  Se aplica en AIBackHub al generar respuestas del widget. Puedes cambiarlo después en la ficha del agente.
                </span>
              </span>
            </label>
          </FormSection>

          <FormSection bar="bo">
            <div className="flex items-center gap-2 mb-2.5">
              <Plug size={16} style={{ color: B, flexShrink: 0 }} />
              <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Integraciones MCP (proximamente)</h2>
            </div>
            <div className="text-xs mb-3.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              <p className="m-0 mb-2.5">
                <strong style={{ color: 'var(--foreground)' }}>Pulsa una integración</strong> para indicar que quieres conectarla después de crear el agente (se abrirá un aviso y el formulario de credenciales en la ficha). El catálogo viene de AIBackHub (
                <code className="text-[11px]">BACKEND_URL</code> → <code className="text-[11px]">/api/mcp/catalog</code>
                ).
              </p>
              <p className="m-0 mb-2 font-bold text-[11px]" style={{ color: 'var(--foreground)' }}>
                Cómo conectar MCP a este agente (credenciales por agente)
              </p>
              <ol className="m-0 pl-[18px]">
                <li className="mb-1.5">
                  (Opcional) Elige una integración abajo y luego pulsa <strong>Crear agente</strong>. Tras el sync con el hub tendrás{' '}
                  <code className="text-[11px]">agentHubId</code> y el modal de credenciales.
                </li>
                <li>
                  En la ficha → <strong>Herramientas</strong> marca qué tools MCP usa el agente (y el widget) y guarda.
                </li>
              </ol>
            </div>
            <McpAvailablePanel
              compact
              onConnectRequest={(row) => {
                setPendingMcp({ key: row.key, name: row.name });
                setMcpInfoModal(row);
              }}
            />
          </FormSection>

          {error && (
            <div
              className="px-4 py-3 rounded-xl text-sm mb-4 border"
              style={{
                background: 'rgba(239,68,68,0.08)',
                borderColor: 'rgba(239,68,68,0.22)',
                color: '#ef4444',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              data-tour="agent-create-submit"
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
              style={BTN_PRIMARY}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Bot size={16} strokeWidth={2} />
              )}
              {loading ? 'Creando agente...' : 'Crear agente'}
            </button>
            <Link
              href="/dashboard/agents"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-semibold text-sm border no-underline transition-colors card-hover"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
