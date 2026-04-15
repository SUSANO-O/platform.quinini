import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="landing-auth-wrap">
      <div className="hero-glow" style={{ background: 'var(--gradient-start)', top: '-200px', left: '15%' }} />
      <div className="hero-glow" style={{ background: 'var(--accent)', top: '10%', right: '5%' }} />

      <div className="relative text-center max-w-md px-4">
        <p
          className="text-7xl md:text-8xl font-black m-0 mb-2 leading-none gradient-text"
          style={{ fontFamily: "'Clash Display', sans-serif" }}
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
    </div>
  );
}
