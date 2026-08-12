import Image from 'next/image';

const HOW_IMAGES: Record<1 | 2 | 3 | 4 | 5 | 6, { src: string; alt: string }> = {
  1: { src: '/landing/how/01.jpg', alt: 'Crear cuenta en el panel' },
  2: { src: '/landing/how/02.jpg', alt: 'Entrenar el agente con documentos' },
  3: { src: '/landing/how/03.jpg', alt: 'Diseñar el widget de chat' },
  4: { src: '/landing/how/04.jpg', alt: 'Copiar el snippet de código' },
  5: { src: '/landing/how/05.jpg', alt: 'Escalar uso en el dashboard' },
  6: { src: '/landing/how/06.jpg', alt: 'Operar varios agentes' },
};

/** Ilustración fotográfica por paso del onboarding. */
export function HowStepMock({ variant }: { variant: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const img = HOW_IMAGES[variant];

  return (
    <div className="how-step-visual" aria-hidden>
      <Image
        src={img.src}
        alt=""
        fill
        sizes="(max-width: 900px) 100vw, 360px"
        className="how-step-visual__img"
      />
      <span className="how-step-visual__glow" />
    </div>
  );
}
