'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { useClientModels } from '@/hooks/use-client-models';
import { TOOLS, getAgentLimits } from '@/lib/agent-plans';
import { Bot, ChevronLeft, Loader2, Lock, KeyRound } from 'lucide-react';
import Link from 'next/link';

export default function NewAgentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { subscription } = useSubscription();
  const plan = subscription?.plan ?? 'free';
  const limits = getAgentLimits(plan);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [widgetPublicToken, setWidgetPublicToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPlatform, setIsPlatform] = useState(false);
  const [inferenceTemperature, setInferenceTemperature] = useState('');
  const [inferenceMaxTokens, setInferenceMaxTokens] = useState('');
  const { models: clientModels, hubError: modelsHubError } = useClientModels(plan);

  function generatePublicToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setWidgetPublicToken(`afhub_pub_${hex}`);
  }

  function toggleTool(toolId: string) {
    setSelectedTools((prev) =>
      prev.includes(toolId)
        ? prev.filter((t) => t !== toolId)
        : prev.length < limits.toolsPerAgent
          ? [...prev, toolId]
          : prev,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre es requerido.'); return; }
    if (!systemPrompt.trim()) { setError('El system prompt es requerido.'); return; }
    setLoading(true);

    const payload: Record<string, unknown> = {
      name,
      description,
      systemPrompt,
      model,
      type: 'agent',
      tools: selectedTools.map((toolId) => ({ toolId, config: {} })),
      ...(isAdmin && isPlatform ? { isPlatform: true } : {}),
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

    if (!res.ok) { setError(data.error ?? 'Error al crear el agente.'); return; }
    router.push(`/dashboard/agents/${data.agent._id}`);
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--foreground)', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '32px', maxWidth: '700px' }}>
      <Link href="/dashboard/agents" style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        color: 'var(--muted-foreground)', fontSize: '12px', textDecoration: 'none', marginBottom: '20px',
      }}>
        <ChevronLeft size={14} /> Volver a agentes
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <div style={{
          width: 42, height: 42, borderRadius: '12px',
          background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Nuevo Agente</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '12px', margin: 0 }}>
            Configura tu agente de IA personalizado
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Siempre visible: solo admins pueden activarlo (API valida rol). */}
        <div
          style={{
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '14px',
            padding: '18px 20px',
          }}
        >
          <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Catálogo Hub · agente de plataforma
          </h2>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: isAdmin ? 'pointer' : 'not-allowed',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              opacity: isAdmin ? 1 : 0.92,
            }}
          >
            <input
              type="checkbox"
              checked={isAdmin && isPlatform}
              disabled={!isAdmin}
              onChange={(e) => {
                if (!isAdmin) return;
                setIsPlatform(e.target.checked);
              }}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <span style={{ fontSize: '12px', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--foreground)' }}>Publicar como agente de plataforma en el catálogo</strong>
              <br />
              <span style={{ color: 'var(--muted-foreground)' }}>
                Visible para todos los usuarios autenticados, sincronizado con AIBackHub como el resto de agentes, y no consume el cupo de agentes del plan. Solo cuentas con rol{' '}
                <strong>administrador</strong> pueden activar esta opción.
              </span>
              {!isAdmin && (
                <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', color: '#d97706' }}>
                  Tu cuenta no tiene rol admin: no verás el check activo hasta que un administrador te lo asigne en la base de datos (o uses una cuenta admin).
                </span>
              )}
            </span>
          </label>
        </div>

        {/* Name + Description */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Información básica
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>
                Nombre del agente <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                style={inp}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Agente de soporte al cliente"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>
                Descripción <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <input
                style={inp}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción de qué hace este agente"
              />
            </div>
          </div>
        </div>

        {/* Model */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modelo de IA
          </h2>
          {modelsHubError && (
            <p style={{ fontSize: '12px', color: '#d97706', marginBottom: '12px', lineHeight: 1.45 }}>
              {modelsHubError} Se muestran modelos de respaldo; revisa BACKEND_URL y que AIBackHub esté en marcha.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
            {clientModels.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                style={{
                  padding: '10px 12px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${model === m.id ? '#6366f1' : 'var(--border)'}`,
                  background: model === m.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 2px', color: model === m.id ? '#6366f1' : 'var(--foreground)' }}>
                  {m.name}
                  {m.deprecated ? (
                    <span style={{ fontSize: '10px', marginLeft: '6px', color: '#d97706' }}>(deprecado)</span>
                  ) : null}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>
                  {m.provider}{m.badge ? ` · ${m.badge}` : ''}
                  {m.maxTokens != null ? ` · hasta ${m.maxTokens.toLocaleString()} ctx` : ''}
                </p>
                {m.description ? (
                  <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '6px 0 0', lineHeight: 1.35 }}>
                    {m.description}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                Temperatura (opcional, 0–2)
              </label>
              <input
                style={inp}
                value={inferenceTemperature}
                onChange={(e) => setInferenceTemperature(e.target.value)}
                placeholder="Vacío = catálogo"
                inputMode="decimal"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted-foreground)' }}>
                Max tokens salida (opcional)
              </label>
              <input
                style={inp}
                value={inferenceMaxTokens}
                onChange={(e) => setInferenceMaxTokens(e.target.value)}
                placeholder="Vacío = catálogo"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        {/* Widget public token (catálogo / SDK, como AgentFlowHub) */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <KeyRound size={14} style={{ opacity: 0.85 }} /> Token público del widget <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>(opcional)</span>
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.45 }}>
            Si lo defines, queda guardado en el catálogo (AIBackHub) como en AgentFlowHub. El SDK debe enviar el mismo valor en{' '}
            <code style={{ fontSize: '11px', background: 'var(--background)', padding: '2px 6px', borderRadius: '6px' }}>token</code>
            {' '}y la API lo valida con la cabecera{' '}
            <code style={{ fontSize: '11px', background: 'var(--background)', padding: '2px 6px', borderRadius: '6px' }}>X-Widget-Token</code>.
            Si solo usas <strong>Mis widgets</strong> con un token <code style={{ fontSize: '11px' }}>wt_…</code>, puedes dejarlo vacío.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <input
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
              style={{
                padding: '10px 14px', borderRadius: '10px', fontWeight: 600, fontSize: '12px',
                border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Generar token
            </button>
          </div>
        </div>

        {/* System Prompt */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            System Prompt <span style={{ color: '#ef4444' }}>*</span>
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
            Define el comportamiento y personalidad de tu agente.
          </p>
          <textarea
            style={{ ...inp, minHeight: '140px', resize: 'vertical', fontFamily: 'inherit' }}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={`Eres un asistente de soporte de Acme Corp. Tu misión es ayudar a los clientes con sus dudas de forma amable y precisa. Siempre responde en español. Cuando no sepas algo, dilo claramente y ofrece escalar al equipo humano.`}
            required
          />
        </div>

        {/* Tools */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Herramientas
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {selectedTools.length}/{limits.toolsPerAgent} seleccionadas
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {TOOLS.map((tool) => {
              const available = limits.availableToolIds.includes(tool.id);
              const selected = selectedTools.includes(tool.id);
              const maxed = selectedTools.length >= limits.toolsPerAgent && !selected;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => available && !maxed ? toggleTool(tool.id) : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                    borderRadius: '10px', textAlign: 'left', cursor: available && !maxed ? 'pointer' : 'not-allowed',
                    border: `1px solid ${selected ? '#6366f1' : 'var(--border)'}`,
                    background: selected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    opacity: !available || maxed ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{tool.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: selected ? '#6366f1' : 'var(--foreground)' }}>
                      {tool.name}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0 }}>
                      {tool.description}
                    </p>
                  </div>
                  {!available && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      <Lock size={10} /> {tool.minPlan}+
                    </div>
                  )}
                  {selected && (
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#6366f1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {plan === 'free' && (
            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '10px' }}>
              🔒 Más herramientas disponibles en planes pagos.{' '}
              <Link href="/dashboard" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 700 }}>Ver planes →</Link>
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 24px', borderRadius: '10px', fontWeight: 700,
              fontSize: '14px', background: '#6366f1', color: '#fff',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Bot size={15} />}
            {loading ? 'Creando agente...' : 'Crear agente'}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </button>
          <Link href="/dashboard/agents" style={{
            display: 'flex', alignItems: 'center', padding: '11px 20px', borderRadius: '10px',
            fontWeight: 600, fontSize: '14px', border: '1px solid var(--border)',
            color: 'var(--foreground)', textDecoration: 'none',
          }}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
