'use client';

import { useState } from 'react';
import { CONVERSATION_PACKS, canPurchaseConversationPacks } from '@/lib/plan-catalog';
import { Zap, X } from 'lucide-react';
import { BRAND, STATE, BRAND_GRADIENT } from '@/lib/brand-colors';
interface Props {
  percentUsed: number;
  used: number;
  limit: number;
  plan: string;
  subscriptionStatus?: string;
  activePacks: { packId: string; remaining: number; total: number; expiresAt: string }[];
}

export function QuotaTopupBanner({ percentUsed, used, limit, plan, subscriptionStatus = 'free', activePacks }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const packsAllowed = canPurchaseConversationPacks(plan, subscriptionStatus);

  if (percentUsed < 80 && activePacks.length === 0) return null;

  const isOver = percentUsed >= 100;
  const bannerColor = isOver ? STATE.error : BRAND.warm;
  const bannerBg    = isOver ? STATE.errorBg : 'rgba(var(--brand-warm-rgb),0.07)';

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
              ? `Límite de conversaciones alcanzado (${used.toLocaleString('es')} / ${limit.toLocaleString('es')}). Agrega más para reactivar los widgets.`
              : `Has usado el ${percentUsed}% de tus conversaciones este mes (${used.toLocaleString('es')} / ${limit.toLocaleString('es')}).`}
          </span>
        </div>
        <button
          onClick={() => packsAllowed ? setShowModal(true) : undefined}
          disabled={!packsAllowed}
          style={{
            padding: '6px 14px', borderRadius: '8px', border: 'none',
            background: packsAllowed ? BRAND_GRADIENT : 'var(--border)',
            color: '#fff',
            fontSize: '12px', fontWeight: 700, cursor: packsAllowed ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            opacity: packsAllowed ? 1 : 0.7,
          }}
        >
          {packsAllowed ? 'Comprar más conversaciones' : 'Mejorar plan para packs'}
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
              background: 'rgba(var(--brand-cool-rgb),0.1)', color: '#000', fontWeight: 700,
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
                  Válidas 90 días · Solo planes de pago · Plan actual: <strong>{plan}</strong>
                </p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <p style={{ fontSize: '12px', color: STATE.error, background: STATE.errorBg, padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
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
                      background: loading === pack.id ? 'var(--border)' : BRAND_GRADIENT,
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
              Los packs cuestan más por conversación que subir de plan — ideal para picos puntuales.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
