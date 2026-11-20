'use client';

/**
 * Panel de admin — Leads del onboarding (/crear).
 * Lista los leads capturados y permite convertirlos en cuenta + agente (Opción A):
 * ventas elige el correo y el plan vendido, y el servidor provisiona todo desde la data del lead.
 */

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface LeadRow {
  _id: string;
  status: string;
  businessName?: string;
  businessType?: string;
  goal?: string;
  whatsapp?: string;
  website?: string;
  agentName?: string;
  createdAt?: string;
  userId?: string;
}

const PLANS = ['solo', 'team', 'plus', 'business', 'enterprise'];

const STATUS_COLOR: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  qualified: '#8b5cf6',
  converted: '#22c55e',
  discarded: '#94a3b8',
};

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<LeadRow | null>(null);
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('plus');
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState<{ setPasswordUrl?: string; embedSnippet?: string; agentName?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/leads');
      const d = await r.json();
      setLeads(Array.isArray(d.leads) ? d.leads : []);
    } catch {
      toast.error('No se pudieron cargar los leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const convert = useCallback(async () => {
    if (!active) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Correo inválido.');
      return;
    }
    setConverting(true);
    try {
      const r = await fetch(`/api/admin/leads/${active._id}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, plan, displayName: active.businessName }),
      });
      const d = await r.json();
      if (!r.ok && r.status !== 207) {
        toast.error(d.error ?? 'No se pudo convertir el lead.');
      } else {
        toast.success('Lead convertido: cuenta + agente + widget creados.');
        setResult({ setPasswordUrl: d.setPasswordUrl, embedSnippet: d.embedSnippet, agentName: d.agentName });
        setActive(null);
        setEmail('');
        setPlan('plus');
        load();
      }
    } catch {
      toast.error('Error de red al convertir.');
    } finally {
      setConverting(false);
    }
  }, [active, email, plan, load]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Leads del onboarding</h1>
        <button onClick={load} style={btnGhost}>Refrescar</button>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : leads.length === 0 ? (
        <p style={{ color: '#64748b' }}>Aún no hay leads. Se crean cuando alguien completa el quiz en /crear.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>Negocio</th>
                <th style={th}>Tipo / Objetivo</th>
                <th style={th}>WhatsApp</th>
                <th style={th}>Agente</th>
                <th style={th}>Estado</th>
                <th style={th}>Fecha</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={td}>{l.businessName || '—'}</td>
                  <td style={td}>{[l.businessType, l.goal].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={td}>{l.whatsapp || '—'}</td>
                  <td style={td}>{l.agentName || '—'}</td>
                  <td style={td}>
                    <span style={{ color: STATUS_COLOR[l.status] ?? '#64748b', fontWeight: 600 }}>{l.status}</span>
                  </td>
                  <td style={td}>{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={td}>
                    {l.status !== 'converted' ? (
                      <button onClick={() => { setActive(l); setEmail(''); }} style={btnPrimary}>Convertir</button>
                    ) : (
                      <span style={{ color: '#22c55e', fontSize: 12 }}>✓ cuenta creada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div style={overlay} onClick={() => !converting && setActive(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Convertir lead → cuenta + agente</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
              {active.businessName || 'Negocio'} · agente “{active.agentName || '—'}”. Se creará la cuenta, su
              suscripción y su agente (con el conocimiento de su web si el plan lo permite).
            </p>
            <label style={lbl}>Correo del cliente</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@empresa.com" type="email" style={input} autoFocus />
            <label style={lbl}>Plan vendido</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} style={input}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setActive(null)} disabled={converting} style={btnGhost}>Cancelar</button>
              <button onClick={convert} disabled={converting} style={btnPrimary}>
                {converting ? 'Creando…' : 'Crear cuenta + agente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div style={overlay} onClick={() => setResult(null)}>
          <div style={{ ...modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>✓ Cliente listo</h2>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
              Se creó la cuenta, el agente “{result.agentName}” y su widget. Comparte estos dos con el cliente:
            </p>

            <label style={lbl}>1. Enlace para que ponga su contraseña</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={result.setPasswordUrl ?? ''} style={{ ...input, fontSize: 12 }} />
              <button style={btnGhost} onClick={() => { navigator.clipboard?.writeText(result.setPasswordUrl ?? ''); toast.message('Enlace copiado'); }}>Copiar</button>
            </div>

            <label style={{ ...lbl, marginTop: 14 }}>2. Código del widget para su web</label>
            <textarea readOnly value={result.embedSnippet ?? ''} style={{ ...input, fontSize: 12, height: 120, fontFamily: 'monospace', resize: 'vertical' }} />
            <button style={{ ...btnGhost, marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(result.embedSnippet ?? ''); toast.message('Código del widget copiado'); }}>Copiar código del widget</button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setResult(null)} style={btnPrimary}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#64748b', margin: '10px 0 4px' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 };
const btnPrimary: React.CSSProperties = { background: '#006B7D', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' };
