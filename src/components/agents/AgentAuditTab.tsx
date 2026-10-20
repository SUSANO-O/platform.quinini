'use client';

/**
 * Tab "Auditoría" del builder de agente (Team+).
 * Lanza una auditoría con Gemini 4 Argon (/api/agents/[id]/audit), muestra el informe y deja
 * aplicar cada propuesta por separado. Nada se aplica solo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Stethoscope, Loader2, AlertTriangle, CheckCircle2, Sparkles, HelpCircle, Wrench, Undo2 } from '@/components/ui/icons';

type Severity = 'alta' | 'media' | 'baja';
type Finding = {
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  evidence: Array<{ conversationId: string; quote: string }>;
  recommendation: string;
};
type Report = {
  summary: string;
  score: number;
  findings: Finding[];
  suggestedFaqs: Array<{ question: string; answer: string; reason: string }>;
  suggestedRules: Array<{ title: string; description: string; reason: string }>;
  toolChanges: Array<{ toolId: string; action: 'quitar' | 'añadir'; reason: string }>;
  proposedSystemPrompt: string | null;
  promptChangeSummary: string[];
};
type Applied = { kind: string; index: number; undone?: boolean };
type Audit = {
  id: string;
  status: 'running' | 'done' | 'error';
  report: Report | null;
  error?: string;
  conversationsCount?: number;
  createdAt: string;
  finishedAt?: string | null;
  applied?: Applied[];
};

const SEVERITY: Record<Severity, { label: string; color: string; bg: string }> = {
  alta: { label: 'Alta', color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  media: { label: 'Media', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  baja: { label: 'Baja', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};
const CATEGORY: Record<string, string> = {
  faq_faltante: 'FAQ que falta',
  regla_incumplida: 'Regla incumplida',
  prompt: 'Prompt',
  tools: 'Herramientas',
  seguridad: 'Seguridad',
  tono: 'Tono',
  otro: 'Otro',
};

const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', background: 'var(--card, transparent)' };
const muted: React.CSSProperties = { color: 'var(--muted-foreground)', fontSize: 12 };
const btn: React.CSSProperties = { background: 'var(--brand-primary, #0d9488)', color: '#fff' };

function scoreColor(n: number) {
  return n >= 80 ? '#16a34a' : n >= 60 ? '#d97706' : '#dc2626';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
  } catch {
    return iso;
  }
}

export default function AgentAuditTab({ agentId, readOnly, onApplied }: { agentId: string; readOnly?: boolean; onApplied?: () => void }) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [access, setAccess] = useState<{ hasAccess: boolean; minPlanLabel: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showPrompt, setShowPrompt] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/audit`, { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la auditoría.');
      setAudit(data.audit);
      setAccess(data.access);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mientras corre, consultar cada 5 s.
  useEffect(() => {
    if (audit?.status !== 'running') return;
    pollRef.current = window.setInterval(() => void load(), 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [audit?.status, load]);

  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/audit`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la auditoría.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const apply = async (kind: string, index: number, extra: Record<string, string> = {}) => {
    if (!audit) return;
    const key = `${kind}:${index}`;
    setBusy(key);
    setError('');
    try {
      const res = await fetch(`/api/agents/${agentId}/audit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ auditId: audit.id, kind, index, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo aplicar.');
      await load();
      onApplied?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const isApplied = (kind: string, index: number) =>
    Boolean(audit?.applied?.some((a) => a.kind === kind && a.index === index && !a.undone));

  const draft = (key: string, fallback: string) => drafts[key] ?? fallback;
  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }));

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <p className="font-bold m-0 mb-0.5 flex items-center gap-1.5">
          <Stethoscope size={15} /> Auditoría del agente
        </p>
        <p style={{ ...muted, margin: 0 }}>
          La IA revisa el prompt, las FAQ, las reglas, las herramientas y las conversaciones reales (últimos 90 días, con emails y teléfonos ocultos) y propone cambios. Tú decides cuáles aplicar.
        </p>
      </div>
      {!readOnly && access?.hasAccess && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting || audit?.status === 'running'}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs"
          style={{ ...btn, opacity: starting || audit?.status === 'running' ? 0.6 : 1, cursor: starting || audit?.status === 'running' ? 'default' : 'pointer' }}
        >
          {starting || audit?.status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Stethoscope size={13} />}
          {audit ? 'Auditar de nuevo' : 'Auditar agente'}
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <>
        {header}
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          <Loader2 size={15} className="animate-spin" /> Cargando…
        </div>
      </>
    );
  }

  if (access && !access.hasAccess) {
    return (
      <>
        {header}
        <div style={{ textAlign: 'center', padding: '36px 20px', border: '1px solid var(--border)', borderRadius: 14, background: 'rgba(13,148,136,0.04)' }}>
          <Stethoscope size={30} style={{ color: 'var(--brand-primary, #0d9488)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Auditoría de agentes — disponible desde el plan {access.minPlanLabel}</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
            Detecta preguntas que tu agente no sabe responder, reglas que no cumple y riesgos en sus herramientas, a partir de conversaciones reales.
          </p>
          <Link href="/dashboard" className="landing-btn-primary !inline-flex !w-auto no-underline text-sm px-5 py-2 rounded-xl">
            Ver planes →
          </Link>
        </div>
      </>
    );
  }

  const r = audit?.status === 'done' ? audit.report : null;

  return (
    <>
      {header}

      {error && (
        <div className="mb-3 text-sm flex items-center gap-1.5" style={{ color: '#ef4444' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {!audit && (
        <div style={{ textAlign: 'center', padding: '36px 20px', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <Stethoscope size={28} style={{ color: 'var(--muted-foreground)', margin: '0 auto 10px' }} />
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Aún no has auditado este agente</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Tarda alrededor de un minuto. Puedes seguir trabajando mientras tanto.</p>
        </div>
      )}

      {audit?.status === 'running' && (
        <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--brand-primary, #0d9488)' }} />
          <div>
            <p className="font-bold m-0 text-sm">Auditando {audit.conversationsCount ? `${audit.conversationsCount} conversaciones` : 'la configuración'}…</p>
            <p style={{ ...muted, margin: 0 }}>Suele tardar alrededor de un minuto. Puedes salir de esta pestaña; el informe quedará guardado.</p>
          </div>
        </div>
      )}

      {audit?.status === 'error' && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.4)' }} className="text-sm">
          <AlertTriangle size={14} style={{ color: '#ef4444', display: 'inline', marginRight: 6 }} />
          {audit.error || 'La auditoría falló.'}
        </div>
      )}

      {r && (
        <div className="flex flex-col gap-4">
          <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: scoreColor(r.score), lineHeight: 1 }}>{r.score}</div>
              <div style={muted}>de 100</div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p className="text-sm m-0 mb-1.5" style={{ lineHeight: 1.5 }}>{r.summary}</p>
              <p style={{ ...muted, margin: 0 }}>
                {fmtDate(audit?.finishedAt || audit?.createdAt)} · {audit?.conversationsCount ?? 0} conversaciones revisadas
              </p>
            </div>
          </div>

          {r.findings.length > 0 && (
            <section>
              <p className="font-bold text-sm mb-2">Hallazgos ({r.findings.length})</p>
              <div className="flex flex-col gap-2">
                {r.findings.map((f, i) => (
                  <details key={i} style={card} open={i < 3}>
                    <summary className="text-sm font-bold" style={{ cursor: 'pointer', listStyle: 'revert' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, marginRight: 8, color: SEVERITY[f.severity].color, background: SEVERITY[f.severity].bg }}>
                        {SEVERITY[f.severity].label}
                      </span>
                      {f.title}
                      <span style={{ ...muted, fontWeight: 400, marginLeft: 8 }}>{CATEGORY[f.category] ?? f.category}</span>
                    </summary>
                    <p className="text-sm mt-2 mb-2" style={{ lineHeight: 1.5 }}>{f.detail}</p>
                    {f.evidence.length > 0 && (
                      <div className="flex flex-col gap-1 mb-2">
                        {f.evidence.map((e, j) => (
                          <blockquote key={j} style={{ margin: 0, padding: '6px 10px', borderLeft: '3px solid var(--border)', fontSize: 12, color: 'var(--muted-foreground)' }}>
                            «{e.quote}» <span style={{ opacity: 0.7 }}>· conversación {e.conversationId}</span>
                          </blockquote>
                        ))}
                      </div>
                    )}
                    <p className="text-sm m-0"><strong>Qué hacer:</strong> {f.recommendation}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {r.suggestedFaqs.length > 0 && (
            <section>
              <p className="font-bold text-sm mb-2 flex items-center gap-1.5"><HelpCircle size={14} /> FAQ sugeridas ({r.suggestedFaqs.length})</p>
              <div className="flex flex-col gap-2">
                {r.suggestedFaqs.map((f, i) => {
                  const done = isApplied('faq', i);
                  const answer = draft(`faq-a:${i}`, f.answer);
                  const needsData = /\[COMPLETAR/i.test(answer);
                  return (
                    <div key={i} style={card}>
                      <p className="text-sm font-bold m-0 mb-1">{f.question}</p>
                      <textarea
                        value={answer}
                        onChange={(e) => setDraft(`faq-a:${i}`, e.target.value)}
                        disabled={done || readOnly}
                        rows={Math.min(6, Math.max(2, Math.ceil(answer.length / 90)))}
                        className="w-full text-sm rounded-lg px-2.5 py-2"
                        style={{ border: `1px solid ${needsData ? '#d97706' : 'var(--border)'}`, background: 'transparent', resize: 'vertical' }}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                        <span style={muted}>{needsData ? 'Completa los datos marcados con [COMPLETAR] antes de añadirla.' : f.reason}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            disabled={done || needsData || busy === `faq:${i}`}
                            onClick={() => void apply('faq', i, { answer })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={done ? { color: '#16a34a' } : { ...btn, opacity: needsData ? 0.5 : 1 }}
                          >
                            {done ? <><CheckCircle2 size={12} /> Añadida</> : busy === `faq:${i}` ? <Loader2 size={12} className="animate-spin" /> : 'Añadir FAQ'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {r.suggestedRules.length > 0 && (
            <section>
              <p className="font-bold text-sm mb-2 flex items-center gap-1.5"><Sparkles size={14} /> Reglas sugeridas ({r.suggestedRules.length})</p>
              <div className="flex flex-col gap-2">
                {r.suggestedRules.map((s, i) => {
                  const done = isApplied('rule', i);
                  return (
                    <div key={i} style={card}>
                      <p className="text-sm font-bold m-0 mb-1">{s.title}</p>
                      <p className="text-sm m-0 mb-1.5">{s.description}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span style={muted}>{s.reason}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            disabled={done || busy === `rule:${i}`}
                            onClick={() => void apply('rule', i)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={done ? { color: '#16a34a' } : btn}
                          >
                            {done ? <><CheckCircle2 size={12} /> Añadida</> : busy === `rule:${i}` ? <Loader2 size={12} className="animate-spin" /> : 'Añadir regla'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {r.toolChanges.length > 0 && (
            <section>
              <p className="font-bold text-sm mb-2 flex items-center gap-1.5"><Wrench size={14} /> Herramientas</p>
              <div className="flex flex-col gap-2">
                {r.toolChanges.map((t, i) => {
                  const done = isApplied('tool', i);
                  return (
                    <div key={i} style={card} className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm m-0"><strong>{t.action === 'quitar' ? 'Quitar' : 'Añadir'}</strong> <code style={{ fontSize: 12 }}>{t.toolId}</code></p>
                        <p style={{ ...muted, margin: 0 }}>{t.reason}</p>
                      </div>
                      {!readOnly && t.action === 'quitar' && (
                        <button
                          type="button"
                          disabled={done || busy === `tool:${i}`}
                          onClick={() => void apply('tool', i)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={done ? { color: '#16a34a' } : btn}
                        >
                          {done ? <><CheckCircle2 size={12} /> Quitada</> : busy === `tool:${i}` ? <Loader2 size={12} className="animate-spin" /> : 'Quitar'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {r.proposedSystemPrompt && (
            <section style={card}>
              <p className="font-bold text-sm m-0 mb-1">Prompt propuesto</p>
              {r.promptChangeSummary.length > 0 && (
                <ul className="text-sm m-0 mb-2" style={{ paddingLeft: 18 }}>
                  {r.promptChangeSummary.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              )}
              <button type="button" onClick={() => setShowPrompt((v) => !v)} className="text-xs font-bold mb-2" style={{ color: 'var(--brand-primary, #0d9488)' }}>
                {showPrompt ? 'Ocultar prompt' : 'Ver y editar el prompt propuesto'}
              </button>
              {showPrompt && (
                <textarea
                  value={draft('prompt', r.proposedSystemPrompt)}
                  onChange={(e) => setDraft('prompt', e.target.value)}
                  disabled={isApplied('prompt', 0) || readOnly}
                  rows={16}
                  className="w-full text-xs rounded-lg px-2.5 py-2 mb-2"
                  style={{ border: '1px solid var(--border)', background: 'transparent', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                />
              )}
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  {isApplied('prompt', 0) ? (
                    <>
                      <span className="text-xs font-bold inline-flex items-center gap-1" style={{ color: '#16a34a' }}><CheckCircle2 size={12} /> Prompt aplicado</span>
                      <button
                        type="button"
                        disabled={busy === 'undo_prompt:0'}
                        onClick={() => void apply('undo_prompt', 0)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        <Undo2 size={12} /> Volver al prompt anterior
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === 'prompt:0'}
                      onClick={() => void apply('prompt', 0, { prompt: draft('prompt', r.proposedSystemPrompt ?? '') })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={btn}
                    >
                      {busy === 'prompt:0' ? <Loader2 size={12} className="animate-spin" /> : 'Usar este prompt'}
                    </button>
                  )}
                  <span style={muted}>El prompt actual se guarda para poder volver atrás.</span>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
