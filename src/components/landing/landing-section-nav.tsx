'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'agents', label: 'Agentes' },
  { id: 'training', label: 'Capacitación' },
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
      className="sticky top-14 z-40 border-b backdrop-blur-md"
      style={{
        background: 'rgba(244, 247, 248, 0.92)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-5 py-1.5 flex gap-1.5 overflow-x-auto">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold no-underline transition-colors"
            style={{
              background: activeId === id ? 'rgba(var(--brand-primary-rgb),0.1)' : 'transparent',
              color: activeId === id ? 'var(--primary)' : 'var(--muted-foreground)',
              border: activeId === id ? '1px solid rgba(var(--brand-primary-rgb),0.25)' : '1px solid transparent',
            }}
          >
            {labels?.[id] ?? label}
          </a>
        ))}
        <a
          href="/preguntas-frecuentes"
          className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold no-underline ml-auto"
          style={{ color: 'var(--muted-foreground)' }}
        >
          FAQ →
        </a>
      </div>
    </div>
  );
}
