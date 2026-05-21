'use client';

import { buildPlanComparisonRows } from '@/lib/plan-economics';
import { Check, Minus } from 'lucide-react';

/**
 * Tabla comparativa de planes — datos desde plan-catalog.ts vía plan-economics.
 */
export function PricingComparisonTable() {
  const rows = buildPlanComparisonRows();
  const columns = rows.filter((r) => r.id !== 'free');

  return (
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr style={{ background: 'var(--muted)' }}>
            <th className="text-left p-4 font-semibold sticky left-0 z-10" style={{ background: 'var(--muted)' }}>
              Característica
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="p-4 text-center font-bold whitespace-nowrap"
                style={{
                  color: col.highlighted ? 'var(--primary)' : 'var(--foreground)',
                  background: col.highlighted ? 'rgba(228,20,20,0.06)' : undefined,
                }}
              >
                {col.label}
                <div className="text-xs font-normal mt-1" style={{ color: 'var(--muted-foreground)' }}>
                  {col.priceLabel}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { key: 'conversations', label: 'Conversaciones / mes' },
            { key: 'agents', label: 'Agentes' },
            { key: 'agentWebhook', label: 'Webhook del agente' },
            { key: 'outboundWebhook', label: 'Webhook saliente (HMAC)' },
            { key: 'apiAccess', label: 'Acceso API REST' },
            { key: 'customIntegration', label: 'Integraciones custom' },
            { key: 'escalationTickets', label: 'Creación de tickets al escalar' },
            { key: 'conversationAnalytics', label: 'Analytics de conversaciones' },
            { key: 'rag', label: 'RAG (por agente)' },
            { key: 'history', label: 'Historial' },
            { key: 'support', label: 'Soporte' },
          ].map(({ key, label }) => (
            <tr key={key} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="p-4 font-medium sticky left-0" style={{ background: 'var(--card)' }}>
                {label}
              </td>
              {columns.map((col) => {
                const val = col[key as keyof typeof col];
                const display = val === '—' ? null : String(val);
                return (
                  <td
                    key={col.id}
                    className="p-4 text-center"
                    style={{
                      background: col.highlighted ? 'rgba(228,20,20,0.03)' : undefined,
                    }}
                  >
                    {display ? (
                      <span className="inline-flex items-center gap-1 justify-center">
                        <Check size={14} className="shrink-0 text-emerald-500" />
                        {display}
                      </span>
                    ) : (
                      <Minus size={14} className="mx-auto opacity-40" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-4 text-xs border-t" style={{ color: 'var(--muted-foreground)', borderColor: 'var(--border)' }}>
        Una conversación = un mensaje del usuario procesado por el agente. Widgets ilimitados en todos los planes de pago.
      </p>
    </div>
  );
}
