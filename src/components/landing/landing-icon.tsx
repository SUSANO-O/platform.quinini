'use client';

import type { CSSProperties } from 'react';
import {
  LANDING_ICON_MAP,
  LANDING_ICON_SIZES,
  LANDING_ICON_STROKE,
  type LandingIconName,
  type LandingIconSize,
} from '@/lib/landing-icons';

type LandingIconProps = {
  name: LandingIconName;
  size?: LandingIconSize | number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** Para estrellas u otros iconos rellenos */
  filled?: boolean;
  'aria-hidden'?: boolean;
};

export function LandingIcon({
  name,
  size = 'md',
  strokeWidth = LANDING_ICON_STROKE,
  className,
  style,
  filled,
  'aria-hidden': ariaHidden = true,
}: LandingIconProps) {
  const Icon = LANDING_ICON_MAP[name];
  const px = typeof size === 'number' ? size : LANDING_ICON_SIZES[size];

  return (
    <Icon
      size={px}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      aria-hidden={ariaHidden}
      {...(filled ? { fill: 'currentColor' } : {})}
    />
  );
}
