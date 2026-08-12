'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, ChevronDown, ChevronUp, Copy, Check } from '@/components/ui/icons';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  PAID_PLAN_IDS,
  PLAN_ORDER,
} from '@/lib/plan-catalog';

interface UseEntry {
  userId: string;
  email: string;
  usedAt: string;
}

interface CodeRow {
  _id: string;
  code: string;
  plan: string;
  maxUses: number;
  usedCount: number;
  trialDays: number;
  active: boolean;
  note: string;
  expiresAt: string | null;
  createdAt: string;
  uses: UseEntry[];
}

const SELLABLE_PLANS = [...PAID_PLAN_IDS];

const PLAN_COLORS: Record<string, { color: string; bg: string }> = {
  free:     { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  solo:     { color: '#0d9488', bg: 'rgba(13,148,136,0.1)' },
  basic:    { color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  team:     { color: '#0d9488', bg: 'rgba(13,148,136,0.1)' },
  plus:     { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  starter:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  growth:   { color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  business: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
};

export default function RegistrationCodesPage() {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formPlan, setFormPlan] = useState('team');
  const [formMaxUses, setFormMaxUses] = useState(1);
  const [formTrialDays, setFormTrialDays] = useState(7);
  const [formNote, setFormNote] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/registration-codes');
    const data = (await res.json().catch(() => ({}))) as { codes?: CodeRow[] };
    setCodes(data.codes || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/registration-codes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !current }),
    });
    if (res.ok) {
      setCodes((prev) => prev.map((c) => c._id === id ? { ...c, active: !current } : c));
    }
  }

  async function deleteCode(id: string) {
    setDeleting(true);
    const res = await fetch(`/api/admin/registration-codes/${id}`, { method: 'DELETE' });
    setDeleting(false);
    setDeleteTarget(null);
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c._id !== id));
      toast.success('Código eliminado');
    } else {
      toast.error('Error al eliminar el código');
    }
  }

  async function createCode() {
    setFormError('');
    setCreating(true);
    const body: Record<string, unknown> = {
      plan: formPlan,
      maxUses: formMaxUses,
      trialDays: formTrialDays,
      note: formNote,
    };
    if (formCode.trim()) body.code = formCode.trim();
    if (formExpiry) body.expiresAt = formExpiry;
    const res = await fetch('/api/admin/registration-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: CodeRow; error?: string };
    if (!res.ok) {
      setFormError(data.error || 'Error al crear.');
    } else if (data.code) {
      setCodes((prev) => [data.code as CodeRow, ...prev]);
      setShowForm(false);
      setFormCode(''); setFormPlan('team'); setFormMaxUses(1); setFormTrialDays(7); setFormNote(''); setFormExpiry('');
      toast.success('Código creado');
    }
    setCreating(false);
  }

  function copyCode(code: string, id: string) {
    void navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none', width: '100%',
  };

  return (
    <div style={{ padding: '32px', maxWidth: 900 }}>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar código"
        description={deleteTarget ? `¿Eliminar el código "${deleteTarget.code}"? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        onConfirm={() => deleteTarget && void deleteCode(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Códigos de acceso</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{
            padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--background)', cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <RefreshCw size={13} style={{ color: 'var(--muted-foreground)' }} />
          </button>
          <button onClick={() => setShowForm((v) => !v)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
            borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={14} /> Generar código
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--muted-foreground)', fontSize: '13px', marginBottom: '24px' }}>
        {codes.length} código{codes.length !== 1 ? 's' : ''} en total
      </p>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px',
          padding: '20px', marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Nuevo código de acceso</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Código (vacío = auto)
              </label>
              <input
                style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                placeholder="ej. BETA2025"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, ''))}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Plan asignado
              </label>
              <select value={formPlan} onChange={(e) => setFormPlan(e.target.value)} style={{ ...inputStyle, textTransform: 'capitalize' }}>
                {SELLABLE_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Usos máximos
              </label>
              <input
                type="number" min={1} max={1000} style={inputStyle}
                value={formMaxUses}
                onChange={(e) => setFormMaxUses(Math.max(1, Math.min(1000, Number(e.target.value))))}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Días de prueba
              </label>
              <input
                type="number" min={1} max={365} style={inputStyle}
                value={formTrialDays}
                onChange={(e) => setFormTrialDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Expira (opcional)
              </label>
              <input type="date" style={inputStyle} value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '-4px 0 12px', lineHeight: 1.45 }}>
            Los días de prueba definen cuánto dura el acceso al plan asignado tras registrarse (ej. 7, 15, 30, 40).
          </p>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Nota interna
            </label>
            <input
              style={inputStyle} placeholder="ej. Campaña beta enero 2025"
              value={formNote} onChange={(e) => setFormNote(e.target.value)} maxLength={120}
            />
          </div>
          {formError && (
            <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{formError}</p>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={createCode} disabled={creating}
              style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: creating ? 'var(--border)' : '#6366f1', color: '#fff',
                fontSize: '13px', fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creando...' : 'Crear código'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormError(''); }}
              style={{
                padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--background)', color: 'var(--foreground)',
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.6fr 0.7fr 0.7fr 0.6fr 0.9fr 60px',
          gap: '10px', padding: '11px 20px', borderBottom: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.02)',
        }}>
          {['Código', 'Plan', 'Prueba', 'Usos', 'Activo', 'Expira', 'Nota', ''].map((h) => (
            <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>Cargando...</div>
        ) : codes.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '13px' }}>
            No hay códigos aún. Crea el primero con el botón de arriba.
          </div>
        ) : codes.map((c, i) => {
          const planStyle = PLAN_COLORS[c.plan] || PLAN_COLORS.free;
          const expired = c.expiresAt ? new Date() > new Date(c.expiresAt) : false;
          const isExpanded = expandedId === c._id;

          return (
            <div key={c._id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              {/* Row */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.6fr 0.7fr 0.7fr 0.6fr 0.9fr 60px',
                gap: '10px', padding: '13px 20px', alignItems: 'center',
                opacity: c.active ? 1 : 0.55,
              }}>
                {/* Code */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, letterSpacing: '0.08em',
                    color: c.active ? '#6366f1' : 'var(--muted-foreground)',
                  }}>{c.code}</span>
                  <button
                    onClick={() => copyCode(c.code, c._id)}
                    title="Copiar"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'var(--muted-foreground)', display: 'flex' }}
                  >
                    {copiedId === c._id ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
                  </button>
                </div>

                {/* Plan */}
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                  color: planStyle.color, background: planStyle.bg, textTransform: 'capitalize',
                  display: 'inline-block',
                }}>
                  {c.plan}
                </span>

                {/* Trial days */}
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                  {c.trialDays ?? 7}d
                </span>

                {/* Uses */}
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.usedCount}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}> / {c.maxUses}</span>
                  {c.usedCount >= c.maxUses && (
                    <span style={{ fontSize: '10px', color: '#ef4444', display: 'block' }}>Agotado</span>
                  )}
                </div>

                {/* Active toggle */}
                {expired ? (
                  <span style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                    border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)',
                    color: '#ef4444', display: 'inline-block',
                  }}>
                    Expirado
                  </span>
                ) : (
                  <button
                    onClick={() => toggleActive(c._id, c.active)}
                    style={{
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                      border: `1px solid ${c.active ? '#22c55e' : 'var(--border)'}`,
                      background: c.active ? 'rgba(34,197,94,0.1)' : 'var(--background)',
                      color: c.active ? '#22c55e' : 'var(--muted-foreground)', cursor: 'pointer',
                    }}
                  >
                    {c.active ? 'Activo' : 'Inactivo'}
                  </button>
                )}

                {/* Expiry */}
                <span style={{ fontSize: '11px', color: expired ? '#ef4444' : 'var(--muted-foreground)' }}>
                  {c.expiresAt
                    ? new Date(c.expiresAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </span>

                {/* Note */}
                <span style={{ fontSize: '11px', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.note || '—'}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {c.uses.length > 0 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c._id)}
                      title="Ver usos"
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        color: 'var(--muted-foreground)', display: 'flex', padding: '4px',
                      }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget({ id: c._id, code: c.code })}
                    title="Eliminar"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: '#ef4444', display: 'flex', padding: '4px',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded uses */}
              {isExpanded && c.uses.length > 0 && (
                <div style={{
                  borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)',
                  padding: '12px 20px 16px',
                }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Registros con este código
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {c.uses.map((u, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                        <span style={{ fontWeight: 600, minWidth: 220 }}>{u.email}</span>
                        <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace', fontSize: '11px' }}>{u.userId}</span>
                        <span style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
                          {new Date(u.usedAt).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
