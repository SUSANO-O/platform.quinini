'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const t = useTranslations('nav');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/t1.png" alt="MatIAs" width={36} height={36} className="rounded-xl object-cover" style={{ aspectRatio: '1/1' }} />
          <span className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
            MatIAs
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            href="#pricing"
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {t('pricing')}
          </Link>
          <Link
            href="/preguntas-frecuentes"
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {t('faq')}
          </Link>

          <LanguageSwitcher />

          {!loading && (
            user ? (
              <Link
                href="/dashboard"
                className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:shadow-lg"
                style={{ background: 'linear-gradient(135deg, #e41414, #f87600)' }}
              >
                {t('dashboard')}
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-semibold"
                  style={{ color: 'var(--foreground)' }}
                >
                  {t('signIn')}
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #e41414, #f87600)' }}
                >
                  {t('startFree')}
                </Link>
              </div>
            )
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden px-6 pb-4 space-y-3" style={{ background: 'var(--background)' }}>
          <Link
            href="#pricing"
            className="block text-sm font-medium py-2"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={() => setOpen(false)}
          >
            {t('pricing')}
          </Link>
          <Link
            href="/preguntas-frecuentes"
            className="block text-sm font-medium py-2"
            style={{ color: 'var(--muted-foreground)' }}
            onClick={() => setOpen(false)}
          >
            {t('faq')}
          </Link>

          <div className="py-1">
            <LanguageSwitcher />
          </div>

          {!loading && (
            user ? (
              <Link
                href="/dashboard"
                className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                style={{ background: 'linear-gradient(135deg, #e41414, #f87600)' }}
                onClick={() => setOpen(false)}
              >
                {t('dashboard')}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block text-sm font-medium py-2"
                  style={{ color: 'var(--muted-foreground)' }}
                  onClick={() => setOpen(false)}
                >
                  {t('signIn')}
                </Link>
                <Link
                  href="/register"
                  className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                  style={{ background: 'linear-gradient(135deg, #e41414, #f87600)' }}
                  onClick={() => setOpen(false)}
                >
                  {t('startFree')}
                </Link>
              </>
            )
          )}
        </div>
      )}
    </nav>
  );
}
