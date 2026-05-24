import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

export async function LandingFooter() {
  const t = await getTranslations('footer');

  return (
    <footer style={{ borderColor: 'var(--border)', background: 'var(--muted)' }} className="border-t">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={100} height={30} className="h-8 w-auto object-contain rounded-lg" />
              <span className="font-bold">{BRAND_NAME}</span>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>
              {t('tagline')}
            </p>
            <a
              href={`mailto:${t('email')}`}
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: 'var(--foreground)' }}
            >
              ✉ {t('email')}
            </a>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('product')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/pricing#api" className="hover:underline">API</Link></li>
              <li><Link href="/pricing" className="hover:underline">{t('plans')}</Link></li>
              <li><Link href="#agents" className="hover:underline">Agentes</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('contact')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><a href={`mailto:${t('email')}`} className="hover:underline">{t('email')}</a></li>
              <li><Link href="#training" className="hover:underline">Capacitación</Link></li>
              <li><Link href="/preguntas-frecuentes" className="hover:underline">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">{t('legal')}</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/terminos-y-condiciones" className="hover:underline">{t('terms')}</Link></li>
              <li><Link href="/politica-de-privacidad" className="hover:underline">{t('privacy')}</Link></li>
              <li><Link href="/politica-de-cookies" className="hover:underline">{t('cookies')}</Link></li>
              <li><Link href="/politica-de-reembolso" className="hover:underline">{t('refunds')}</Link></li>
              <li><Link href="/compliance" className="hover:underline">Tratamiento de datos</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          <span>&copy; {new Date().getFullYear()} BotIvA. {t('rights')}</span>
          <span>Powered by quinini</span>
        </div>
      </div>
    </footer>
  );
}
