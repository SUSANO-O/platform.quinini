import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--background)', padding: '24px', textAlign: 'center',
    }}>
      <div>
        <p style={{ fontSize: '80px', fontWeight: 900, margin: '0 0 8px', background: 'linear-gradient(135deg,#0d9488,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          404
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Página no encontrada</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '14px', marginBottom: '28px' }}>
          La página que buscas no existe o fue movida.
        </p>
        <Link href="/" style={{
          display: 'inline-block', padding: '11px 28px', borderRadius: '10px',
          background: '#6366f1', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '14px',
        }}>
          ← Volver al inicio
        </Link>
      </div>
    </div>
  );
}
