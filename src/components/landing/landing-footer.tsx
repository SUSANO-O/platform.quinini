import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

export async function LandingFooter() {
  const t = await getTranslations('footer');

  return (
    <footer style={{ borderColor: 'var(--border)', background: 'var(--muted)' }} className="border-t">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <Image src="/t1.png" alt="MatIAs" width={32} height={32} className="rounded-lg object-cover" style={{ aspectRatio: '1/1' }} />
              <span className="font-bold">MatIAs</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {t('tagline')}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('product')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/playground" className="hover:underline">Playground</Link></li>
              <li><Link href="#pricing" className="hover:underline">{t('plans')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('company')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/" className="hover:underline">{t('home')}</Link></li>
              <li><Link href="/widget" className="hover:underline">Widget API</Link></li>
              <li><Link href="#pricing" className="hover:underline">{t('plans')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('legal')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/terminos-y-condiciones" className="hover:underline">{t('terms')}</Link></li>
              <li><Link href="/politica-de-privacidad" className="hover:underline">{t('privacy')}</Link></li>
              <li><Link href="/politica-de-cookies" className="hover:underline">{t('cookies')}</Link></li>
              <li><Link href="/politica-de-reembolso" className="hover:underline">{t('refunds')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 text-center text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          &copy; {new Date().getFullYear()} MatIAs. Powered by AIBackHub.
        </div>
      </div>
    </footer>
  );
}
