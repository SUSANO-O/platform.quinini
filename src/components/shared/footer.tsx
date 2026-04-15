import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer style={{ borderColor: 'var(--border)', background: 'var(--muted)' }} className="border-t">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <Image src="/t.jpg" alt="MatIAs" width={32} height={32} className="rounded-lg object-cover" style={{ aspectRatio: '1/1' }} />
              <span className="font-bold">MatIAs</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Agentes de IA como servicio.<br />
              Una API, integración en minutos.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Producto</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/playground" className="hover:underline">Playground</Link></li>
              <li><Link href="/pricing" className="hover:underline">Precios</Link></li>
              <li><Link href="/docs" className="hover:underline">Documentación API</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Desarrolladores</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/docs" className="hover:underline">Docs</Link></li>
              <li><Link href="/dashboard" className="hover:underline">Claves API</Link></li>
              <li><Link href="/docs#sdks" className="hover:underline">SDKs</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Empresa</h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>
              <li><Link href="/" className="hover:underline">Inicio</Link></li>
              <li><Link href="/widget" className="hover:underline">Widget API</Link></li>
              <li><Link href="/#pricing" className="hover:underline">Planes</Link></li>
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
