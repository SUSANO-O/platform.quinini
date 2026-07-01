/** Etiqueta BETA para el módulo de flujos conversacionales. */
import type { CSSProperties } from 'react';

export function FlowsBetaBadge({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`flows-beta-badge${className ? ` ${className}` : ''}`}
      style={style}
      aria-label="Función en beta"
    >
      BETA
    </span>
  );
}
