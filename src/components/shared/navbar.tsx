'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { SITE_NAV_LINKS } from '@/lib/site-nav';

const NAV_LINKS = SITE_NAV_LINKS;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={120} height={36} className="h-9 w-auto object-contain rounded-xl" priority />
          <span className="text-lg font-bold text-black font-display">
            {BRAND_NAME}
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--muted-foreground)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
              >
                {l.label}
              </Link>
            ))}

          {!loading && (
            user ? (
              <Link
                href="/dashboard"
                className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:shadow-lg"
              style={{ background: 'var(--brand-primary)' }}
              >
                Dashboard →
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-semibold"
                  style={{ color: 'var(--foreground)' }}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:shadow-lg"
                  style={{ background: 'var(--brand-primary)' }}
                >
                  Ver precios
                </Link>
              </div>
            )
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden px-6 pb-4 space-y-3" style={{ background: 'var(--background)' }}>
          {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block text-sm font-medium py-2"
                style={{ color: 'var(--muted-foreground)' }}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          {!loading && (
            user ? (
              <Link
                href="/dashboard"
                className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                style={{ background: 'var(--brand-primary)' }}
                onClick={() => setOpen(false)}
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="block text-sm font-medium py-2" style={{ color: 'var(--muted-foreground)' }} onClick={() => setOpen(false)}>
                  Iniciar sesión
                </Link>
                <Link
                  href="/pricing"
                  className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                  style={{ background: 'var(--brand-primary)' }}
                  onClick={() => setOpen(false)}
                >
                  Ver precios
                </Link>
              </>
            )
          )}
        </div>
      )}
    </nav>
  );
}
