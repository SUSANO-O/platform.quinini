import type { CSSProperties, ReactNode } from 'react';

/** Bloque de sección dentro de la tarjeta del editor de agente (estilo widget builder). */
export function AgentEditorSection({
  children,
  bar = 'primary',
  className,
  innerStyle,
  outerStyle,
}: {
  children: ReactNode;
  /** Acento de la barra lateral: primario (teal) u oscuro (cool). */
  bar?: 'primary' | 'cool';
  className?: string;
  innerStyle?: CSSProperties;
  outerStyle?: CSSProperties;
}) {
  return (
    <section
      className={`agent-editor-section agent-editor-section--${bar}${className ? ` ${className}` : ''}`}
      style={outerStyle}
    >
      <div className="agent-editor-section__body" style={innerStyle}>
        {children}
      </div>
    </section>
  );
}
