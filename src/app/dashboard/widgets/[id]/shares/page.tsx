'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Share2, Plus, Copy, Check, Trash2, Clock, Globe, KeyRound, AlertCircle } from '@/components/ui/icons';

type DurationUnit = 'hours' | 'days' | 'weeks' | 'months' | 'never';

interface ShareItem {
  shareId:       string;
  label:         string;
  active:        boolean;
  expired:       boolean;
  expiresAt:     string;
  durationValue: number;
  durationUnit:  DurationUnit;
  permanent:     boolean;
  /** Lo decide el servidor: duradero + activo + vigente. */
  instalable:    boolean;
  createdAt:     string;
}

interface NewShare {
  shareId:   string;
  password:  string;
  expiresAt: string;
  url:       string;
}

const UNIT_LABELS: Record<DurationUnit, string> = {
  hours:  'horas',
  days:   'días',
  weeks:  'semanas',
  months: 'meses',
  never:  'sin caducidad',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Caducado';
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h restantes`;
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m restantes`;
}

export default function SharesPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [widgetName, setWidgetName]   = useState('');
  const [shares, setShares]           = useState<ShareItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [revoking, setRevoking]       = useState<string | null>(null);
  const [newShare, setNewShare]       = useState<NewShare | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form
  const [durValue, setDurValue] = useState(8);
  const [durUnit, setDurUnit]   = useState<DurationUnit>('hours');
  const [label, setLabel]       = useState('');

  async function loadShares() {
    try {
      const res  = await fetch(`/api/widgets/${id}/shares`);
      if (!res.ok) { toast.error('No se pudieron cargar los enlaces.'); return; }
      const data = await res.json() as { widgetName: string; shares: ShareItem[] };
      setWidgetName(data.widgetName);
      setShares(data.shares);
    } catch { toast.error('Error de red.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadShares(); }, [id]);

  async function createShare() {
    setCreating(true);
    try {
      const res  = await fetch(`/api/widgets/${id}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationValue: durValue, durationUnit: durUnit, label: label.trim() }),
      });
      const data = await res.json() as { shareId?: string; password?: string; expiresAt?: string; error?: string };
      if (!res.ok || !data.shareId) { toast.error(data.error ?? 'Error al crear el enlace.'); return; }
      setNewShare({
        shareId:   data.shareId,
        password:  data.password!,
        expiresAt: data.expiresAt!,
        url:       `${window.location.origin}/share/${data.shareId}`,
      });
      setLabel('');
      await loadShares();
    } catch { toast.error('Error de red.'); }
    finally { setCreating(false); }
  }

  async function revokeShare(shareId: string) {
    setRevoking(shareId);
    try {
      const res = await fetch(`/api/widgets/${id}/shares/${shareId}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('No se pudo revocar el enlace.'); return; }
      toast.success('Enlace revocado.');
      setShares(prev => prev.map(s => s.shareId === shareId ? { ...s, active: false } : s));
    } catch { toast.error('Error de red.'); }
    finally { setRevoking(null); }
  }

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  function statusBadge(share: ShareItem) {
    if (!share.active) return { label: 'Revocado', color: '#64748b', bg: 'rgba(100,116,139,0.12)' };
    if (share.expired) return { label: 'Expirado', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' };
    return { label: 'Activo', color: '#22c55e', bg: 'rgba(34,197,94,0.10)' };
  }

  const activeCount  = shares.filter(s => s.active && !s.expired).length;
  const expiredCount = shares.filter(s => s.expired || !s.active).length;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button
          type="button"
          onClick={() => router.push('/dashboard/widgets')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', fontSize: 13 }}
        >
          <ArrowLeft size={16} /> Widgets
        </button>
        <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>/</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Share2 size={16} style={{ color: '#6366f1' }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {widgetName ? `${widgetName} — enlaces compartidos` : 'Gestionar enlaces compartidos'}
          </span>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Activos',   value: activeCount,        color: '#22c55e' },
            { label: 'Expirados', value: expiredCount,       color: '#64748b' },
            { label: 'Total',     value: shares.length,      color: '#6366f1' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New share created — one-time display */}
      {newShare && (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertCircle size={16} style={{ color: '#22c55e' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#22c55e' }}>Enlace creado — guarda estos datos ahora</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 14, lineHeight: 1.5 }}>
            La contraseña <strong>no se puede recuperar</strong> después de cerrar este panel. Cópiala y compártela junto con la URL.
          </p>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 5 }}>URL de acceso</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input readOnly value={newShare.url}
              onClick={e => (e.target as HTMLInputElement).select()}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
            <button type="button" onClick={() => copy(newShare.url, 'new-url')}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
              {copiedField === 'new-url' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 5 }}>Contraseña de acceso</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <input readOnly value={newShare.password}
              onClick={e => (e.target as HTMLInputElement).select()}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.1em', outline: 'none' }} />
            <button type="button" onClick={() => copy(newShare.password, 'new-pw')}
              style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
              {copiedField === 'new-pw' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 14 }}>
            <Clock size={12} /> Expira: {formatDate(newShare.expiresAt)}
          </div>

          <button type="button" onClick={() => setNewShare(null)}
            style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Ya lo guardé — cerrar
          </button>
        </div>
      )}

      {/* Create form */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={15} style={{ color: '#6366f1' }} /> Nuevo enlace compartido
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {/* Duration value */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)' }}>Duración</label>
            <input
              type="number" min={1} max={365} value={durValue}
              onChange={e => setDurValue(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: 14, outline: 'none' }}
            />
          </div>

          {/* Duration unit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)' }}>Unidad</label>
            <select value={durUnit} onChange={e => setDurUnit(e.target.value as DurationUnit)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: 14, cursor: 'pointer', outline: 'none' }}>
              <option value="hours">Horas</option>
              <option value="days">Días</option>
              <option value="weeks">Semanas</option>
              <option value="months">Meses</option>
              <option value="never">Sin caducidad</option>
            </select>
          </div>

          {/* Label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)' }}>Etiqueta (opcional)</label>
            <input
              type="text" value={label} maxLength={60}
              onChange={e => setLabel(e.target.value)}
              placeholder="ej. Cliente Acme, Demo Q2…"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--foreground)', fontSize: 13, outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 14 }}>
          <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
          {durUnit === 'never'
            ? 'El enlace no caduca: solo deja de funcionar cuando lo revocas. Es el único tipo que se puede instalar como app en el móvil — un icono en la pantalla de inicio tiene que seguir ahí mañana.'
            : `El enlace expirará ${durValue} ${UNIT_LABELS[durUnit]} después de crearlo. Por defecto: 8 horas.`}
        </div>

        <button type="button" onClick={() => void createShare()} disabled={creating}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: creating ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} />
          {creating ? 'Creando…' : 'Crear enlace'}
        </button>
      </div>

      {/* Shares list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>Cargando…</div>
      ) : shares.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)', border: '1px dashed var(--border)', borderRadius: 12 }}>
          <Share2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: 14 }}>No hay enlaces aún. Crea el primero.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shares.map(share => {
            const status = statusBadge(share);
            const isLive = share.active && !share.expired;
            const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${share.shareId}`;
            return (
              <div key={share.shareId} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, opacity: isLive ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                        {share.label || share.shareId}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        {share.permanent
                          ? 'Sin caducidad'
                          : isLive ? timeLeft(share.expiresAt) : `Expiró: ${formatDate(share.expiresAt)}`}
                      </span>
                      <span>Creado: {formatDate(share.createdAt)}</span>
                      {share.permanent ? null : <span>{share.durationValue} {UNIT_LABELS[share.durationUnit]}</span>}
                      {share.instalable ? <span style={{ color: 'var(--brand-primary)' }}>Instalable como app</span> : null}
                    </div>
                  </div>

                  {isLive && (
                    <button type="button" onClick={() => void revokeShare(share.shareId)} disabled={revoking === share.shareId}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Trash2 size={12} />
                      {revoking === share.shareId ? 'Revocando…' : 'Revocar'}
                    </button>
                  )}
                </div>

                {/* URL row */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', overflow: 'hidden' }}>
                    <Globe size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {shareUrl}
                    </span>
                  </div>
                  <button type="button" onClick={() => copy(shareUrl, `url-${share.shareId}`)}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                    {copiedField === `url-${share.shareId}` ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> URL</>}
                  </button>
                  {isLive && (
                    <a href={shareUrl} target="_blank" rel="noreferrer"
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6366f1', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                      <KeyRound size={11} /> Abrir
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
