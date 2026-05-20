'use client';

import { useAuth } from '@/hooks/use-auth';
import { useCallback, useEffect, useState } from 'react';
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

/* ── types ───────────────────────────────────────────────────────── */

type AuditEntry = {
  id: string;
  action: string;
  resource: string;
  meta: Record<string, unknown>;
  ip: string;
  createdAt: string;
};

type AuditGroup = {
  key: string;
  action: string;
  resource: string;
  ip: string;
  count: number;
  newestAt: string;
  oldestAt: string;
};

/* ── helpers ─────────────────────────────────────────────────────── */

type ActionStyle = { color: string; label: string };

const ACTION_MAP: Record<string, ActionStyle> = {
  'auth.login':            { color: '#00acf8', label: 'Inicio sesión'  },
  'auth.logout':           { color: '#94a3b8', label: 'Cierre sesión'  },
  'auth.register':         { color: '#00f8e5', label: 'Registro'       },
  'auth.password-change':  { color: '#f87600', label: 'Cambio clave'   },
  'gdpr.export':           { color: '#f87600', label: 'Exportación'    },
  'gdpr.delete-account':   { color: '#e41414', label: 'Borrar cuenta'  },
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

function isoDay(iso: string): string { return iso.slice(0, 10); }

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
    if (!day) { day = { dayKey: dk, label: dayLabel(dk), groups: [] }; days.push(day); }
    const last = day.groups[day.groups.length - 1];
    if (last && last.action === e.action && last.ip === e.ip && last.resource === e.resource) {
      last.count++; last.oldestAt = e.createdAt;
    } else {
      day.groups.push({ key: e.id, action: e.action, resource: e.resource, ip: e.ip, count: 1, newestAt: e.createdAt, oldestAt: e.createdAt });
    }
  }
  return days;
}

/* ── sub-components ──────────────────────────────────────────────── */

function SectionCard({ icon, title, headerAction, children }: {
  icon: React.ReactNode;
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card-texture" style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ opacity: 0.35, display: 'flex' }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', opacity: 0.45, flex: 1 }}>
          {title}
        </h2>
        {headerAction}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </section>
  );
}

function ActionBadge({ action }: { action: string }) {
  const { color, label } = getActionStyle(action);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 6,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 11, whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.55)',
      fontWeight: 500, flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
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

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const r = await fetch('/api/user/audit-log?limit=80');
      const d = r.ok ? await r.json() : null;
      if (d?.entries) setAudit(d.entries);
    } finally { setLoadingAudit(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchAudit();
    fetch('/api/user/saas-webhook')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.url != null) setWhUrl(d.url || '');
        setWhSecretPreview(typeof d?.secretPreview === 'string' ? d.secretPreview : null);
      })
      .catch(() => {});
  }, [user?.uid, fetchAudit]);

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
      await fetchAudit();
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

  const inp: React.CSSProperties = {
    display: 'block', width: '100%',
    padding: '10px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'inherit', fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  };

  const grouped = groupAuditEntries(audit);
  const totalEvents = audit.length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px 80px' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.4 }}>
          Cuenta
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10, gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={22} style={{ opacity: 0.4 }} aria-hidden />
              Cumplimiento y datos
            </h1>
            <p style={{ margin: '10px 0 0', opacity: 0.55, maxWidth: 560, fontSize: 13.5, lineHeight: 1.65 }}>
              Exporta tus datos, elimina tu cuenta, revisa el historial de auditoría y configura webhooks
              con firma HMAC (<code style={{ fontSize: 12 }}>X-Matias-Signature</code>).
            </p>
          </div>
          {!loadingAudit && totalEvents > 0 && (
            <div style={{
              flexShrink: 0, padding: '12px 18px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'right',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{totalEvents}</div>
              <div style={{ fontSize: 11, opacity: 0.45, marginTop: 4, whiteSpace: 'nowrap' }}>eventos recientes</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section stack ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Data rights — 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <SectionCard icon={<Download size={14} />} title="Exportar mis datos">
            <p style={{ margin: '0 0 20px', fontSize: 13, opacity: 0.65, lineHeight: 1.65 }}>
              Descarga un JSON con perfil, suscripción, widgets, agentes (metadatos), uso mensual y últimas entradas de auditoría.
            </p>
            <button
              type="button"
              disabled={busyExport}
              onClick={() => void downloadExport()}
              onMouseEnter={(e) => { if (!busyExport) { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.12)'; b.style.borderColor = 'rgba(255,255,255,0.25)'; } }}
              onMouseLeave={(e) => { const b = e.currentTarget; b.style.background = 'rgba(255,255,255,0.07)'; b.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.85)',
                cursor: busyExport ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {busyExport ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
              Descargar JSON
            </button>
          </SectionCard>

          <SectionCard icon={<Trash2 size={14} />} title="Borrar cuenta">
            <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.65, lineHeight: 1.65 }}>
              Elimina widgets, agentes, uso almacenado y tu usuario de esta plataforma.
            </p>
            <form onSubmit={deleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, opacity: 0.6 }}>
                Email de confirmación
                <input type="email" required value={delEmail} onChange={(e) => setDelEmail(e.target.value)}
                  style={{ ...inp, marginTop: 5 }} autoComplete="email" />
              </label>
              <label style={{ fontSize: 12, opacity: 0.6 }}>
                Contraseña actual
                <input type="password" required value={delPass} onChange={(e) => setDelPass(e.target.value)}
                  style={{ ...inp, marginTop: 5 }} autoComplete="current-password" />
              </label>
              <button
                type="submit" disabled={busyDel}
                style={{
                  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginTop: 4, padding: '9px 16px', borderRadius: 10,
                  border: '1px solid rgba(228,20,20,0.4)',
                  background: 'rgba(127,29,29,0.3)',
                  color: '#fca5a5',
                  cursor: busyDel ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busyDel && <Loader2 className="animate-spin" size={14} />}
                Eliminar cuenta
              </button>
            </form>
          </SectionCard>
        </div>

        {/* ── Webhook ──────────────────────────────────────────── */}
        <SectionCard icon={<Webhook size={14} />} title="Webhook SaaS (saliente)">

          {/* Info grid: events + payload */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Eventos emitidos
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {['conversation.closed', 'conversation.handoff', 'quota.reached'].map((ev) => (
                  <code key={ev} style={{
                    padding: '3px 8px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 11, color: 'rgba(255,255,255,0.5)',
                  }}>
                    {ev}
                  </code>
                ))}
              </div>
            </div>
            <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Payload · Firma
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {['event', 'timestamp', 'userId', 'data'].map((f) => (
                  <code key={f} style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 11,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    {f}
                  </code>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 10, opacity: 0.3, fontFamily: 'ui-monospace, monospace' }}>
                X-Matias-Signature: sha256=…
              </p>
            </div>
          </div>

          <form onSubmit={saveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                URL de destino
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder="https://api.tu-saas.com/webhooks/matias"
                  style={{ ...inp, flex: 1, minWidth: 0 }}
                />
                <button
                  type="submit"
                  disabled={busyWh}
                  onMouseEnter={(e) => { if (!busyWh) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', borderRadius: 10, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.8)',
                    cursor: busyWh ? 'wait' : 'pointer',
                    fontSize: 13, fontWeight: 600,
                    transition: 'background 0.15s',
                  }}
                >
                  {busyWh ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Guardar
                </button>
              </div>
            </div>

            {whSecretPreview ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '11px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Lock size={13} style={{ opacity: 0.35, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10, opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Secreto HMAC-SHA256
                    </p>
                    <code style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
                      {whSecretPreview}
                    </code>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyWh}
                  onClick={() => void rotateSecret()}
                  onMouseEnter={(e) => { if (!busyWh) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 8, flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent', color: 'rgba(255,255,255,0.45)',
                    cursor: busyWh ? 'wait' : 'pointer',
                    fontSize: 12, transition: 'background 0.15s',
                  }}
                >
                  <RefreshCw size={12} /> Rotar
                </button>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)',
                fontSize: 13, color: 'rgba(255,255,255,0.45)',
              }}>
                <Lock size={13} />
                Al guardar una URL válida se generará un secreto de firma automáticamente.
              </div>
            )}
          </form>
        </SectionCard>

        {/* ── Audit log ────────────────────────────────────────── */}
        <SectionCard
          icon={<ClipboardList size={14} />}
          title="Registro de auditoría"
          headerAction={
            !loadingAudit ? (
              <button
                type="button"
                onClick={() => void fetchAudit()}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: 11,
                  transition: 'background 0.15s',
                }}
              >
                <RefreshCw size={11} />
                Actualizar
              </button>
            ) : undefined
          }
        >
          {loadingAudit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  height: 40, borderRadius: 9,
                  background: 'rgba(255,255,255,0.03)',
                  animation: 'pulse 1.6s ease-in-out infinite',
                  animationDelay: `${i * 0.08}s`,
                }} />
              ))}
            </div>
          ) : audit.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0', opacity: 0.4 }}>
              <ClipboardList size={28} style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 13 }}>Sin entradas de auditoría todavía.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
              {grouped.map(({ dayKey, label, groups }) => (
                <div key={dayKey} style={{ marginBottom: 8 }}>
                  {/* Day separator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.4, whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                    <span style={{ fontSize: 10, opacity: 0.3, whiteSpace: 'nowrap' }}>
                      {groups.reduce((s, g) => s + g.count, 0)} eventos
                    </span>
                  </div>

                  {/* Grouped rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {groups.map((g) => (
                      <div
                        key={g.key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 9,
                          background: 'rgba(255,255,255,0.025)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)'; }}
                      >
                        <ActionBadge action={g.action} />

                        <span style={{
                          fontSize: 12, color: 'rgba(255,255,255,0.45)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          flex: 1, minWidth: 0,
                        }}>
                          {g.resource || '—'}
                        </span>

                        {g.count > 1 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            padding: '2px 7px', borderRadius: 20,
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.3)', flexShrink: 0, whiteSpace: 'nowrap',
                          }}>
                            ×{g.count}
                          </span>
                        )}

                        {g.ip && g.ip !== '—' && (
                          <code style={{
                            padding: '2px 7px', borderRadius: 5, fontSize: 10.5,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.3)', flexShrink: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          }}>
                            {g.ip}
                          </code>
                        )}

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(g.newestAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {g.count > 1 && (
                            <div style={{ fontSize: 9.5, opacity: 0.3, whiteSpace: 'nowrap', marginTop: 1 }}>
                              → {new Date(g.oldestAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
}
