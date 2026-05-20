'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'agents', label: 'Agentes' },
  { id: 'training', label: 'Capacitación' },
  { id: 'pricing', label: 'Precios' },
] as const;

type LandingSectionNavProps = {
  labels?: Record<string, string>;
};

export function LandingSectionNav({ labels }: LandingSectionNavProps) {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visibleEntries[0]?.target.id) setActiveId(visibleEntries[0].target.id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.2, 0.5] },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      className="sticky top-16 z-40 border-b backdrop-blur-md"
      style={{
        background: 'rgba(250,251,252,0.92)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-2 flex gap-2 overflow-x-auto">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold no-underline transition-colors"
            style={{
              background: activeId === id ? 'rgba(228,20,20,0.1)' : 'transparent',
              color: activeId === id ? 'var(--primary)' : 'var(--muted-foreground)',
              border: activeId === id ? '1px solid rgba(228,20,20,0.25)' : '1px solid transparent',
            }}
          >
            {labels?.[id] ?? label}
          </a>
        ))}
        <a
          href="/preguntas-frecuentes"
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold no-underline ml-auto"
          style={{ color: 'var(--muted-foreground)' }}
        >
          FAQ →
        </a>
      </div>
    </div>
  );
}
