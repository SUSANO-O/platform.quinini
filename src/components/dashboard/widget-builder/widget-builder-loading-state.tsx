'use client';

import { useEffect, useState } from 'react';
import { BRAND_LOGO_PNG_SRC } from '@/lib/brand';

const LOADING_HINTS = [
  'Despertando a tus agentes…',
  'Sincronizando con el hub…',
  'Puliendo colores y textos…',
  'Enchufando la magia del widget…',
  'Casi listo para brillar…',
] as const;

export function WidgetBuilderLoadingState() {
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHintIdx((i) => (i + 1) % LOADING_HINTS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="widget-builder-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando widget builder"
    >
      <div className="widget-builder-loading__stage" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND_LOGO_PNG_SRC}
          alt=""
          width={88}
          height={88}
          className="widget-builder-loading__mark"
          decoding="async"
          draggable={false}
        />
      </div>
      <p className="widget-builder-loading__title">Armando tu widget…</p>
      <p className="widget-builder-loading__hint" key={hintIdx}>
        {LOADING_HINTS[hintIdx]}
      </p>
    </div>
  );
}
