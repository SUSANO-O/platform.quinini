'use client';

import { Bot } from '@/components/ui/icons';
import { avatarStyleFromSeed, initialsFromName } from '@/lib/flow-editor/geometry';

export function AgentInitialsBadge({
  name,
  seed,
  selected = false,
  inactive = false,
  platform = false,
  accentColor,
  size = 'md',
  filled = false,
  className = '',
}: {
  name: string;
  seed?: string;
  selected?: boolean;
  inactive?: boolean;
  platform?: boolean;
  accentColor?: string;
  size?: 'xs' | 'sm' | 'md';
  filled?: boolean;
  className?: string;
}) {
  const initials = initialsFromName(name);
  const showBot = !name.trim() || initials === '?';
  const compact = size === 'sm';
  const tiny = size === 'xs';
  const iconSize = tiny ? 13 : compact ? 16 : 18;
  const palette = avatarStyleFromSeed(seed ?? name);

  let background = palette.background;
  let border = palette.border;
  let color = palette.color;

  if (inactive) {
    background = 'var(--muted)';
    border = 'var(--border-subtle)';
    color = 'var(--muted-foreground)';
  } else if (filled) {
    background = accentColor || palette.color;
    border = 'transparent';
    color = '#fff';
  } else if (platform) {
    background = 'rgba(var(--brand-cool-rgb), 0.1)';
    border = 'rgba(var(--brand-cool-rgb), 0.18)';
    color = 'var(--brand-cool)';
  } else if (selected && accentColor) {
    background = `${accentColor}14`;
    border = `${accentColor}30`;
    color = accentColor;
  }

  return (
    <div
      className={[
        'flex items-center justify-center shrink-0 font-bold tracking-tight select-none',
        tiny
          ? 'w-7 h-7 rounded-full text-[0.625rem]'
          : compact
            ? 'w-8 h-8 rounded-full text-[0.6875rem]'
            : 'w-10 h-10 rounded-full text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        background,
        border: `1px solid ${border}`,
        color,
        boxShadow: inactive ? 'inset 0 0 0 1px var(--border-subtle)' : undefined,
      }}
      aria-hidden
    >
      {showBot ? <Bot size={iconSize} /> : initials}
    </div>
  );
}
