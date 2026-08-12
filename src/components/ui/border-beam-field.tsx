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
};

/**
 * Wrapper seguro para inputs/composers.
 * Nunca usar size="sm" de border-beam: fuerza 70×36 y rompe el layout.
 * size="md" + colorful ≈ borde completo; size="line" ≈ ondas / voz.
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
}: BorderBeamFieldProps) {
  return (
    <BorderBeam
      size={size}
      theme={theme}
      colorVariant="colorful"
      strength={strength}
      duration={size === 'line' ? 3.6 : 2.6}
      borderRadius={radius}
      active={active}
      className={className}
      style={{ display: 'block', width: '100%', minWidth: 0, ...style }}
    >
      {children}
    </BorderBeam>
  );
}
