'use client';

import { useAuth } from '@/hooks/use-auth';
import { useSubscription } from '@/hooks/use-subscription';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
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
  Ticket,
  MessageSquare,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SecretRevealModal } from '@/components/ui/secret-reveal-modal';
import { BRAND, STATE, METRIC } from '@/lib/brand-colors';
import { outboundWebhookUpgradeLabel, escalationSlackUpgradeLabel, escalationTicketUpgradeLabel } from '@/lib/plan-catalog';

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
  'auth.login':            { color: BRAND.cool, label: 'Inicio sesión'  },
  'auth.logout':           { color: STATE.muted, label: 'Cierre sesión'  },
  'auth.register':         { color: BRAND.warm, label: 'Registro'       },
  'auth.password-change':  { color: STATE.info, label: 'Cambio clave'   },
  'gdpr.export':           { color: BRAND.warm, label: 'Exportación'    },
  'gdpr.delete-account':   { color: STATE.error, label: 'Borrar cuenta'  },
};

function getActionStyle(action: string): ActionStyle {
  if (ACTION_MAP[action]) return ACTION_MAP[action];
  if (action.startsWith('agent.'))   return { color: BRAND.cool, label: action.replace('agent.', '') };
  if (action.startsWith('widget.'))  return { color: METRIC.neutral, label: action.replace('widget.', '') };
  if (action.startsWith('billing.')) return { color: BRAND.warm, label: action.replace('billing.', '') };
  if (action.startsWith('mcp.'))     return { color: BRAND.cool, label: action.replace('mcp.', '')    };
  return { color: STATE.muted, label: action };
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

function SectionCard({ icon, title, accent, headerAction, children }: {
  icon: React.ReactNode;
  title: string;
  accent?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card-texture"
      style={{
        borderRadius: 14,
        border: '1px solid var(--border)',
        borderTop: `2px solid ${accent ?? 'var(--border)'}`,
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '13px 18px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ display: 'flex', color: accent ?? 'var(--muted-foreground)', opacity: 0.8 }}>{icon}</span>
        <h2 style={{
          margin: 0, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)', flex: 1,
        }}>
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
      background: 'var(--muted)', border: '1px solid var(--border)',
      fontSize: 11, whiteSpace: 'nowrap', color: 'var(--muted-foreground)',
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
  const { startCheckout } = useSubscription();
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [busyExport, setBusyExport] = useState(false);
  const [delEmail, setDelEmail] = useState('');
  const [delPass, setDelPass] = useState('');
  const [busyDel, setBusyDel] = useState(false);
  const [whUrl, setWhUrl] = useState('');
  const [whSecretPreview, setWhSecretPreview] = useState<string | null>(null);
  const [whAllowed, setWhAllowed] = useState(false);
  const [whHasExisting, setWhHasExisting] = useState(false);
  const [busyWh, setBusyWh] = useState(false);
  const [busyUpgrade, setBusyUpgrade] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [tkProvider, setTkProvider] = useState<'zendesk' | 'freshdesk'>('zendesk');
  const [tkSubdomain, setTkSubdomain] = useState('');
  const [tkEmail, setTkEmail] = useState('');
  const [tkApiToken, setTkApiToken] = useState('');
  const [tkAllowed, setTkAllowed] = useState(false);
  const [tkConfigured, setTkConfigured] = useState(false);
  const [tkHasToken, setTkHasToken] = useState(false);
  const [tkHasExisting, setTkHasExisting] = useState(false);
  const [busyTk, setBusyTk] = useState(false);
  const [busyTkUpgrade, setBusyTkUpgrade] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [slackAllowed, setSlackAllowed] = useState(false);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [slackHasExisting, setSlackHasExisting] = useState(false);
  const [busySlack, setBusySlack] = useState(false);
  const [busySlackTest, setBusySlackTest] = useState(false);
  const [busySlackUpgrade, setBusySlackUpgrade] = useState(false);

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
        if (!d) return;
        setWhAllowed(Boolean(d.allowed));
        setWhHasExisting(Boolean(d.hasExistingConfig));
        if (d.allowed && d.url != null) setWhUrl(d.url || '');
        setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      })
      .catch(() => {});
    fetch('/api/user/escalation-ticket')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setTkAllowed(Boolean(d.planEligible));
        setTkConfigured(Boolean(d.configured));
        setTkHasExisting(Boolean(d.hasExistingConfig));
        const integ = d.integration as {
          provider?: string;
          subdomain?: string;
          email?: string;
          hasApiToken?: boolean;
        } | null;
        if (integ) {
          setTkProvider(integ.provider === 'freshdesk' ? 'freshdesk' : 'zendesk');
          setTkSubdomain(typeof integ.subdomain === 'string' ? integ.subdomain : '');
          setTkEmail(typeof integ.email === 'string' ? integ.email : '');
          setTkHasToken(Boolean(integ.hasApiToken));
        }
      })
      .catch(() => {});
    fetch('/api/user/escalation-slack')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSlackAllowed(Boolean(d.planEligible));
        setSlackConfigured(Boolean(d.configured));
        setSlackHasExisting(Boolean(d.hasExistingConfig));
      })
      .catch(() => {});
  }, [user?.uid, fetchAudit]);

  async function upgradeForWebhook() {
    setBusyUpgrade(true);
    try {
      const err = await startCheckout('starter');
      if (err && 'error' in err && err.error) toast.error(err.error);
    } finally {
      setBusyUpgrade(false);
    }
  }

  async function upgradeForSlack() {
    setBusySlackUpgrade(true);
    try {
      const err = await startCheckout('team');
      if (err && 'error' in err && err.error) toast.error(err.error);
    } finally {
      setBusySlackUpgrade(false);
    }
  }

  async function upgradeForTickets() {
    setBusyTkUpgrade(true);
    try {
      const err = await startCheckout('growth');
      if (err && 'error' in err && err.error) toast.error(err.error);
    } finally {
      setBusyTkUpgrade(false);
    }
  }

  async function saveEscalationTicket(e: React.FormEvent) {
    e.preventDefault();
    setBusyTk(true);
    try {
      const r = await fetch('/api/user/escalation-ticket', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: tkProvider,
          subdomain: tkSubdomain.trim(),
          email: tkEmail.trim(),
          ...(tkApiToken.trim() ? { apiToken: tkApiToken.trim() } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'No se pudo guardar la integración.');
        return;
      }
      toast.success('Integración de tickets guardada.');
      setTkConfigured(true);
      setTkHasExisting(true);
      setTkHasToken(true);
      setTkApiToken('');
    } finally {
      setBusyTk(false);
    }
  }

  async function clearEscalationTicket() {
    setBusyTk(true);
    try {
      const r = await fetch('/api/user/escalation-ticket', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'No se pudo eliminar.');
        return;
      }
      toast.success('Integración eliminada.');
      setTkConfigured(false);
      setTkHasExisting(false);
      setTkHasToken(false);
      setTkSubdomain('');
      setTkEmail('');
      setTkApiToken('');
    } finally {
      setBusyTk(false);
    }
  }

  async function saveEscalationSlack(e: React.FormEvent) {
    e.preventDefault();
    setBusySlack(true);
    try {
      const r = await fetch('/api/user/escalation-slack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: slackUrl.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'No se pudo guardar.');
        return;
      }
      toast.success(slackUrl.trim() ? 'Slack configurado.' : 'Slack desactivado.');
      setSlackConfigured(Boolean(slackUrl.trim()));
      setSlackHasExisting(Boolean(slackUrl.trim()));
    } finally {
      setBusySlack(false);
    }
  }

  async function testEscalationSlack() {
    setBusySlackTest(true);
    try {
      const r = await fetch('/api/user/escalation-slack', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'La prueba falló.');
        return;
      }
      toast.success(d.message || 'Mensaje de prueba enviado.');
    } finally {
      setBusySlackTest(false);
    }
  }

  async function clearEscalationSlack() {
    setBusySlack(true);
    try {
      const r = await fetch('/api/user/escalation-slack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      if (!r.ok) {
        toast.error('No se pudo eliminar.');
        return;
      }
      toast.success('Slack desvinculado.');
      setSlackUrl('');
      setSlackConfigured(false);
      setSlackHasExisting(false);
    } finally {
      setBusySlack(false);
    }
  }

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
      if (!r.ok) {
        if (d.code === 'OUTBOUND_WEBHOOK_REQUIRES_STARTER') {
          toast.error(d.error || `Requiere plan ${outboundWebhookUpgradeLabel()}.`);
        } else {
          toast.error(d.error || 'No se pudo guardar.');
        }
        return;
      }
      toast.success('Webhook guardado.');
      setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      if (typeof d.secretPlain === 'string') setRevealedSecret(d.secretPlain);
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
      if (typeof d.secretPlain === 'string') setRevealedSecret(d.secretPlain);
    } finally { setBusyWh(false); }
  }

  async function deleteAccount() {
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
    } finally { setBusyDel(false); setShowDeleteConfirm(false); }
  }

  const inp: React.CSSProperties = {
    display: 'block', width: '100%',
    padding: '10px 12px', borderRadius: 10,
    background: 'var(--muted)',
    border: '1px solid var(--border)',
    color: 'var(--foreground)', fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
  };

  const grouped = groupAuditEntries(audit);
  const totalEvents = audit.length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px 80px' }}>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar cuenta"
        description="¿Eliminar definitivamente tu cuenta y datos en esta plataforma? Esta acción no se puede deshacer."
        confirmLabel="Eliminar cuenta"
        variant="danger"
        loading={busyDel}
        onConfirm={() => void deleteAccount()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <SecretRevealModal
        open={revealedSecret !== null}
        title="Secreto HMAC del webhook"
        description="Copia y guarda este secreto en un lugar seguro. Lo usarás para verificar la firma X-BotIvA-Signature."
        secret={revealedSecret ?? ''}
        onClose={() => setRevealedSecret(null)}
      />

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          Cuenta
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10, gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--foreground)' }}>
              <Shield size={22} style={{ color: '#000', opacity: 0.8 }} aria-hidden />
              Cumplimiento y datos
            </h1>
            <p style={{ margin: '10px 0 0', color: 'var(--muted-foreground)', maxWidth: 560, fontSize: 13.5, lineHeight: 1.65 }}>
              Exporta tus datos, elimina tu cuenta, revisa el historial de auditoría, configura webhooks
              con firma HMAC (<code style={{ fontSize: 12 }}>X-BotIvA-Signature</code>) y tickets automáticos al escalar.
            </p>
          </div>
          {!loadingAudit && totalEvents > 0 && (
            <div style={{
              flexShrink: 0, padding: '12px 18px', borderRadius: 12,
              background: 'rgba(var(--brand-cool-rgb),0.08)',
              border: '1px solid rgba(var(--brand-cool-rgb),0.25)',
              textAlign: 'right',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: '#000' }}>{totalEvents}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, whiteSpace: 'nowrap' }}>eventos recientes</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Data rights — 2 columns ──────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Export — blue */}
          <SectionCard icon={<Download size={14} />} title="Exportar mis datos" accent="var(--brand-cool)">
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.65 }}>
              Descarga un JSON con perfil, suscripción, widgets, agentes, uso mensual y últimas entradas de auditoría.
            </p>
            <button
              type="button"
              disabled={busyExport}
              onClick={() => void downloadExport()}
              onMouseEnter={(e) => {
                if (!busyExport) {
                  e.currentTarget.style.background = 'rgba(var(--brand-cool-rgb),0.18)';
                  e.currentTarget.style.borderColor = 'rgba(var(--brand-cool-rgb),0.5)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(var(--brand-cool-rgb),0.1)';
                e.currentTarget.style.borderColor = 'rgba(var(--brand-cool-rgb),0.35)';
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10,
                border: '1px solid rgba(var(--brand-cool-rgb),0.35)',
                background: 'rgba(var(--brand-cool-rgb),0.1)',
                color: '#000',
                cursor: busyExport ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {busyExport ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
              Descargar JSON
            </button>
          </SectionCard>

          {/* Delete — red */}
          <SectionCard icon={<Trash2 size={14} />} title="Borrar cuenta" accent="var(--primary)">
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.65 }}>
              Elimina widgets, agentes, uso almacenado y tu usuario de esta plataforma.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                Email de confirmación
                <input type="email" required value={delEmail} onChange={(e) => setDelEmail(e.target.value)}
                  style={{ ...inp, marginTop: 5 }} autoComplete="email" />
              </label>
              <label style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                Contraseña actual
                <input type="password" required value={delPass} onChange={(e) => setDelPass(e.target.value)}
                  style={{ ...inp, marginTop: 5 }} autoComplete="current-password" />
              </label>
              <button
                type="submit" disabled={busyDel}
                style={{
                  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginTop: 4, padding: '9px 16px', borderRadius: 10,
                  border: '1px solid rgba(var(--brand-primary-rgb),0.45)',
                  background: 'rgba(var(--brand-primary-rgb),0.1)',
                  color: 'var(--primary)',
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

        {/* ── Webhook — orange ─────────────────────────────────── */}
        <SectionCard icon={<Webhook size={14} />} title="Webhook SaaS (saliente)" accent="var(--brand-warm)">

          {!whAllowed ? (
            <div style={{
              marginBottom: 18, padding: '14px 16px', borderRadius: 10,
              background: 'rgba(var(--brand-warm-rgb),0.08)', border: '1px solid rgba(var(--brand-warm-rgb),0.28)',
            }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--foreground)', lineHeight: 1.55 }}>
                Recibe eventos firmados (<code style={{ fontSize: 12 }}>X-BotIvA-Signature</code>) en tu backend.
                Disponible desde el plan <strong>{outboundWebhookUpgradeLabel()}</strong>.
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                El webhook del agente (tu agente llama una URL durante el chat) sigue disponible desde Solo.
              </p>
              <button
                type="button"
                disabled={busyUpgrade}
                onClick={() => void upgradeForWebhook()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 10,
                  border: '1px solid rgba(var(--brand-warm-rgb),0.4)',
                  background: 'rgba(var(--brand-warm-rgb),0.12)',
                  color: '#c45a00', cursor: busyUpgrade ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busyUpgrade ? <Loader2 className="animate-spin" size={14} /> : null}
                Mejorar a {outboundWebhookUpgradeLabel()}
              </button>
              <Link
                href="/pricing"
                style={{ marginLeft: 12, fontSize: 12, color: '#c45a00', textDecoration: 'underline' }}
              >
                Ver planes
              </Link>
            </div>
          ) : null}

          {whHasExisting && !whAllowed ? (
            <p style={{
              margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)',
              padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              Tienes una URL guardada pero tu plan actual no incluye envío de eventos. Mejora a {outboundWebhookUpgradeLabel()} para reactivarla.
            </p>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18, opacity: whAllowed ? 1 : 0.55 }}>
            {/* Events panel */}
            <div style={{
              padding: '11px 14px', borderRadius: 10,
              background: 'rgba(var(--brand-warm-rgb),0.08)', border: '1px solid rgba(var(--brand-warm-rgb),0.28)',
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, color: '#c45a00', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Eventos emitidos
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {['conversation.closed', 'conversation.escalation', 'conversation.handoff', 'quota.reached'].map((ev) => (
                  <code key={ev} style={{
                    padding: '3px 8px', borderRadius: 5,
                    background: 'rgba(var(--brand-warm-rgb),0.12)', border: '1px solid rgba(var(--brand-warm-rgb),0.35)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 11, color: '#b45300', fontWeight: 600,
                  }}>
                    {ev}
                  </code>
                ))}
              </div>
            </div>
            {/* Payload panel */}
            <div style={{
              padding: '11px 14px', borderRadius: 10,
              background: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Payload · Firma
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {['event', 'timestamp', 'userId', 'data'].map((f) => (
                  <code key={f} style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 11,
                    background: 'var(--muted)', color: 'var(--muted-foreground)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    border: '1px solid var(--border)',
                  }}>
                    {f}
                  </code>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)', opacity: 0.6, fontFamily: 'ui-monospace, monospace' }}>
                X-BotIvA-Signature: sha256=…
              </p>
            </div>
          </div>

          <form onSubmit={saveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: whAllowed ? 1 : 0.55 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                URL de destino
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder="https://api.tu-saas.com/webhooks/BotIvA"
                  disabled={!whAllowed || busyWh}
                  style={{ ...inp, flex: 1, minWidth: 0, opacity: whAllowed ? 1 : 0.7 }}
                />
                <button
                  type="submit"
                  disabled={!whAllowed || busyWh}
                  onMouseEnter={(e) => { if (!busyWh) e.currentTarget.style.background = 'rgba(var(--brand-warm-rgb),0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--brand-warm-rgb),0.1)'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 16px', borderRadius: 10, flexShrink: 0,
                    border: '1px solid rgba(var(--brand-warm-rgb),0.4)',
                    background: 'rgba(var(--brand-warm-rgb),0.1)',
                    color: '#c45a00',
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

            {whAllowed && whSecretPreview ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '11px 14px', borderRadius: 10,
                background: 'rgba(var(--brand-warm-rgb),0.06)', border: '1px solid rgba(var(--brand-warm-rgb),0.28)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Lock size={13} style={{ color: 'var(--brand-warm)', opacity: 0.85, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Secreto HMAC-SHA256
                    </p>
                    <code style={{
                      fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      color: 'var(--foreground)', letterSpacing: '0.04em',
                    }}>
                      {whSecretPreview}
                    </code>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!whAllowed || busyWh}
                  onClick={() => void rotateSecret()}
                  onMouseEnter={(e) => { if (!busyWh) e.currentTarget.style.background = 'rgba(var(--brand-warm-rgb),0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 8, flexShrink: 0,
                    border: '1px solid rgba(var(--brand-warm-rgb),0.35)',
                    background: 'transparent', color: '#c45a00',
                    cursor: busyWh ? 'wait' : 'pointer',
                    fontSize: 12, fontWeight: 600, transition: 'background 0.15s',
                  }}
                >
                  <RefreshCw size={12} /> Rotar
                </button>
              </div>
            ) : whAllowed ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 14px', borderRadius: 10,
                background: 'var(--muted)', border: '1px dashed var(--border)',
                fontSize: 13, color: 'var(--muted-foreground)',
              }}>
                <Lock size={13} />
                Al guardar una URL válida se generará un secreto de firma automáticamente.
              </div>
            ) : null}
          </form>
        </SectionCard>

        {/* ── Escalation tickets — cool ─────────────────────────── */}
        <SectionCard icon={<Ticket size={14} />} title="Tickets al escalar (Zendesk / Freshdesk)" accent="var(--brand-cool)">

          {!tkAllowed ? (
            <div style={{
              marginBottom: 18, padding: '14px 16px', borderRadius: 10,
              background: 'rgba(var(--brand-cool-rgb),0.08)', border: '1px solid rgba(var(--brand-cool-rgb),0.28)',
            }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--foreground)', lineHeight: 1.55 }}>
                Cuando un visitante pulse <strong>Hablar con una persona</strong> en el widget, BotIvA puede crear
                un ticket en tu helpdesk con el transcript y los datos de contacto.
                Disponible desde el plan <strong>{escalationTicketUpgradeLabel()}</strong>.
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                También puedes avisar en <strong>Slack</strong> (sección siguiente) o usar el webhook{' '}
                <code style={{ fontSize: 11 }}>conversation.escalation</code> con n8n.
              </p>
              <button
                type="button"
                disabled={busyTkUpgrade}
                onClick={() => void upgradeForTickets()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 10,
                  border: '1px solid rgba(var(--brand-cool-rgb),0.4)',
                  background: 'rgba(var(--brand-cool-rgb),0.12)',
                  color: 'var(--brand-cool)', cursor: busyTkUpgrade ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busyTkUpgrade ? <Loader2 className="animate-spin" size={14} /> : null}
                Mejorar a {escalationTicketUpgradeLabel()}
              </button>
              <Link
                href="/pricing"
                style={{ marginLeft: 12, fontSize: 12, color: 'var(--brand-cool)', textDecoration: 'underline' }}
              >
                Ver planes
              </Link>
            </div>
          ) : null}

          {tkHasExisting && !tkAllowed ? (
            <p style={{
              margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)',
              padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              Tienes credenciales guardadas pero tu plan actual no incluye tickets automáticos.
              Mejora a {escalationTicketUpgradeLabel()} para reactivarlas.
            </p>
          ) : null}

          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6, opacity: tkAllowed ? 1 : 0.55 }}>
            Las escalaciones también aparecen en <Link href="/dashboard/inbox" style={{ color: 'var(--brand-cool)' }}>Inbox</Link>.
            El ticket incluye contacto del visitante y transcript de la conversación.
          </p>

          <form onSubmit={saveEscalationTicket} style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: tkAllowed ? 1 : 0.55 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Proveedor
                </p>
                <select
                  value={tkProvider}
                  onChange={(e) => setTkProvider(e.target.value === 'freshdesk' ? 'freshdesk' : 'zendesk')}
                  disabled={!tkAllowed || busyTk}
                  style={{ ...inp, cursor: tkAllowed ? 'pointer' : 'not-allowed' }}
                >
                  <option value="zendesk">Zendesk</option>
                  <option value="freshdesk">Freshdesk</option>
                </select>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Subdominio
                </p>
                <input
                  type="text"
                  value={tkSubdomain}
                  onChange={(e) => setTkSubdomain(e.target.value)}
                  placeholder={tkProvider === 'freshdesk' ? 'mi-empresa' : 'mi-empresa'}
                  disabled={!tkAllowed || busyTk}
                  style={inp}
                />
                <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
                  {tkProvider === 'freshdesk'
                    ? 'mi-empresa.freshdesk.com'
                    : 'mi-empresa.zendesk.com'}
                </p>
              </div>
            </div>

            {tkProvider === 'zendesk' ? (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Email agente API (Zendesk)
                </p>
                <input
                  type="email"
                  value={tkEmail}
                  onChange={(e) => setTkEmail(e.target.value)}
                  placeholder="agente@tu-empresa.com"
                  disabled={!tkAllowed || busyTk}
                  style={inp}
                />
              </div>
            ) : null}

            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                API token
              </p>
              <input
                type="password"
                value={tkApiToken}
                onChange={(e) => setTkApiToken(e.target.value)}
                placeholder={tkHasToken ? '•••••••• (dejar vacío para mantener)' : 'Pega tu API token'}
                disabled={!tkAllowed || busyTk}
                style={inp}
                autoComplete="off"
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                disabled={!tkAllowed || busyTk}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid rgba(var(--brand-cool-rgb),0.4)',
                  background: 'rgba(var(--brand-cool-rgb),0.1)',
                  color: 'var(--brand-cool)',
                  cursor: busyTk ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busyTk ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Guardar integración
              </button>
              {tkConfigured ? (
                <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Configurado</span>
              ) : null}
              {tkHasExisting && tkAllowed ? (
                <button
                  type="button"
                  disabled={busyTk}
                  onClick={() => void clearEscalationTicket()}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600,
                    cursor: busyTk ? 'wait' : 'pointer',
                  }}
                >
                  Eliminar integración
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        {/* ── Slack escalation — purple/indigo accent via warm-cool mix ───── */}
        <SectionCard icon={<MessageSquare size={14} />} title="Avisar en Slack al escalar" accent="#611f69">

          {!slackAllowed ? (
            <div style={{
              marginBottom: 18, padding: '14px 16px', borderRadius: 10,
              background: 'rgba(97,31,105,0.08)', border: '1px solid rgba(97,31,105,0.22)',
            }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--foreground)', lineHeight: 1.55 }}>
                Publica un mensaje en tu canal de Slack cuando alguien pulse <strong>Hablar con una persona</strong>.
                Disponible desde el plan <strong>{escalationSlackUpgradeLabel()}</strong>.
              </p>
              <button
                type="button"
                disabled={busySlackUpgrade}
                onClick={() => void upgradeForSlack()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 16px', borderRadius: 10,
                  border: '1px solid rgba(97,31,105,0.35)',
                  background: 'rgba(97,31,105,0.1)',
                  color: '#611f69', cursor: busySlackUpgrade ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busySlackUpgrade ? <Loader2 className="animate-spin" size={14} /> : null}
                Mejorar a {escalationSlackUpgradeLabel()}
              </button>
            </div>
          ) : null}

          {slackHasExisting && !slackAllowed ? (
            <p style={{
              margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)',
              padding: '10px 12px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)',
            }}>
              Tienes un webhook de Slack guardado pero tu plan actual no incluye notificaciones al escalar.
            </p>
          ) : null}

          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6, opacity: slackAllowed ? 1 : 0.55 }}>
            Crea un <strong>Incoming Webhook</strong> en tu workspace de Slack
            (Apps → Incoming WebHooks → elegir canal) y pega la URL aquí.
            El mensaje incluye contacto, mensaje del visitante y transcript.
          </p>

          <form onSubmit={saveEscalationSlack} style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: slackAllowed ? 1 : 0.55 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Incoming Webhook URL
              </p>
              <input
                type="url"
                value={slackUrl}
                onChange={(e) => setSlackUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T…/B…/…"
                disabled={!slackAllowed || busySlack}
                style={inp}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                disabled={!slackAllowed || busySlack}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', borderRadius: 10,
                  border: '1px solid rgba(97,31,105,0.35)',
                  background: 'rgba(97,31,105,0.1)',
                  color: '#611f69',
                  cursor: busySlack ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {busySlack ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Guardar
              </button>
              {(slackConfigured || slackUrl.trim()) && slackAllowed ? (
                <button
                  type="button"
                  disabled={busySlackTest || busySlack}
                  onClick={() => void testEscalationSlack()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    fontSize: 13, fontWeight: 600, cursor: busySlackTest ? 'wait' : 'pointer',
                  }}
                >
                  {busySlackTest ? <Loader2 className="animate-spin" size={14} /> : null}
                  Enviar prueba
                </button>
              ) : null}
              {slackConfigured ? (
                <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Activo</span>
              ) : null}
              {slackHasExisting && slackAllowed ? (
                <button
                  type="button"
                  disabled={busySlack}
                  onClick={() => void clearEscalationSlack()}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600,
                    cursor: busySlack ? 'wait' : 'pointer',
                  }}
                >
                  Desvincular
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        {/* ── Audit log — orange ────────────────────────────────── */}
        <SectionCard
          icon={<ClipboardList size={14} />}
          title="Registro de auditoría"
          accent="var(--brand-warm)"
          headerAction={
            !loadingAudit ? (
              <button
                type="button"
                onClick={() => void fetchAudit()}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(var(--brand-warm-rgb),0.1)';
                  e.currentTarget.style.color = 'var(--brand-warm)';
                  e.currentTarget.style.borderColor = 'rgba(var(--brand-warm-rgb),0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--muted-foreground)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--muted-foreground)',
                  cursor: 'pointer', fontSize: 11,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
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
                  background: 'var(--muted)',
                  animation: 'pulse 1.6s ease-in-out infinite',
                  animationDelay: `${i * 0.08}s`,
                }} />
              ))}
            </div>
          ) : audit.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 0', color: 'var(--muted-foreground)', opacity: 0.6 }}>
              <ClipboardList size={28} style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: 13 }}>Sin entradas de auditoría todavía.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
              {grouped.map(({ dayKey, label, groups }) => (
                <div key={dayKey} style={{ marginBottom: 8 }}>
                  {/* Day separator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-warm)', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(var(--brand-warm-rgb),0.2)' }} />
                    <span style={{ fontSize: 10, color: 'var(--brand-warm)', opacity: 0.7, whiteSpace: 'nowrap' }}>
                      {groups.reduce((s, g) => s + g.count, 0)} eventos
                    </span>
                  </div>

                  {/* Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {groups.map((g) => (
                      <div
                        key={g.key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 9,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--muted)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        <ActionBadge action={g.action} />

                        <span style={{
                          fontSize: 12, color: 'var(--muted-foreground)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          flex: 1, minWidth: 0,
                        }}>
                          {g.resource || '—'}
                        </span>

                        {g.count > 1 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            padding: '2px 7px', borderRadius: 20,
                            background: 'rgba(var(--brand-warm-rgb),0.1)', border: '1px solid rgba(var(--brand-warm-rgb),0.25)',
                            color: 'var(--brand-warm)', flexShrink: 0, whiteSpace: 'nowrap',
                          }}>
                            ×{g.count}
                          </span>
                        )}

                        {g.ip && g.ip !== '—' && (
                          <code style={{
                            padding: '2px 7px', borderRadius: 5, fontSize: 10.5,
                            background: 'var(--muted)', border: '1px solid var(--border)',
                            color: 'var(--muted-foreground)', flexShrink: 0,
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          }}>
                            {g.ip}
                          </code>
                        )}

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(g.newestAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {g.count > 1 && (
                            <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)', opacity: 0.6, whiteSpace: 'nowrap', marginTop: 1 }}>
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
