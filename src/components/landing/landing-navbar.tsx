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
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ border: '1px solid var(--border)', background: open ? 'rgba(228,20,20,0.07)' : 'transparent', color: open ? '#e41414' : 'var(--foreground)' }}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className="md:hidden overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: open ? '400px' : '0px',
          opacity: open ? 1 : 0,
          borderTop: open ? '1px solid var(--border)' : '1px solid transparent',
        }}
      >
        <div
          className="px-5 py-4 flex flex-col gap-1"
          style={{ background: 'var(--card)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
        >
          <Link
            href="#pricing"
            className="flex items-center text-sm font-medium px-3 py-2.5 rounded-xl transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            {t('pricing')}
          </Link>
          <Link
            href="/preguntas-frecuentes"
            className="flex items-center text-sm font-medium px-3 py-2.5 rounded-xl transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            {t('faq')}
          </Link>

          <div className="px-3 py-1">
            <LanguageSwitcher />
          </div>

          <div className="mt-2 pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            {!loading && (
              user ? (
                <Link
                  href="/dashboard"
                  className="text-center text-sm font-bold px-5 py-2.5 rounded-xl text-white"
                  style={{ background: 'linear-gradient(135deg, #e41414, #f87600)', boxShadow: '0 4px 14px rgba(228,20,20,0.25)' }}
                  onClick={() => setOpen(false)}
                >
                  {t('dashboard')}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-center text-sm font-semibold px-5 py-2.5 rounded-xl border transition-colors"
                    style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }}
                    onClick={() => setOpen(false)}
                  >
                    {t('signIn')}
                  </Link>
                  <Link
                    href="/register"
                    className="text-center text-sm font-bold px-5 py-2.5 rounded-xl text-white"
                    style={{ background: 'linear-gradient(135deg, #e41414, #f87600)', boxShadow: '0 4px 14px rgba(228,20,20,0.25)' }}
                    onClick={() => setOpen(false)}
                  >
                    {t('startFree')}
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
