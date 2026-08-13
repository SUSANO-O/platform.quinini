'use client';

import type { CSSProperties, ReactElement } from 'react';
import { BorderBeam } from 'border-beam';

type BorderBeamFieldProps = {
  children: ReactElement;
  /** Radio del hijo (px). */
  radius?: number;
  className?: string;
  style?: CSSProperties;
  active?: boolean;
  theme?: 'light' | 'dark' | 'auto';
  /** `line` = haz inferior (útil para “ondas” de voz). */
  size?: 'md' | 'line';
  strength?: number;
  duration?: number;
  colorVariant?: 'colorful' | 'mono' | 'ocean' | 'sunset';
};

/**
 * Wrapper seguro para inputs/composers.
 * Nunca usar size="sm" de border-beam: fuerza 70×36 y rompe el layout.
 */
export function BorderBeamField({
  children,
  radius = 16,
  className,
  style,
  active = true,
  theme = 'light',
  size = 'line',
  strength = 0.55,
  duration,
  colorVariant = 'colorful',
}: BorderBeamFieldProps) {
  const resolvedDuration = duration ?? (size === 'line' ? 3.6 : 2.6);
  return (
    <BorderBeam
      size={size}
      theme={theme}
      colorVariant={colorVariant}
      strength={strength}
      duration={resolvedDuration}
      borderRadius={radius}
      active={active}
      className={className}
      style={{ display: 'block', width: '100%', minWidth: 0, ...style }}
    >
      {children}
    </BorderBeam>
  );
}
