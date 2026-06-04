'use client';

import type { CSSProperties } from 'react';
import {
  defaultHueFromHex,
  hashWidgetSeed,
  iridescentOrbBackgroundCss,
  iridescentOrbBlendModes,
} from '@/lib/widget-iridescent';

export function WidgetAvatar({
  widgetId,
  color,
  avatarUrl,
  size = 'md',
}: {
  widgetId: string;
  color: string;
  avatarUrl?: string | null;
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-12 w-12' : 'h-11 w-11';
  const orbStyle: CSSProperties = {
    background: iridescentOrbBackgroundCss(defaultHueFromHex(color), hashWidgetSeed(`${widgetId}|${color}`)),
    backgroundBlendMode: iridescentOrbBlendModes() as CSSProperties['backgroundBlendMode'],
    filter: 'saturate(1.28) contrast(1.08) brightness(1.06)',
  };

  return (
    <div
      className={`dashboard-resource-card__avatar relative ${dim} shrink-0 overflow-hidden rounded-full shadow-sm ring-1 ring-black/5`}
      aria-hidden
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-[-38%] rounded-full" style={orbStyle} />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow:
                'inset 0 2px 10px rgba(255,255,255,0.55), inset 0 -6px 14px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,255,255,0.25)',
            }}
          />
        </>
      )}
    </div>
  );
}
