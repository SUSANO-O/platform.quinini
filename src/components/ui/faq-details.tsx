'use client';

import { BRAND } from '@/lib/brand-colors';

type FaqDetailsProps = {
  question: string;
  answer: string;
  accent?: string;
};

export function FaqDetails({ question, answer, accent = BRAND.primary }: FaqDetailsProps) {
  return (
    <details
      className="mb-3 rounded-xl overflow-hidden card-texture group"
      style={{ border: '1px solid var(--border)' }}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        e.currentTarget.querySelector('summary')?.setAttribute('aria-expanded', String(open));
      }}
    >
      <summary
        aria-expanded="false"
        className="px-6 py-4 font-semibold cursor-pointer text-sm flex items-center justify-between"
        style={{ listStyle: 'none' }}
      >
        {question}
        <span
          className="transition-transform group-open:rotate-45"
          style={{ color: accent, fontSize: 18, fontWeight: 300 }}
          aria-hidden
        >
          +
        </span>
      </summary>
      <p className="px-6 pb-5 text-sm m-0" style={{ color: 'var(--muted-foreground)' }}>
        {answer}
      </p>
    </details>
  );
}
