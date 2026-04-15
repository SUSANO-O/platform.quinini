'use client';

import { useState } from 'react';
import { CONVERSATION_PACKS } from '@/lib/plan-catalog';
import { Zap, X } from 'lucide-react';

interface Props {
  percentUsed: number;
  used: number;
  limit: number;
  plan: string;
  activePacks: { packId: string; remaining: number; total: number; expiresAt: string }[];
}

const R = '#e41414';
const O = '#f87600';

export function QuotaTopupBanner({ percentUsed, used, limit, plan, activePacks }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (percentUsed < 80 && activePacks.length === 0) return null;

  const isOver = percentUsed >= 100;
  const bannerColor = isOver ? R : O;
  const bannerBg    = isOver ? 'rgba(228,20,20,0.07)' : 'rgba(248,118,0,0.07)';

  async function buyPack(packId: string) {
    setLoading(packId);
    setError('');
    try {
      const res = await fetch('/api/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Error al crear el pago.');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {/* Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        gap: '10px', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px',
        border: `1px solid ${bannerColor}40`, background: bannerBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={15} style={{ color: bannerColor, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: bannerColor }}>
            {isOver
              ? `Has superado tu límite (${used.toLocaleString('es')} / ${limit.toLocaleString('es')} conv). El widget está bloqueado.`
              : `Has usado el ${percentUsed}% de tus conversaciones (${used.toLocaleString('es')} / ${limit.toLocaleString('es')}).`}
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none',
            background: `linear-gradient(135deg,${R},${O})`, color: '#fff',
            fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Comprar más conversaciones
        </button>
      </div>

      {/* Active packs summary */}
      {activePacks.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
          background: 'var(--muted)', border: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-foreground)' }}>Packs activos:</span>
          {activePacks.map((p) => (
            <span key={p.packId} style={{
              fontSize: '11px', padding: '2px 8px', borderRadius: '6px',
              background: 'rgba(0,172,248,0.1)', color: '#00acf8', fontWeight: 700,
            }}>
              {p.remaining.toLocaleString('es')} conv · vence {new Date(p.expiresAt).toLocaleDateString('es')}
            </span>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px',
            padding: '28px', maxWidth: '480px', width: '100%', margin: '16px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Comprar conversaciones extra</h2>
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  Válidas 90 días · No caducan al renovar el plan · Plan actual: <strong>{plan}</strong>
                </p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <p style={{ fontSize: '12px', color: R, background: 'rgba(228,20,20,0.08)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
              {CONVERSATION_PACKS.map((pack) => (
                <div key={pack.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderRadius: '12px',
                  border: `1px solid var(--border)`, background: 'var(--muted)',
                }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, fontSize: '14px' }}>
                      {pack.label}
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 400 }}>
                        {pack.conversations.toLocaleString('es')} conversaciones
                      </span>
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                      ${(pack.price / pack.conversations * 1000).toFixed(1)} por 1,000 conv · válido 90 días
                    </p>
                  </div>
                  <button
                    onClick={() => buyPack(pack.id)}
                    disabled={loading === pack.id}
                    style={{
                      padding: '7px 16px', borderRadius: '8px', border: 'none',
                      background: loading === pack.id ? 'var(--border)' : `linear-gradient(135deg,${R},${O})`,
                      color: '#fff', fontSize: '13px', fontWeight: 700, cursor: loading === pack.id ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    {loading === pack.id ? '...' : pack.priceLabel}
                  </button>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '16px' }}>
              Pago seguro con Stripe · Sin suscripción adicional
            </p>
          </div>
        </div>
      )}
    </>
  );
}
