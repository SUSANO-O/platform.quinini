'use client';

import { Check } from 'lucide-react';
import { AgentInitialsBadge } from '@/components/dashboard/agent-initials-badge';
import { buildAgentPickerMetaChips } from '@/lib/widget-builder';
import type { ClientAgentRow } from '@/lib/widget-builder';

function agentPickerSubtitle(agent: ClientAgentRow): string | null {
  const description = agent.description?.trim();
  if (description) return description;
  return null;
}

export function WidgetBuilderAgentPickerCard({
  agent,
  selected,
  accentColor,
  selectable,
  onSelect,
  extraMeta,
}: {
  agent: ClientAgentRow;
  selected: boolean;
  accentColor: string;
  selectable: boolean;
  onSelect: () => void;
  extraMeta?: string[];
}) {
  const subtitle = agentPickerSubtitle(agent);
  const metaChips = buildAgentPickerMetaChips(agent, extraMeta);

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onSelect}
      title={
        selectable
          ? `${agent.description || agent.name}${agent.isPlatform ? ' · Agente de plataforma' : ''}`
          : 'ID de agente no válido. Revisa que el agente exista y esté activo.'
      }
      className={[
        'flex items-start gap-3 w-full text-left rounded-xl border transition-all',
        'px-3 py-2.5',
        selectable ? 'cursor-pointer hover:shadow-sm' : 'cursor-not-allowed opacity-55',
        selected ? 'bg-[var(--background)]' : 'bg-[var(--card)]',
      ].join(' ')}
      style={{
        borderColor: selected ? accentColor : 'var(--border)',
        boxShadow: selected ? `0 0 0 1px ${accentColor}33` : undefined,
      }}
    >
      <AgentInitialsBadge
        name={agent.name}
        seed={agent._id}
        selected={selected}
        accentColor={accentColor}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[13px] font-semibold m-0 truncate leading-tight"
          style={{ color: selected ? accentColor : 'var(--foreground)' }}
        >
          {agent.name}
        </p>
        {subtitle ? (
          <p className="text-[11px] m-0 mt-0.5 truncate leading-snug" style={{ color: 'var(--muted-foreground)' }}>
            {subtitle}
          </p>
        ) : null}
        {metaChips.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {metaChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center text-[9px] font-semibold leading-none px-1.5 py-1 rounded-md"
                style={{
                  background: selected ? `${accentColor}12` : 'var(--muted)',
                  color: selected ? accentColor : 'var(--muted-foreground)',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {selected ? (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
          style={{ background: `${accentColor}18`, color: accentColor }}
          aria-hidden
        >
          <Check size={12} strokeWidth={3} />
        </span>
      ) : (
        <span className="w-5 shrink-0 mt-0.5" aria-hidden />
      )}
    </button>
  );
}
