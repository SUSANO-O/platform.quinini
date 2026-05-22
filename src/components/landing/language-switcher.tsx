'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = (next: string) => {
    router.replace(pathname, { locale: next });
  };

  return (
    <div className="flex items-center gap-0.5 text-xs font-bold">
      <button
        type="button"
        onClick={() => switchTo('es')}
        aria-label="Cambiar idioma a español"
        aria-pressed={locale === 'es'}
        className="px-2 py-1 rounded-lg transition-colors"
        style={{
          color: locale === 'es' ? 'var(--primary)' : 'var(--muted-foreground)',
          background: locale === 'es' ? 'rgba(var(--brand-primary-rgb),0.08)' : 'transparent',
        }}
      >
        ES
      </button>
      <span style={{ color: 'var(--border)' }}>|</span>
      <button
        type="button"
        onClick={() => switchTo('en')}
        aria-label="Switch language to English"
        aria-pressed={locale === 'en'}
        className="px-2 py-1 rounded-lg transition-colors"
        style={{
          color: locale === 'en' ? 'var(--primary)' : 'var(--muted-foreground)',
          background: locale === 'en' ? 'rgba(var(--brand-primary-rgb),0.08)' : 'transparent',
        }}
      >
        EN
      </button>
    </div>
  );
}
