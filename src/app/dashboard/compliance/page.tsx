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
} from 'lucide-react';

type AuditEntry = {
  id: string;
  action: string;
  resource: string;
  meta: Record<string, unknown>;
  ip: string;
  createdAt: string;
};

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
      .then((d) => {
        if (d?.entries) setAudit(d.entries);
      })
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
      if (!r.ok) {
        toast.error('No se pudo generar la exportación.');
        return;
      }
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition');
      const nameMatch = cd?.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] || 'export-datos.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Descarga iniciada.');
      const refetch = await fetch('/api/user/audit-log?limit=80').then((x) => x.json());
      if (refetch?.entries) setAudit(refetch.entries);
    } finally {
      setBusyExport(false);
    }
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
        toast.error(d.error || 'No se pudo guardar.');
        return;
      }
      toast.success('Webhook guardado.');
      setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      if (d.secretPlain) {
        toast.message(`Secreto (guárdalo ahora): ${d.secretPlain}`, { duration: 20_000 });
      }
    } finally {
      setBusyWh(false);
    }
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
      if (!r.ok) {
        toast.error(d.error || 'Error');
        return;
      }
      toast.success('Secreto rotado.');
      setWhSecretPreview(typeof d.secretPreview === 'string' ? d.secretPreview : null);
      if (d.secretPlain) {
        toast.message(`Nuevo secreto: ${d.secretPlain}`, { duration: 25_000 });
      }
    } finally {
      setBusyWh(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm('¿Eliminar definitivamente tu cuenta y datos en esta plataforma? Esta acción no se puede deshacer.')) {
      return;
    }
    setBusyDel(true);
    try {
      const r = await fetch('/api/gdpr/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: delEmail.trim(), password: delPass }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error || 'No se pudo eliminar.');
        return;
      }
      toast.success(d.message || 'Cuenta eliminada.');
      window.location.href = '/';
    } finally {
      setBusyDel(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.75 }}>
          Cuenta
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={26} aria-hidden />
          Cumplimiento y datos (RGPD)
        </h1>
        <p style={{ margin: '10px 0 0', opacity: 0.88, maxWidth: 720 }}>
          Exportación portable de tus datos, borrado de cuenta, historial de auditoría y webhooks salientes para integrar
          eventos con tu backend SaaS (firma HMAC en cabecera <code>X-Matias-Signature</code>).
        </p>
      </div>

      <section className="card-texture" style={{ padding: 20, borderRadius: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.14)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={18} /> Exportar mis datos
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 14, opacity: 0.88 }}>
          Descarga un JSON con perfil, suscripción, widgets, agentes (metadatos), uso mensual y últimas entradas de
          auditoría.
        </p>
        <button
          type="button"
          disabled={busyExport}
          onClick={() => void downloadExport()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(15,23,42,0.35)',
            color: '#f8fafc',
            cursor: busyExport ? 'wait' : 'pointer',
          }}
        >
          {busyExport ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
          Descargar JSON
        </button>
      </section>

      <section className="card-texture" style={{ padding: 20, borderRadius: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.14)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trash2 size={18} /> Borrar cuenta
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 14, opacity: 0.88 }}>
          Elimina widgets, agentes de esta cuenta, uso almacenado y tu usuario. Los sistemas externos (AgentFlowhub /
          motor IA) pueden requerir coordinación adicional con soporte.
        </p>
        <form onSubmit={deleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <label style={{ fontSize: 13 }}>
            Email de confirmación (debe coincidir con tu cuenta)
            <input
              type="email"
              required
              value={delEmail}
              onChange={(e) => setDelEmail(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10 }}
              autoComplete="email"
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Contraseña actual
            <input
              type="password"
              required
              value={delPass}
              onChange={(e) => setDelPass(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10 }}
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            disabled={busyDel}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 16px',
              borderRadius: 12,
              border: '1px solid rgba(248,113,113,0.45)',
              background: 'rgba(127,29,29,0.35)',
              color: '#fecaca',
              cursor: busyDel ? 'wait' : 'pointer',
            }}
          >
            {busyDel ? <Loader2 className="animate-spin inline" size={18} /> : null} Eliminar mi cuenta
          </button>
        </form>
      </section>

      <section className="card-texture" style={{ padding: 20, borderRadius: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.14)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Webhook size={18} /> Webhook SaaS (saliente)
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 14, opacity: 0.88 }}>
          Eventos: <code>conversation.closed</code>, <code>conversation.handoff</code>, <code>quota.reached</code>.
          Cuerpo JSON con <code>event</code>, <code>timestamp</code>, <code>userId</code>, <code>data</code>. Verifica la
          firma HMAC-SHA256 hex con prefijo <code>sha256=</code> en <code>X-Matias-Signature</code> (mismo cuerpo raw).
        </p>
        <form onSubmit={saveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
          <label style={{ fontSize: 13 }}>
            URL HTTPS de tu backend
            <input
              type="url"
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              placeholder="https://api.tu-saas.com/webhooks/matias"
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10 }}
            />
          </label>
          {whSecretPreview ? (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
              Secreto configurado: <strong>{whSecretPreview}</strong>
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Al guardar una URL válida se generará un secreto para firmar.</p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="submit"
              disabled={busyWh}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(14,165,233,0.25)',
                color: '#e0f2fe',
                cursor: busyWh ? 'wait' : 'pointer',
              }}
            >
              Guardar URL
            </button>
            <button
              type="button"
              disabled={busyWh}
              onClick={() => void rotateSecret()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'transparent',
                color: '#cbd5e1',
                cursor: busyWh ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={16} /> Rotar secreto
            </button>
          </div>
        </form>
      </section>

      <section className="card-texture" style={{ padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.14)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardList size={18} /> Registro de auditoría
        </h2>
        {loadingAudit ? (
          <p style={{ opacity: 0.75 }}>Cargando…</p>
        ) : audit.length === 0 ? (
          <p style={{ opacity: 0.75 }}>Sin entradas todavía.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.8 }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Acción</th>
                  <th style={{ padding: '8px 6px' }}>Recurso</th>
                  <th style={{ padding: '8px 6px' }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      {new Date(a.createdAt).toLocaleString('es')}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{a.action}</td>
                    <td style={{ padding: '8px 6px' }}>{a.resource || '—'}</td>
                    <td style={{ padding: '8px 6px', opacity: 0.85 }}>{a.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
