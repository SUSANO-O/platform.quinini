import Link from 'next/link';
import Image from 'next/image';
import { SITE_COMPANY_LINKS, SITE_LEGAL_LINKS, SITE_PRODUCT_LINKS } from '@/lib/site-nav';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';

export function Footer() {
  return (
    <footer style={{ borderColor: 'var(--border)', background: 'var(--muted)' }} className="border-t">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={100} height={30} className="h-8 w-auto object-contain rounded-lg" />
              <span className="font-bold">{BRAND_NAME}</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Agentes de IA como servicio.<br />
              API REST full, integración en minutos.
            </p>
            <a
              href="mailto:privacidad@BotIvA.app"
              className="inline-block mt-4 text-sm font-medium hover:underline"
              style={{ color: 'var(--foreground)' }}
            >
              privacidad@BotIvA.app
            </a>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Producto</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {SITE_PRODUCT_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Empresa</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/es" className="hover:underline">Inicio</Link></li>
              {SITE_COMPANY_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {SITE_LEGAL_LINKS.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:underline">{l.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 text-center text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          &copy; {new Date().getFullYear()} BotIvA. Powered by quinini.
        </div>
      </div>
    </footer>
  );
}
