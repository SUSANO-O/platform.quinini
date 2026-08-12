'use client';

import {
  BRAND_LOGO_PNG_2X_SRC,
  BRAND_LOGO_PNG_SRC,
  BRAND_NAME,
} from '@/lib/brand';

type BotivaOrbLogoProps = {
  size?: number;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  variant?: 'auto' | 'compact' | 'detailed';
};

/** Logo BotIvA (marca). */
export function BotivaOrbLogo({ size = 32, className, title, style }: BotivaOrbLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_LOGO_PNG_SRC}
      srcSet={`${BRAND_LOGO_PNG_SRC} 1x, ${BRAND_LOGO_PNG_2X_SRC} 2x`}
      alt={title ?? BRAND_NAME}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block', ...style }}
      decoding="async"
      draggable={false}
    />
  );
}
