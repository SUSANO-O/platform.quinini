'use client';

/**
 * "Diseñar con IA": entrevista corta del negocio → agente completo generado (prompt, FAQ,
 * reglas, skills e integraciones) → revisión. Al aceptar rellena el formulario de nuevo agente;
 * nada se crea hasta que el usuario pulsa "Crear agente".
 */
import { useState, type CSSProperties } from 'react';
import { Sparkles, Loader2, X, AlertTriangle, CheckCircle2 } from '@/components/ui/icons';

type Goal = 'ventas' | 'soporte' | 'citas' | 'informacion';
type Tone = 'amigable' | 'profesional' | 'formal' | 'casual' | 'tecnico';

export type AgentDesign = {
  name: string;
  description: string;
  welcomeMessage: string;
  systemPrompt: string;
  faqs: Array<{ question: string; answer: string }>;
  rules: Array<{ title: string; description: string }>;
  skills: Array<{ id: string; reason: string }>;
  integrations: Array<{ key: string; reason: string }>;
  missingInfo: string[];
};

export type AcceptedDesign = {
  name: string;
  description: string;
  systemPrompt: string;
  welcomeMessage: string;
  faqs: Array<{ question: string; answer: string }>;
  rules: Array<{ title: string; description: string }>;
  skillIds: string[];
  integrationKey: string | null;
};

const GOALS: Array<{ id: Goal; label: string }> = [
  { id: 'ventas', label: 'Vender / captar clientes' },
  { id: 'soporte', label: 'Soporte a clientes' },
  { id: 'citas', label: 'Agendar citas' },
  { id: 'informacion', label: 'Informar del negocio' },
];

const field: CSSProperties = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)' };
const label: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 };
const muted: CSSProperties = { color: 'var(--muted-foreground)', fontSize: 12 };
const card: CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' };
const primary: CSSProperties = { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600 };
const NEEDS = /\[COMPLETAR/i;

export function AgentDesignWizard({ onClose, onAccept }: { onClose: () => void; onAccept: (d: AcceptedDesign) => void }) {
  const [step, setStep] = useState<'interview' | 'loading' | 'review'>('interview');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    businessName: '', whatYouSell: '', audience: '', hours: '', contact: '', mustNot: '', extra: '',
    tone: 'amigable' as Tone, goals: [] as Goal[],
  });
  const [doc, setDoc] = useState('');
  const [design, setDesign] = useState<AgentDesign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string; on: boolean }>>([]);
  const [rules, setRules] = useState<Array<{ title: string; description: string; on: boolean }>>([]);
  const [skills, setSkills] = useState<Record<string, boolean>>({});
  const [integration, setIntegration] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canGenerate = form.businessName.trim().length > 0 && form.whatYouSell.trim().length >= 10;

  const generate = async () => {
    setError('');
    setStep('loading');
    try {
      const res = await fetch('/api/ai/design-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview: { ...form, language: 'es' }, documentContext: doc }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: { design?: AgentDesign }; error?: unknown } | null;
      const d = json?.data?.design;
      if (!res.ok || !json?.success || !d) {
        const e = json?.error;
        throw new Error(typeof e === 'string' ? e : (e as { message?: string })?.message || 'No se pudo diseñar el agente.');
      }
      setDesign(d);
      setName(d.name);
      setDescription(d.description);
      setPrompt(d.systemPrompt);
      setFaqs(d.faqs.map((f) => ({ ...f, on: !NEEDS.test(f.answer) })));
      setRules(d.rules.map((r) => ({ ...r, on: true })));
      setSkills(Object.fromEntries(d.skills.map((s) => [s.id, true])));
      setIntegration(d.integrations[0]?.key ?? null);
      setStep('review');
    } catch (e) {
      setError((e as Error).message);
      setStep('interview');
    }
  };

  const promptNeeds = NEEDS.test(prompt);
  const faqNeeds = faqs.some((f) => f.on && NEEDS.test(f.answer));

  const accept = () => {
    if (!design) return;
    onAccept({
      name: name.trim(),
      description: description.trim(),
      systemPrompt: prompt.trim(),
      welcomeMessage: design.welcomeMessage,
      faqs: faqs.filter((f) => f.on).map(({ question, answer }) => ({ question, answer })),
      rules: rules.filter((r) => r.on).map(({ title, description: d }) => ({ title, description: d })),
      skillIds: Object.entries(skills).filter(([, on]) => on).map(([id]) => id),
      integrationKey: integration,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Diseñar agente con IA" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card, var(--background))', color: 'var(--foreground)', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '92vh', overflow: 'auto', padding: 20, border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold m-0 flex items-center gap-2" style={{ color: '#6366f1' }}><Sparkles size={16} /> Diseñar agente con IA</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {error && <p className="text-sm mb-3 flex items-center gap-1.5" style={{ color: '#ef4444' }}><AlertTriangle size={14} /> {error}</p>}

        {step === 'interview' && (
          <div className="flex flex-col gap-3">
            <p style={{ ...muted, margin: 0 }}>Cuéntanos de tu negocio. Con eso la IA arma el agente completo y tú lo revisas antes de crearlo. Lo que no sepas, déjalo vacío: el asistente lo marcará para completarlo después.</p>
            <div>
              <label style={label}>Nombre del negocio *</label>
              <input style={field} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} maxLength={200} />
            </div>
            <div>
              <label style={label}>¿Qué vendes o a qué te dedicas? *</label>
              <textarea style={field} rows={3} value={form.whatYouSell} onChange={(e) => set('whatYouSell', e.target.value)} maxLength={2000} placeholder="Productos o servicios, ciudad, lo que te diferencia…" />
            </div>
            <div>
              <label style={label}>¿Para qué quieres el agente?</label>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((g) => {
                  const on = form.goals.includes(g.id);
                  return (
                    <button key={g.id} type="button" onClick={() => setForm((f) => ({ ...f, goals: on ? f.goals.filter((x) => x !== g.id) : [...f.goals, g.id] }))}
                      style={{ borderRadius: 999, padding: '5px 12px', fontSize: 12, border: `1px solid ${on ? '#6366f1' : 'var(--border)'}`, background: on ? 'rgba(99,102,241,0.12)' : 'transparent', color: 'var(--foreground)', cursor: 'pointer' }}>
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div><label style={label}>¿Quiénes son tus clientes?</label><input style={field} value={form.audience} onChange={(e) => set('audience', e.target.value)} maxLength={1000} /></div>
              <div><label style={label}>Horario de atención</label><input style={field} value={form.hours} onChange={(e) => set('hours', e.target.value)} maxLength={500} /></div>
              <div><label style={label}>Contacto (WhatsApp, teléfono, dirección)</label><input style={field} value={form.contact} onChange={(e) => set('contact', e.target.value)} maxLength={1000} /></div>
              <div>
                <label style={label}>Tono</label>
                <select style={field} value={form.tone} onChange={(e) => set('tone', e.target.value)}>
                  <option value="amigable">Amigable</option><option value="profesional">Profesional</option><option value="formal">Formal</option><option value="casual">Casual</option><option value="tecnico">Técnico</option>
                </select>
              </div>
            </div>
            <div>
              <label style={label}>¿Qué NO debe hacer el agente?</label>
              <input style={field} value={form.mustNot} onChange={(e) => set('mustNot', e.target.value)} maxLength={2000} placeholder="Ej.: no dar precios exactos, no prometer tiempos de entrega…" />
            </div>
            <div>
              <label style={label}>Información adicional o texto de tu web (opcional)</label>
              <textarea style={field} rows={4} value={doc} onChange={(e) => setDoc(e.target.value.slice(0, 30_000))} placeholder="Pega aquí precios, políticas, preguntas frecuentes o el texto de tu página. Cuanto más real, mejor el agente." />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} style={{ ...primary, background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button type="button" disabled={!canGenerate} onClick={() => void generate()} style={{ ...primary, opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}>
                <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> Diseñar agente</span>
              </button>
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2 size={24} className="animate-spin" style={{ color: '#6366f1' }} />
            <p className="font-bold text-sm m-0">Diseñando tu agente…</p>
            <p style={{ ...muted, margin: 0 }}>Escribiendo el prompt, las preguntas frecuentes y las reglas. Tarda unos 30 segundos.</p>
          </div>
        )}

        {step === 'review' && design && (
          <div className="flex flex-col gap-3">
            {design.missingInfo.length > 0 && (
              <div style={{ ...card, borderColor: 'rgba(217,119,6,0.5)', background: 'rgba(217,119,6,0.06)' }}>
                <p className="text-sm font-bold m-0 mb-1">Datos que faltan</p>
                <ul className="text-sm m-0" style={{ paddingLeft: 18 }}>{design.missingInfo.map((m, i) => <li key={i}>{m}</li>)}</ul>
                <p style={{ ...muted, margin: '4px 0 0' }}>Aparecen como [COMPLETAR: …]. Rellénalos aquí o desmarca esas FAQ.</p>
              </div>
            )}

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <div><label style={label}>Nombre del agente</label><input style={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
              <div><label style={label}>Descripción</label><input style={field} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></div>
            </div>

            <div>
              <label style={label}>Prompt del sistema</label>
              <textarea style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 12, borderColor: promptNeeds ? '#d97706' : 'var(--border)' }} rows={12} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>

            {faqs.length > 0 && (
              <div>
                <label style={label}>Preguntas frecuentes ({faqs.filter((f) => f.on).length}/{faqs.length})</label>
                <div className="flex flex-col gap-2">
                  {faqs.map((f, i) => {
                    const needs = NEEDS.test(f.answer);
                    return (
                      <div key={i} style={{ ...card, opacity: f.on ? 1 : 0.55 }}>
                        <label className="flex items-start gap-2 text-sm font-bold" style={{ cursor: 'pointer' }}>
                          <input type="checkbox" checked={f.on} onChange={() => setFaqs((xs) => xs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} style={{ marginTop: 3 }} />
                          {f.question}
                        </label>
                        <textarea style={{ ...field, marginTop: 6, borderColor: needs && f.on ? '#d97706' : 'var(--border)' }} rows={2} value={f.answer}
                          onChange={(e) => setFaqs((xs) => xs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {rules.length > 0 && (
              <div>
                <label style={label}>Reglas</label>
                <div className="flex flex-col gap-1.5">
                  {rules.map((r, i) => (
                    <label key={i} className="flex items-start gap-2 text-sm" style={{ ...card, cursor: 'pointer', opacity: r.on ? 1 : 0.55 }}>
                      <input type="checkbox" checked={r.on} onChange={() => setRules((xs) => xs.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} style={{ marginTop: 3 }} />
                      <span><strong>{r.title}:</strong> {r.description}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {design.skills.length > 0 && (
              <div>
                <label style={label}>Skills sugeridas</label>
                <div className="flex flex-col gap-1.5">
                  {design.skills.map((s) => (
                    <label key={s.id} className="flex items-start gap-2 text-sm" style={{ ...card, cursor: 'pointer' }}>
                      <input type="checkbox" checked={skills[s.id] !== false} onChange={() => setSkills((x) => ({ ...x, [s.id]: x[s.id] === false }))} style={{ marginTop: 3 }} />
                      <span><code style={{ fontSize: 12 }}>{s.id}</code> — {s.reason}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {design.integrations.length > 0 && (
              <div>
                <label style={label}>Integraciones recomendadas</label>
                <div className="flex flex-col gap-1.5">
                  {design.integrations.map((s) => (
                    <label key={s.key} className="flex items-start gap-2 text-sm" style={{ ...card, cursor: 'pointer' }}>
                      <input type="radio" name="design-integration" checked={integration === s.key} onChange={() => setIntegration(s.key)} style={{ marginTop: 3 }} />
                      <span><code style={{ fontSize: 12 }}>{s.key}</code> — {s.reason}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer', ...muted }}>
                    <input type="radio" name="design-integration" checked={integration === null} onChange={() => setIntegration(null)} /> Ninguna por ahora
                  </label>
                </div>
                <p style={{ ...muted, margin: '4px 0 0' }}>Al crear el agente se abrirá la conexión de la integración elegida.</p>
              </div>
            )}

            {design.welcomeMessage && (
              <div style={card}>
                <p className="text-sm font-bold m-0 mb-1">Mensaje de bienvenida sugerido</p>
                <p className="text-sm m-0">{design.welcomeMessage}</p>
                <p style={{ ...muted, margin: '4px 0 0' }}>Úsalo al configurar el widget del agente.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {(promptNeeds || faqNeeds) && (
                <span className="text-xs flex items-center gap-1" style={{ color: '#d97706' }}>
                  <AlertTriangle size={12} /> Completa o quita los [COMPLETAR] antes de usar el diseño.
                </span>
              )}
              <button type="button" onClick={() => setStep('interview')} style={{ ...primary, background: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)' }}>Volver a la entrevista</button>
              <button type="button" disabled={promptNeeds || faqNeeds || !name.trim() || !prompt.trim()} onClick={accept}
                style={{ ...primary, opacity: promptNeeds || faqNeeds ? 0.5 : 1, cursor: promptNeeds || faqNeeds ? 'not-allowed' : 'pointer' }}>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} /> Usar este diseño</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
