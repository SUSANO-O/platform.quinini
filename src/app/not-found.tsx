import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="landing-auth-wrap" style={{ flexDirection: 'column' }}>
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '15%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '10%', right: '5%' }} />

      <div className="relative text-center max-w-md px-4">
        <p
          className="text-7xl md:text-8xl font-black m-0 mb-2 leading-none gradient-text font-display"
        >
          404
        </p>
        <h1 className="text-[22px] font-bold mb-2">Página no encontrada</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--muted-foreground)' }}>
          La página que buscas no existe o fue movida.
        </p>
        <Link href="/" className="landing-btn-primary no-underline !w-auto inline-flex px-8">
          ← Volver al inicio
        </Link>
      </div>

      <nav
        aria-label="Enlaces útiles"
        className="relative mt-8 pt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm px-4"
        style={{ borderTop: '1px solid var(--border-subtle)', maxWidth: '32rem' }}
      >
        <Link href="/pricing" className="landing-link-accent no-underline whitespace-nowrap">Precios</Link>
        <Link href="/preguntas-frecuentes" className="landing-link-accent no-underline whitespace-nowrap">Preguntas frecuentes</Link>
        <Link href="/login" className="landing-link-accent no-underline whitespace-nowrap">Iniciar sesión</Link>
      </nav>
    </div>
  );
}
