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
        onClick={() => switchTo('es')}
        className="px-2 py-1 rounded-lg transition-colors"
        style={{
          color: locale === 'es' ? '#e41414' : 'var(--muted-foreground)',
          background: locale === 'es' ? 'rgba(228,20,20,0.08)' : 'transparent',
        }}
      >
        ES
      </button>
      <span style={{ color: 'var(--border)' }}>|</span>
      <button
        onClick={() => switchTo('en')}
        className="px-2 py-1 rounded-lg transition-colors"
        style={{
          color: locale === 'en' ? '#e41414' : 'var(--muted-foreground)',
          background: locale === 'en' ? 'rgba(228,20,20,0.08)' : 'transparent',
        }}
      >
        EN
      </button>
    </div>
  );
}
