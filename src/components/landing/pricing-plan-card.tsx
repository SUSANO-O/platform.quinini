import {
  ArrowRight,
  Bot,
  Check,
  Crown,
  HardDrive,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import type { PlanInfo } from '@/lib/plan-catalog';
import {
  PLAN_AGENT_LIMITS,
  PLAN_CONVERSATION_LIMITS,
  PLAN_RAG_LIMITS,
  formatAgentLimit,
} from '@/lib/plan-catalog';

function fmtConv(n: number): string {
  if (n < 0) return 'Ilimitadas';
  return n.toLocaleString('es');
}

type Highlight = {
  icon: typeof MessageSquare;
  label: string;
  value: string;
};

function planHighlights(planId: string): Highlight[] {
  const conv = PLAN_CONVERSATION_LIMITS[planId] ?? 0;
  const agents = PLAN_AGENT_LIMITS[planId] ?? 0;
  const rag = PLAN_RAG_LIMITS[planId as keyof typeof PLAN_RAG_LIMITS];

  const items: Highlight[] = [
    {
      icon: MessageSquare,
      label: 'Conversaciones',
      value: `${fmtConv(conv)}/mes`,
    },
    {
      icon: Bot,
      label: 'Agentes',
      value: formatAgentLimit(agents),
    },
  ];

  if (rag) {
    items.push({
      icon: HardDrive,
      label: 'Almacenamiento',
      value: `${rag.mb.toLocaleString('es')} MB`,
    });
  }

  return items;
}

const PLAN_ICONS: Record<string, typeof Crown> = {
  solo: Sparkles,
  team: Bot,
  plus: Sparkles,
  business: Crown,
};

export function PricingPlanCard({
  plan,
  whatsAppHref,
}: {
  plan: PlanInfo;
  whatsAppHref: string;
}) {
  const highlights = planHighlights(plan.id);
  const PlanIcon = PLAN_ICONS[plan.id] ?? Sparkles;

  return (
    <div
      className={[
        'relative rounded-2xl flex flex-col transition-all hover:shadow-lg',
        plan.highlighted
          ? 'p-6 md:p-8 xl:-translate-y-2 ring-2 ring-[var(--primary)] shadow-[0_12px_48px_rgba(var(--brand-primary-rgb),0.15)]'
          : 'p-5 md:p-8 border border-[var(--border)]',
      ].join(' ')}
      style={{ background: 'var(--card)' }}
    >
      {plan.highlighted && (
        <>
          <div
            className="absolute top-0 inset-x-0 h-1 rounded-t-2xl"
            style={{
              background: 'linear-gradient(90deg, var(--gradient-start), var(--gradient-mid))',
            }}
          />
          <div
            className="text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full self-start"
            style={{
              background: 'rgba(var(--brand-primary-rgb),0.1)',
              color: 'var(--primary)',
              border: '1px solid rgba(var(--brand-primary-rgb),0.2)',
            }}
          >
            ⭐ Más popular
          </div>
        </>
      )}

      {/* Cabecera con icono grande — estilo Coordinadora */}
      <div className="flex items-start gap-4 mb-5 md:mb-6">
        <div
          className="w-14 h-14 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: plan.highlighted
              ? 'rgba(var(--brand-primary-rgb),0.12)'
              : 'rgba(var(--brand-cool-rgb),0.08)',
          }}
        >
          <PlanIcon
            size={28}
            className="md:w-6 md:h-6"
            style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--foreground)' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-2xl md:text-xl font-extrabold tracking-tight leading-none">
            {plan.name}
          </h3>
          <div className="mt-2 flex items-baseline flex-wrap gap-x-1">
            <span className="text-4xl md:text-5xl font-extrabold tabular-nums">{plan.price}</span>
            {plan.priceNote && (
              <span className="text-base md:text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {plan.priceNote}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Móvil: 3 bloques con iconos grandes (menos ruido visual) */}
      <div className="md:hidden grid gap-3 mb-5">
        {highlights.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: 'rgba(var(--brand-primary-rgb),0.04)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <Icon size={22} style={{ color: 'var(--primary)' }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide m-0" style={{ color: 'var(--muted-foreground)' }}>
                {label}
              </p>
              <p className="text-lg font-extrabold m-0 mt-0.5 leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: lista completa */}
      <ul className="hidden md:block space-y-3 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm leading-snug">
            <Check
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: plan.highlighted ? 'var(--primary)' : 'var(--accent)' }}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* Móvil: detalle colapsable */}
      <details className="md:hidden mb-1 group">
        <summary
          className="cursor-pointer list-none text-sm font-semibold py-2"
          style={{ color: 'var(--primary)' }}
        >
          <span className="group-open:hidden">Ver todo lo incluido →</span>
          <span className="hidden group-open:inline">Ocultar detalle ↑</span>
        </summary>
        <ul className="space-y-2 pt-2 pb-1">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>
              <Check size={14} className="mt-0.5 shrink-0 opacity-70" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </details>

      {PLAN_RAG_LIMITS[plan.id as keyof typeof PLAN_RAG_LIMITS] && (
        <p
          className="hidden md:block mt-4 text-sm rounded-lg px-3 py-2 leading-snug"
          style={{
            color: 'var(--muted-foreground)',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
          }}
        >
          Almacenamiento: {PLAN_RAG_LIMITS[plan.id as keyof typeof PLAN_RAG_LIMITS]!.mb.toLocaleString('es')} MB ·{' '}
          {PLAN_RAG_LIMITS[plan.id as keyof typeof PLAN_RAG_LIMITS]!.sources} fuentes por agente
        </p>
      )}

      <a
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 md:mt-8 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-base md:text-sm transition-all no-underline min-h-[52px]"
        style={
          plan.highlighted
            ? {
                background: 'var(--brand-primary)',
                color: '#fff',
                boxShadow: '0 4px 20px rgba(var(--brand-primary-rgb),0.3)',
              }
            : { border: '1px solid var(--border)', color: 'var(--foreground)' }
        }
      >
        Consultar por WhatsApp
        <ArrowRight size={16} />
      </a>
    </div>
  );
}
