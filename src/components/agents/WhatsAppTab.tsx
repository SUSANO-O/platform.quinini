'use client';

import { useEffect, useState } from 'react';
import { Phone, MessageCircle, Copy, Check, Loader2, RefreshCw, AlertCircle, CheckCircle2, ExternalLink } from '@/components/ui/icons';
import { AiLoadingInline } from '@/components/ui/ai-loading-screen';

interface WhatsAppInfo {
  webhookUrl: string;
  verifyToken: string;
  phoneNumberId: string;
  displayPhone: string;
  wabaId: string;
  apiVersion: string;
  enabled: boolean;
  status: 'disconnected' | 'pending' | 'connected' | 'error' | string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  connectedAt: string | null;
  lastError: string;
  senderDisplayPhone?: string;
  senderPhoneNumberId?: string;
  handoffNotifyPhone?: string;
  handoffNotifyWidgetName?: string;
  handoffNotifyWidgetId?: string;
  ownerWaLastInboundAt?: string | null;
  escalationWhatsAppPhone?: string;
}

export default function WhatsAppTab({
  agentId,
  readOnly,
}: {
  agentId: string;
  readOnly: boolean;
}) {
  const [info, setInfo] = useState<WhatsAppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Form fields (write-only)
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [enabled, setEnabled] = useState(false);

  async function loadInfo() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/whatsapp-info`);
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al cargar'); return; }
      setInfo(d);
      setPhoneNumberId(d.phoneNumberId || '');
      setDisplayPhone(d.displayPhone || '');
      setWabaId(d.wabaId || '');
      setEnabled(d.enabled);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInfo(); }, [agentId]);

  async function save() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body: Record<string, unknown> = {
        whatsapp: {
          enabled,
          phoneNumberId: phoneNumberId.trim(),
          displayPhone: displayPhone.trim(),
          wabaId: wabaId.trim(),
        },
      };
      // Solo enviar tokens si el usuario escribió algo nuevo (no placeholder)
      const w = body.whatsapp as Record<string, unknown>;
      if (accessToken.trim()) w.accessToken = accessToken.trim();
      if (appSecret.trim())   w.appSecret = appSecret.trim();

      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al guardar'); return; }
      setSuccess('Configuración guardada.');
      setAccessToken(''); // limpiar input write-only
      setAppSecret('');
      await loadInfo();
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError('Error de red al guardar');
    } finally {
      setSaving(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function statusBadge() {
    if (!info) return null;
    const map = {
      connected:    { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', icon: CheckCircle2, label: 'Conectado' },
      pending:      { bg: 'rgba(251,191,36,0.12)', color: '#f59e0b', icon: AlertCircle, label: 'Pendiente' },
      error:        { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', icon: AlertCircle, label: 'Error' },
      disconnected: { bg: 'rgba(100,116,139,0.12)', color: '#64748b', icon: AlertCircle, label: 'Desconectado' },
    } as const;
    const m = map[info.status as keyof typeof map] || map.disconnected;
    const Icon = m.icon;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: m.bg, color: m.color, fontSize: 11, fontWeight: 700 }}>
        <Icon size={12} /> {m.label}
      </span>
    );
  }

  const WA = '#25d366'; // verde WhatsApp brand

  if (loading) {
    return (
      <AiLoadingInline
        label="Cargando WhatsApp…"
        hint="Recuperando webhook y credenciales"
        style={{ padding: '40px 16px' }}
      />
    );
  }
  if (!info) {
    return <div style={{ padding: 40, color: '#ef4444' }}>⚠️ {error || 'No se pudo cargar la configuración.'}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER */}
      <div style={{
        background: `linear-gradient(135deg, ${WA}15, ${WA}05)`,
        border: `1px solid ${WA}40`,
        borderRadius: 12,
        padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: WA, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={22} color="#fff" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>WhatsApp Business Cloud API</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
              Conecta tu propio número de WhatsApp para que el agente responda automáticamente.
            </p>
          </div>
        </div>
        {statusBadge()}
      </div>

      {/* Mapa ENVÍA / RECIBE — evita confundir Business Meta con el operador */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
      }}>
        <div style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${WA}55`,
          background: `${WA}0c`,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: WA, textTransform: 'uppercase' }}>
            📤 Número que ENVÍA (Business Meta)
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--foreground)' }}>
            {info.senderDisplayPhone || info.displayPhone || '— sin configurar —'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
            Phone Number ID: <code style={{ fontSize: 10 }}>{info.senderPhoneNumberId || info.phoneNumberId || '—'}</code>
            <br />El bot responde visitantes por WhatsApp y las alertas de handoff salen <strong>desde aquí</strong>.
          </p>
        </div>
        <div style={{
          padding: 14,
          borderRadius: 10,
          border: '1px solid rgba(59,130,246,0.35)',
          background: 'rgba(59,130,246,0.06)',
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#3b82f6', textTransform: 'uppercase' }}>
            📥 Número que RECIBE alertas handoff
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--foreground)' }}>
            {info.handoffNotifyPhone || '— sin configurar —'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.45 }}>
            {info.handoffNotifyWidgetName
              ? <>Widget «{info.handoffNotifyWidgetName}» → campo <strong>WhatsApp humano</strong>.</>
              : <>Configúralo en el <strong>Widget Builder</strong> → WhatsApp humano (no es el número de Meta).</>}
            {info.ownerWaLastInboundAt ? (
              <><br />Ventana 24 h activa desde {new Date(info.ownerWaLastInboundAt).toLocaleString('es')}.</>
            ) : info.handoffNotifyPhone ? (
              <><br /><strong>Meta no permite dejar la ventana siempre abierta</strong> con texto libre. Sin plantilla aprobada, usa Inbox + Slack (siempre llegan).</>
            ) : null}
          </p>
        </div>
      </div>

      <div style={{
        padding: 14,
        borderRadius: 10,
        border: '1px solid rgba(251,191,36,0.45)',
        background: 'rgba(251,191,36,0.08)',
        fontSize: 12,
        color: 'var(--foreground)',
        lineHeight: 1.55,
      }}>
        <strong>¿Por qué a veces no llega la alerta por WhatsApp?</strong>
        <br />WhatsApp (Meta) solo permite que el Business <strong>inicie</strong> un chat con texto libre si el destinatario escribió a ese Business en las últimas 24 h. Eso <strong>no se puede forzar desde Botiva</strong> ni dejar «siempre abierto».
        <br /><br />
        <strong>Lo que sí funciona siempre:</strong> Inbox del panel + Slack (modo «both» en el widget).
        <br /><strong>WhatsApp alerta sin ventana:</strong> requiere una <em>plantilla utility</em> aprobada en Meta (<code>HANDOFF_WA_TEMPLATE_ENABLED=1</code> en el servidor).
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#22c55e', fontSize: 13 }}>
          ✓ {success}
        </div>
      )}

      {/* PASO 1: Datos del cliente para Meta */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>1️⃣ Configura el webhook en Meta</p>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          Entra a tu app en{' '}
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{ color: WA, textDecoration: 'none', fontWeight: 600 }}>
            Meta for Developers <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </a>
          {' '}→ WhatsApp → Configuration → Webhook. Pega estos dos valores:
        </p>

        <Field label="Callback URL (Webhook URL)" value={info.webhookUrl} onCopy={() => copyToClipboard(info.webhookUrl, 'url')} copied={copied === 'url'} />
        <Field label="Verify Token" value={info.verifyToken} mono onCopy={() => copyToClipboard(info.verifyToken, 'vt')} copied={copied === 'vt'} />

        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          En Meta marca <strong>"Subscribe"</strong> al campo <code>messages</code> bajo "Webhook fields".
        </p>
      </div>

      {/* PASO 2: Credenciales del agente */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>2️⃣ Pega las credenciales de tu cuenta WhatsApp Business</p>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          Obtienes estos datos en Meta → WhatsApp → API Setup. El access token se cifra antes de guardar y nunca lo devolvemos.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label required>Número que ENVÍA — Phone Number ID (Meta → API Setup)</Label>
            <input type="text" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} disabled={readOnly}
              placeholder="1207374649116580"
              style={input} />
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              ID interno de Meta. No es el teléfono del operador.
            </p>
          </div>

          <div>
            <Label required>Número que ENVÍA — Display Phone (Meta → API Setup)</Label>
            <input type="text" value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} disabled={readOnly}
              placeholder="+1 555 648-8482"
              style={input} />
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              El teléfono Business visible en WhatsApp. Ej. sandbox Meta: <code>555 648-8482</code>.
            </p>
          </div>

          <div>
            <Label>WhatsApp Business Account ID — WABA ID (opcional)</Label>
            <input type="text" value={wabaId} onChange={(e) => setWabaId(e.target.value)} disabled={readOnly}
              placeholder="100123456789012"
              style={input} />
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#f59e0b' }}>
              Solo el ID numérico de Meta. <strong>No pongas tu email aquí.</strong>
            </p>
          </div>

          <div>
            <Label required={!info.hasAccessToken}>
              Access Token (System User token permanente)
              {info.hasAccessToken && <span style={{ marginLeft: 6, color: '#22c55e', fontSize: 10 }}>✓ ya configurado</span>}
            </Label>
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} disabled={readOnly}
              placeholder={info.hasAccessToken ? '••••••••••••••••• (dejar vacío para no cambiar)' : 'EAAxxxx...'}
              style={input} autoComplete="off" />
          </div>

          <div>
            <Label>
              App Secret (opcional, para validar firma del webhook)
              {info.hasAppSecret && <span style={{ marginLeft: 6, color: '#22c55e', fontSize: 10 }}>✓ ya configurado</span>}
            </Label>
            <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} disabled={readOnly}
              placeholder={info.hasAppSecret ? '••••••••••••• (dejar vacío para no cambiar)' : 'abc123...'}
              style={input} autoComplete="off" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px', background: enabled ? `${WA}15` : 'var(--muted)', border: `1px solid ${enabled ? WA + '40' : 'var(--border)'}`, borderRadius: 8, cursor: readOnly ? 'not-allowed' : 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ cursor: 'inherit' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? WA : 'var(--foreground)' }}>
              {enabled ? 'Activado — el agente responderá por WhatsApp' : 'Desactivado — no procesa mensajes entrantes'}
            </span>
          </label>
        </div>

        {!readOnly && (
          <button type="button" onClick={() => void save()} disabled={saving}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              background: saving ? `${WA}80` : WA,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        )}
      </div>

      {/* PASO 3: Verificación */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>3️⃣ Prueba el flujo</p>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          <strong>Flujo chat (visitante ↔ agente):</strong> un visitante escribe al número Business (ENVÍA) → el bot responde.
          <br /><strong>Flujo handoff (alerta al operador):</strong> el Business (ENVÍA) manda alerta al número RECIBE del widget.
          <br />a) Prueba chat: escribe al <strong>{info.displayPhone || 'número Business'}</strong> desde un celular de prueba
          <br />b) Prueba handoff: el operador ({info.handoffNotifyPhone || 'WhatsApp humano del widget'}) escribe primero al Business, luego usa el botón auricular del widget
          <br />c) Las conversaciones aparecen en <strong>Inbox</strong>
        </p>
        <button type="button" onClick={() => void loadInfo()} disabled={loading}
          style={{ padding: '8px 14px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--foreground)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} /> Refrescar estado
        </button>
        {info.connectedAt && (
          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            Conectado: {new Date(info.connectedAt).toLocaleString('es')}
          </p>
        )}
        {info.lastError && (
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#ef4444' }}>
            Último error: {info.lastError}
          </p>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--muted)', color: 'var(--foreground)', fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
      {children}
      {required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
    </label>
  );
}

function Field({ label, value, mono, onCopy, copied }: { label: string; value: string; mono?: boolean; onCopy: () => void; copied: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input readOnly value={value} onClick={(e) => (e.target as HTMLInputElement).select()}
          style={{ ...input, fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? 11 : 13 }} />
        <button type="button" onClick={onCopy}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: copied ? 'rgba(34,197,94,0.12)' : 'var(--muted)', color: copied ? '#22c55e' : 'var(--foreground)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
