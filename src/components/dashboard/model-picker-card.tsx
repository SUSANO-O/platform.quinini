'use client';

import type { ClientModelOption } from '@/hooks/use-client-models';

const DEFAULT_TIER_COLOR: Record<string, string> = {
  stable: 'var(--muted-foreground)',
  pro: '#6366f1',
  flash: '#f59e0b',
  lite: '#10b981',
  preview: '#ec4899',
};

function modelInitials(name?: string) {
  const n = String(name || '').trim();
  if (!n) return 'AI';
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function formatCtx(maxTokens?: number) {
  if (maxTokens == null) return null;
  if (maxTokens >= 1000) return `${Math.round(maxTokens / 1000)}k ctx`;
  return `${maxTokens.toLocaleString()} ctx`;
}

export type ModelPickerCardProps = {
  model: ClientModelOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  accentColor?: string;
  tierColor?: string;
  showTier?: boolean;
  compact?: boolean;
};

export function ModelPickerCard({
  model,
  selected,
  onSelect,
  disabled = false,
  accentColor = 'var(--primary)',
  tierColor,
  showTier = true,
  compact = false,
}: ModelPickerCardProps) {
  const tier = model.tier ?? 'stable';
  const badgeColor = tierColor ?? DEFAULT_TIER_COLOR[tier] ?? 'var(--muted-foreground)';
  const ctx = formatCtx(model.maxTokens);
  const metaParts = [model.badge, ctx, model.category].filter(Boolean);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      title={model.description || model.name}
      className={[
        'rounded-2xl border card-texture overflow-hidden w-full text-left transition-all',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:shadow-md',
      ].join(' ')}
      style={{
        borderColor: selected ? accentColor : 'var(--border)',
        boxShadow: selected
          ? `0 0 0 1px color-mix(in srgb, ${accentColor} 44%, transparent), var(--shadow-surface-sm)`
          : undefined,
      }}
    >
      <div className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-start justify-between gap-1.5 mb-2">
          <div
            className={`${compact ? 'w-8 h-8 text-[9px]' : 'w-10 h-10 text-[10px]'} rounded-xl flex items-center justify-center shrink-0 font-bold uppercase tracking-wide`}
            style={{
              background: selected
                ? `color-mix(in srgb, ${accentColor} 14%, transparent)`
                : 'rgba(var(--brand-primary-rgb), 0.06)',
              border: `1px solid ${selected ? `color-mix(in srgb, ${accentColor} 30%, transparent)` : 'var(--border)'}`,
              color: selected ? accentColor : 'var(--muted-foreground)',
            }}
          >
            {modelInitials(model.name)}
          </div>
          {showTier ? (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wide"
              style={{
                background: `${badgeColor}18`,
                color: badgeColor,
              }}
            >
              {tier}
            </span>
          ) : null}
        </div>

        <p
          className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold m-0 truncate leading-snug`}
          style={{ color: selected ? accentColor : 'var(--foreground)' }}
        >
          {model.name}
          {model.deprecated ? (
            <span className="text-[9px] font-semibold ml-1" style={{ color: '#d97706' }}>
              (deprecado)
            </span>
          ) : null}
        </p>

        {metaParts.length > 0 ? (
          <p className="text-[10px] m-0 mt-1 truncate" style={{ color: 'var(--muted-foreground)' }}>
            {metaParts.join(' · ')}
          </p>
        ) : null}

        {!compact && model.description ? (
          <p
            className="text-[10px] m-0 mt-1.5 line-clamp-2 leading-snug"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {model.description}
          </p>
        ) : null}
      </div>
    </button>
  );
}
