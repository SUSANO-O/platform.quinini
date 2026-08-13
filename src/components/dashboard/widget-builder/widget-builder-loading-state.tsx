'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

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
        <span className="widget-builder-loading__glow" />
        <Image
          src="/assets/marketing/botiva-orb.svg"
          alt=""
          width={92}
          height={92}
          className="widget-builder-loading__orb"
          priority
        />
        <span className="widget-builder-loading__spark widget-builder-loading__spark--1">✦</span>
        <span className="widget-builder-loading__spark widget-builder-loading__spark--2">✧</span>
        <span className="widget-builder-loading__spark widget-builder-loading__spark--3">★</span>
      </div>
      <p className="widget-builder-loading__title">Armando tu widget…</p>
      <p className="widget-builder-loading__hint" key={hintIdx}>
        {LOADING_HINTS[hintIdx]}
      </p>
    </div>
  );
}
