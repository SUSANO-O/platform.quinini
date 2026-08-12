'use client';

import type { CSSProperties, ReactNode } from 'react';

export type MaterialIconProps = {
  /** Nombre del glifo en https://fonts.google.com/icons (Material Symbols). */
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  'aria-hidden'?: boolean | 'true' | 'false';
  title?: string;
  children?: ReactNode;
};

/**
 * Icono Material Symbols Outlined — https://fonts.google.com/icons
 */
export function MaterialIcon({
  name,
  size = 20,
  className,
  style,
  filled = false,
  weight = 400,
  'aria-hidden': ariaHidden = true,
  title,
}: MaterialIconProps) {
  const px = typeof size === 'number' ? `${size}px` : size;
  return (
    <span
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      title={title}
      aria-hidden={ariaHidden}
      style={{
        fontSize: px,
        width: px,
        height: px,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
