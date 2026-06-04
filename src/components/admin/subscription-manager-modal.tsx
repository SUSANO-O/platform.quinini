'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Trash2, Save, RefreshCw } from 'lucide-react';
import { PLAN_ORDER, FEATURE_OVERRIDES, VALID_FEATURE_OVERRIDES, type PlanId } from '@/lib/plan-catalog';

const PLANS = [...PLAN_ORDER] as const;
const STATUSES = ['trialing', 'active', 'canceled', 'past_due', 'incomplete'] as const;

type Plan   = PlanId;
type Status = typeof STATUSES[number];

interface SubForm {
  plan: Plan;
  status: Status;
  trialStartedAt: string;
  trialEndsAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  lsCustomerId: string;
  lsSubscriptionId: string;
  /** Overrides de feature activados (claves de subscription.features). */
  features: string[];
  /** Override del límite de tareas ('' = usar el del plan; -1 = ilimitado). */
  scheduledTaskLimit: string;
}

const EMPTY_FORM: SubForm = {
  plan: 'team',
  status: 'trialing',
  trialStartedAt: '',
  trialEndsAt: '',
  currentPeriodStart: '',
  currentPeriodEnd: '',
  cancelAtPeriodEnd: false,
  lsCustomerId: '',
  lsSubscriptionId: '',
  features: [],
  scheduledTaskLimit: '',
};

function toDateInput(val: string | number | null | undefined): string {
  if (!val) return '';
  const d = typeof val === 'number' ? new Date(val * 1000) : new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function toEpochSec(val: string): number {
  if (!val) return 0;
  return Math.floor(new Date(val).getTime() / 1000);
}

interface Props {
  userId: string;
  userEmail: string;
  onClose: () => void;
  onSaved: (plan: string, status: string) => void;
}

export function SubscriptionManagerModal({ userId, userEmail, onClose, onSaved }: Props) {
  const [form, setForm] = useState<SubForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasSub, setHasSub] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/subscriptions/${userId}`)
      .then(r => r.json())
      .then(data => {
        const s = data.subscription;
        if (s) {
          setHasSub(true);
          setForm({
            plan:               s.plan            || 'plus',
            status:             s.status          || 'trialing',
            trialStartedAt:     toDateInput(s.trialStartedAt),
            trialEndsAt:        toDateInput(s.trialEndsAt),
            currentPeriodStart: toDateInput(s.currentPeriodStart),
            currentPeriodEnd:   toDateInput(s.currentPeriodEnd),
            cancelAtPeriodEnd:  s.cancelAtPeriodEnd ?? false,
            lsCustomerId:       s.lsCustomerId     || '',
            lsSubscriptionId:   s.lsSubscriptionId || '',
            features:           Array.isArray(s.features)
              ? s.features.filter((f: string) => VALID_FEATURE_OVERRIDES.includes(f))
              : [],
            scheduledTaskLimit: s.scheduledTaskLimit != null ? String(s.scheduledTaskLimit) : '',
          });
        } else {
          setHasSub(false);
          setForm(EMPTY_FORM);
        }
      })
      .catch(() => setError('Error cargando suscripción.'))
      .finally(() => setLoading(false));
  }, [userId]);

  function set<K extends keyof SubForm>(key: K, value: SubForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
    setError(''); setSuccess('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    const body = {
      plan:               form.plan,
      status:             form.status,
      trialStartedAt:     form.trialStartedAt || null,
      trialEndsAt:        form.trialEndsAt    || null,
      currentPeriodStart: form.currentPeriodStart ? toEpochSec(form.currentPeriodStart) : null,
      currentPeriodEnd:   form.currentPeriodEnd   ? toEpochSec(form.currentPeriodEnd)   : null,
      cancelAtPeriodEnd:  form.cancelAtPeriodEnd,
      lsCustomerId:       form.lsCustomerId      || null,
      lsSubscriptionId:   form.lsSubscriptionId  || null,
      features:           form.features,
      scheduledTaskLimit: form.scheduledTaskLimit.trim() === '' ? null : Number(form.scheduledTaskLimit),
    };
    const r = await fetch(`/api/admin/subscriptions/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setError(d.error || 'Error al guardar.'); return; }
    setHasSub(true);
    setSuccess(hasSub ? 'Suscripción actualizada.' : 'Suscripción creada.');
    onSaved(form.plan, form.status);
  }

  async function handleDelete() {
    setDeleting(true); setError('');
    const r = await fetch(`/api/admin/subscriptions/${userId}`, { method: 'DELETE' });
    const d = await r.json();
    setDeleting(false);
    if (!r.ok) { setError(d.error || 'Error al eliminar.'); return; }
    onSaved('—', 'no_sub');
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', fontSize: 13,
    background: 'var(--background)', color: 'var(--foreground)',
    boxSizing: 'border-box',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 };
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 0 };

  const STATUS_COLORS: Record<string, string> = {
    active: '#22c55e', trialing: '#3b82f6', canceled: '#ef4444', past_due: '#f59e0b', incomplete: '#94a3b8',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(2,6,23,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 'min(620px,100%)', borderRadius: 18, border: '1px solid var(--border)', background: 'var(--card)', boxShadow: '0 24px 70px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Gestionar suscripción</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{userEmail}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasSub && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: STATUS_COLORS[form.status] + '22', color: STATUS_COLORS[form.status], border: `1px solid ${STATUS_COLORS[form.status]}44` }}>
                {form.status}
              </span>
            )}
            {!hasSub && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Sin suscripción</span>}
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted-foreground)', borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted-foreground)' }} />
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Plan + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Plan</label>
                  <select style={selectStyle} value={form.plan} onChange={e => set('plan', e.target.value as Plan)}>
                    {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Estado</label>
                  <select style={selectStyle} value={form.status} onChange={e => set('status', e.target.value as Status)}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Trial dates */}
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--muted)/30' }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período de prueba</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Inicio trial</label>
                    <input type="datetime-local" style={inputStyle} value={form.trialStartedAt} onChange={e => set('trialStartedAt', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Fin trial</label>
                    <input type="datetime-local" style={inputStyle} value={form.trialEndsAt} onChange={e => set('trialEndsAt', e.target.value)} />
                  </div>
                </div>
                {/* Shortcuts */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {[7, 14, 30, 60, 90].map(days => (
                    <button key={days} type="button"
                      onClick={() => {
                        const start = new Date();
                        const end = new Date(start.getTime() + days * 86400000);
                        set('trialStartedAt', start.toISOString().slice(0, 16));
                        set('trialEndsAt', end.toISOString().slice(0, 16));
                        set('status', 'trialing');
                      }}
                      style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--background)', cursor: 'pointer', color: 'var(--foreground)' }}>
                      +{days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Billing period */}
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--muted)/30' }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Período de facturación</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Inicio período</label>
                    <input type="datetime-local" style={inputStyle} value={form.currentPeriodStart} onChange={e => set('currentPeriodStart', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Fin período</label>
                    <input type="datetime-local" style={inputStyle} value={form.currentPeriodEnd} onChange={e => set('currentPeriodEnd', e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="cancelAtPeriodEnd" checked={form.cancelAtPeriodEnd} onChange={e => set('cancelAtPeriodEnd', e.target.checked)} style={{ cursor: 'pointer' }} />
                  <label htmlFor="cancelAtPeriodEnd" style={{ fontSize: 12, cursor: 'pointer', color: 'var(--foreground)' }}>
                    Cancelar al final del período
                  </label>
                </div>
              </div>

              {/* LemonSqueezy IDs */}
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--muted)/30' }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LemonSqueezy (opcional)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Customer ID</label>
                    <input type="text" style={inputStyle} value={form.lsCustomerId} placeholder="cus_..." onChange={e => set('lsCustomerId', e.target.value)} />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Subscription ID</label>
                    <input type="text" style={inputStyle} value={form.lsSubscriptionId} placeholder="sub_..." onChange={e => set('lsSubscriptionId', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Overrides de features */}
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--muted)/30' }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Features adicionales (override)</p>
                <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                  Activa una feature aunque el plan del cliente no la incluya (acuerdo de precio aparte). Queda registrado en auditoría.
                </p>
                {FEATURE_OVERRIDES.map((feat, i) => {
                  const checked = form.features.includes(feat.key);
                  return (
                    <div key={feat.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: i === 0 ? 0 : 10 }}>
                      <input
                        type="checkbox"
                        id={`feat-${feat.key}`}
                        checked={checked}
                        onChange={e => set(
                          'features',
                          e.target.checked
                            ? [...form.features, feat.key]
                            : form.features.filter(k => k !== feat.key),
                        )}
                        style={{ cursor: 'pointer', marginTop: 2 }}
                      />
                      <label htmlFor={`feat-${feat.key}`} style={{ fontSize: 12, cursor: 'pointer', color: 'var(--foreground)' }}>
                        <strong>{feat.label}</strong>
                        <span style={{ display: 'block', color: 'var(--muted-foreground)', marginTop: 2 }}>
                          {feat.description}
                        </span>
                      </label>
                    </div>
                  );
                })}
                <div style={{ ...fieldStyle, marginTop: 12 }}>
                  <label style={labelStyle}>Límite de tareas (override)</label>
                  <input
                    type="number"
                    min={-1}
                    max={9999}
                    style={inputStyle}
                    value={form.scheduledTaskLimit}
                    placeholder="Vacío = usar el del plan · -1 = ilimitado"
                    onChange={e => set('scheduledTaskLimit', e.target.value)}
                  />
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
                    Sobrescribe el máximo de tareas del plan para este cliente. Déjalo vacío para usar el del plan.
                  </span>
                </div>
              </div>

              {/* Messages */}
              {error && <p style={{ margin: 0, fontSize: 13, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>}
              {success && <p style={{ margin: 0, fontSize: 13, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.2)' }}>{success}</p>}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                {hasSub && !confirmDelete && (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer' }}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                )}
                {confirmDelete && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={handleDelete} disabled={deleting}
                      style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#ef4444', color: '#fff', border: 'none', cursor: deleting ? 'wait' : 'pointer' }}>
                      {deleting ? 'Eliminando…' : 'Confirmar eliminación'}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)}
                      style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                )}
                {!confirmDelete && <div />}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={onClose}
                    style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Cerrar
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: 'var(--brand-primary)', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                    {hasSub ? 'Guardar cambios' : 'Crear suscripción'}
                  </button>
                </div>
              </div>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}
