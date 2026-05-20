'use client';

import { useAuth } from '@/hooks/use-auth';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Shield,
  Download,
  Trash2,
  Webhook,
  RefreshCw,
  Loader2,
  ClipboardList,
  Lock,
  Save,
} from 'lucide-react';

type AuditEntry = {
  id: string;
  action: string;
  resource: string;
  meta: Record<string, unknown>;
  ip: string;
  createdAt: string;
};

/* ── helpers ─────────────────────────────────────────────────────── */

function relTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1)  return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

type ActionStyle = { color: string; label: string };

const ACTION_MAP: Record<string, ActionStyle> = {
  'auth.login':            { color: '#00acf8', label: 'Inicio sesión'   },
  'auth.logout':           { color: '#94a3b8', label: 'Cierre sesión'   },
  'auth.register':         { color: '#00f8e5', label: 'Registro'        },
  'auth.password-change':  { color: '#f87600', label: 'Cambio clave'    },
  'gdpr.export':           { color: '#f87600', label: 'Exportación'     },
  'gdpr.delete-account':   { color: '#e41414', label: 'Borrar cuenta'   },
};

function getActionStyle(action: string): ActionStyle {
  if (ACTION_MAP[action]) return ACTION_MAP[action];
  if (action.startsWith('agent.'))   return { color: '#00f8e5', label: action.replace('agent.', '') };
  if (action.startsWith('widget.'))  return { color: '#a855f7', label: action.replace('widget.', '') };
  if (action.startsWith('billing.')) return { color: '#f87600', label: action.replace('billing.', '') };
  if (action.startsWith('mcp.'))     return { color: '#00acf8', label: action.replace('mcp.', '')    };
  return { color: '#94a3b8', label: action };
}

/* ── audit grouping ──────────────────────────────────────────────── */

type AuditGroup = {
  key: string;
  action: string;
  resource: string;
  ip: string;
  count: number;
  newestAt: string;
  oldestAt: string;
};

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(dayKey: string): string {
  const d = new Date(dayKey + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
}

function groupAuditEntries(entries: AuditEntry[]): Array<{ dayKey: string; label: string; groups: AuditGroup[] }> {
  const days: Array<{ dayKey: string; label: string; groups: AuditGroup[] }> = [];
  for (const e of entries) {
    const dk = isoDay(e.createdAt);
    let day = days.find((d) => d.dayKey === dk);
    if (!day) {
      day = { dayKey: dk, label: dayLabel(dk), groups: [] };
      days.push(day);
    }
    const last = day.groups[day.groups.length - 1];
    if (last && last.action === e.action && last.ip === e.ip && last.resource === e.resource) {
      last.count++;
      last.oldestAt = e.createdAt;
    } else {
      day.groups.push({ key: e.id, action: e.action, resource: e.resource, ip: e.ip, count: 1, newestAt: e.createdAt, oldestAt: e.createdAt });
    }
  }
  return days;
}

/* ── sub-components ──────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card-texture"
      style={{
        borderRadius: 14,
        marginBottom: 14,
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ opacity: 0.4, display: 'flex' }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', opacity: 0.85 }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </section>
  );
}

function ActionBadge({ action }: { action: string }) {
  const { color, label } = getActionStyle(action);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        minWidth: 112,
        color: 'rgba(255,255,255,0.6)',
        fontWeight: 500,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0, opacity: 0.9 }} />
      {label}
    </span>
  );
}

/* ── page ────────────────────────────────────────────────────────── */

export default function CompliancePage() {
  const { user } = useAuth();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [busyExport, setBusyExport] = useState(false);
  const [delEmail, setDelEmail] = useState('');
  const [delPass, setDelPass] = useState('');
  const [busyDel, setBusyDel] = useState(false);
  const [whUrl, setWhUrl] = useState('');
  const [whSecretPreview, setWhSecretPreview] = useState<string | null>(null);
  const [busyWh, setBusyWh] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingAudit(true);
    fetch('/api/user/audit-log?limit=80')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.entries) setAudit(d.entries); })
      .finally(() => setLoadingAudit(false));
    fetch('/api/user/saas-webhook')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.url != null) setWhUrl(d.url || '');
        setWhSecretPreview(typeof d?.secretPreview === 'string' ? d.secretPreview : null);
      })
      .catch(() => {});
  }, [user?.uid]);

  async function downloadExport() {
    setBusyExport(true);
    try {
      const r = await fetch('/api/gdpr/export');
      if (!r.ok) { toast.error('No se pudo generar la exportación.'); return; }
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition');
      const nameMatch = cd?.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] || 'export-datos.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success('Descarga iniciada.');
      const refetch = await fetch('/api/user/audit-log?limit=80').then((x) => x.json());
      if (refetch?.entries) setAudit(refetch.entries);
    } finally { setBusyExport(false); }
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setBusyWh(true);
    try {
      const r = await fetch('/api/user/saas-webhook', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: whUrl.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'No se pudo guardar.'); return; }
      toast.success('Webhook guardado.');
      setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      if (d.secretPlain) toast.message(`Secreto (guárdalo ahora): ${d.secretPlain}`, { duration: 20_000 });
    } finally { setBusyWh(false); }
  }

  async function rotateSecret() {
    setBusyWh(true);
    try {
      const r = await fetch('/api/user/saas-webhook', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateSecret: true }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Error'); return; }
      toast.success('Secreto rotado.');
      setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      if (d.secretPlain) toast.message(`Nuevo secreto: ${d.secretPlain}`, { duration: 25_000 });
    } finally { setBusyWh(false); }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm('¿Eliminar definitivamente tu cuenta y datos en esta plataforma? Esta acción no se puede deshacer.')) return;
    setBusyDel(true);
    try {
      const r = await fetch('/api/gdpr/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: delEmail.trim(), password: delPass }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'No se pudo eliminar.'); return; }
      toast.success(d.message || 'Cuenta eliminada.');
      window.location.href = '/';
    } finally { setBusyDel(false); }
  }

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '10px 12px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'inherit',
    fontSize: 13,
    outline: 'none',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 64px' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6 }}>
          Cuenta
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={24} style={{ color: '#00acf8' }} aria-hidden />
          Cumplimiento y datos (RGPD)
        </h1>
        <p style={{ margin: '10px 0 0', opacity: 0.75, maxWidth: 680, fontSize: 14, lineHeight: 1.6 }}>
          Exporta tus datos, elimina tu cuenta, revisa el historial de auditoría y configura webhooks
          para integrar eventos con tu backend (firma HMAC en{' '}
          <code style={{ fontSize: 12 }}>X-Matias-Signature</code>).
        </p>
      </div>

      {/* ── Export ───────────────────────────────────────────────── */}
      <SectionCard icon={<Download size={16} />} title="Exportar mis datos">
        <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
          Descarga un JSON con perfil, suscripción, widgets, agentes (metadatos), uso mensual y últimas entradas de auditoría.
        </p>
        <button
          type="button"
          disabled={busyExport}
          onClick={() => void downloadExport()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 10,
            border: '1px solid rgba(0,172,248,0.3)',
            background: 'rgba(0,172,248,0.1)',
            color: '#7dd3fc',
            cursor: busyExport ? 'wait' : 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
        >
          {busyExport ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
          Descargar JSON
        </button>
      </SectionCard>

      {/* ── Delete account ───────────────────────────────────────── */}
      <SectionCard icon={<Trash2 size={16} />} title="Borrar cuenta">
        <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}>
          Elimina widgets, agentes de esta cuenta, uso almacenado y tu usuario. Los sistemas externos pueden
          requerir coordinación adicional con soporte.
        </p>
        <form onSubmit={deleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
          <label style={{ fontSize: 13 }}>
            Email de confirmación
            <input type="email" required value={delEmail} onChange={(e) => setDelEmail(e.target.value)}
              style={inputStyle} autoComplete="email" />
          </label>
          <label style={{ fontSize: 13 }}>
            Contraseña actual
            <input type="password" required value={delPass} onChange={(e) => setDelPass(e.target.value)}
              style={inputStyle} autoComplete="current-password" />
          </label>
          <button
            type="submit" disabled={busyDel}
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', borderRadius: 10,
              border: '1px solid rgba(228,20,20,0.4)',
              background: 'rgba(127,29,29,0.3)',
              color: '#fca5a5',
              cursor: busyDel ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {busyDel && <Loader2 className="animate-spin" size={16} />}
            Eliminar mi cuenta
          </button>
        </form>
      </SectionCard>

      {/* ── Webhook ──────────────────────────────────────────────── */}
      <SectionCard icon={<Webhook size={16} />} title="Webhook SaaS (saliente)">

        {/* Event chips — neutral code style */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {['conversation.closed', 'conversation.handoff', 'quota.reached'].map((label) => (
            <code key={label} style={{
              padding: '3px 9px', borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: 11, color: 'rgba(255,255,255,0.55)',
            }}>
              {label}
            </code>
          ))}
        </div>

        {/* Payload fields */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
          marginBottom: 18, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 10, opacity: 0.4, marginRight: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Payload
          </span>
          {['event', 'timestamp', 'userId', 'data'].map((f) => (
            <code key={f} style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 11,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {f}
            </code>
          ))}
          <span style={{ fontSize: 10, opacity: 0.3, marginLeft: 2 }}>
            · <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>X-Matias-Signature: sha256=…</code>
          </span>
        </div>

        <form onSubmit={saveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* URL input + save button inline */}
          <div>
            <p style={{ margin: '0 0 7px', fontSize: 11, opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              URL de destino
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                value={whUrl}
                onChange={(e) => setWhUrl(e.target.value)}
                placeholder="https://api.tu-saas.com/webhooks/matias"
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <button
                type="submit"
                disabled={busyWh}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px', borderRadius: 10, flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.8)',
                  cursor: busyWh ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busyWh ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </div>

          {/* Secret card */}
          {whSecretPreview ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '11px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Lock size={13} style={{ opacity: 0.35, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Secreto HMAC-SHA256
                  </p>
                  <code style={{
                    fontSize: 14, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em',
                  }}>
                    {whSecretPreview}
                  </code>
                </div>
              </div>
              <button
                type="button"
                disabled={busyWh}
                onClick={() => void rotateSecret()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '7px 11px', borderRadius: 8, flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent', color: '#94a3b8',
                  cursor: busyWh ? 'wait' : 'pointer',
                  fontSize: 12,
                }}
              >
                <RefreshCw size={12} /> Rotar
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.1)',
              fontSize: 13, opacity: 0.55,
            }}>
              <Lock size={13} />
              Al guardar una URL válida se generará un secreto de firma automáticamente.
            </div>
          )}

        </form>
      </SectionCard>

      {/* ── Audit log ────────────────────────────────────────────── */}
      <SectionCard icon={<ClipboardList size={16} />} title="Registro de auditoría">
        {loadingAudit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                height: 44, borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </div>
        ) : audit.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 13 }}>Sin entradas todavía.</p>
        ) : (
          <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {groupAuditEntries(audit).map(({ dayKey, label, groups }) => (
              <div key={dayKey}>
                {/* Day separator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.4, whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                  <span style={{ fontSize: 10, opacity: 0.3 }}>{groups.reduce((s, g) => s + g.count, 0)} eventos</span>
                </div>

                {/* Grouped rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {groups.map((g) => (
                    <div
                      key={g.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)')}
                    >
                      {/* Action badge */}
                      <ActionBadge action={g.action} />

                      {/* Resource */}
                      <span style={{
                        fontSize: 12, opacity: 0.6,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1, minWidth: 0,
                      }}>
                        {g.resource || '—'}
                      </span>

                      {/* Count bubble */}
                      {g.count > 1 && (
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          padding: '2px 7px', borderRadius: 20,
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#64748b', flexShrink: 0, whiteSpace: 'nowrap',
                        }}>
                          ×{g.count}
                        </span>
                      )}

                      {/* IP chip */}
                      {g.ip && g.ip !== '—' && (
                        <code style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#64748b', flexShrink: 0,
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          letterSpacing: '-0.01em',
                        }}>
                          {g.ip}
                        </code>
                      )}

                      {/* Timestamp */}
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                          {new Date(g.newestAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        {g.count > 1 && (
                          <div style={{ fontSize: 10, opacity: 0.35, whiteSpace: 'nowrap', marginTop: 1 }}>
                            {'→ '}{new Date(g.oldestAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
