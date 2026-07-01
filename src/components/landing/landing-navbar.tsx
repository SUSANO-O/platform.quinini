'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { LandingIcon } from '@/components/landing/landing-icon';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';
import { BRAND_LOGO_SRC, BRAND_NAME } from '@/lib/brand';
import { buildPricingInquiryWhatsAppUrl, SALES_WHATSAPP_LINK_PROPS } from '@/lib/sales-whatsapp';

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const t = useTranslations('nav');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src={BRAND_LOGO_SRC} alt={BRAND_NAME} width={100} height={30} className="h-7 w-auto object-contain rounded-lg" priority />
          <span className="landing-nav-brand text-black">
            {BRAND_NAME}
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="#agents"
            className="landing-btn text-xs font-medium transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {t('agents')}
          </Link>
          <Link
            href="#training"
            className="landing-btn text-xs font-medium transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {t('training')}
          </Link>
          <a
            href={buildPricingInquiryWhatsAppUrl()}
            {...SALES_WHATSAPP_LINK_PROPS}
            className="landing-btn text-xs font-medium transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted-foreground)')}
          >
            {t('pricing')}
          </a>
          <Link
            href="/preguntas-frecuentes"
            className="landing-btn text-xs font-medium transition-colors"
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
                className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition-all hover:shadow-lg"
                style={{ background: 'var(--brand-primary)' }}
              >
                {t('dashboard')}
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-xs font-semibold"
                  style={{ color: 'var(--foreground)' }}
                >
                  {t('signIn')}
                </Link>
                <a
                  href={buildPricingInquiryWhatsAppUrl()}
                  {...SALES_WHATSAPP_LINK_PROPS}
                  className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition-all hover:shadow-lg"
                  style={{ background: 'var(--brand-primary)' }}
                >
                  {t('startFree')}
                </a>
              </div>
            )
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ border: '1px solid var(--border)', background: open ? 'rgba(var(--brand-primary-rgb),0.07)' : 'transparent', color: open ? 'var(--primary)' : 'var(--foreground)' }}
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <LandingIcon name="close" size="lg" aria-hidden={false} /> : <LandingIcon name="menu" size="lg" aria-hidden={false} />}
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
            href="#agents"
            className="flex items-center text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            {t('agents')}
          </Link>
          <Link
            href="#training"
            className="flex items-center text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            {t('training')}
          </Link>
          <a
            href={buildPricingInquiryWhatsAppUrl()}
            {...SALES_WHATSAPP_LINK_PROPS}
            className="flex items-center text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setOpen(false)}
          >
            {t('pricing')}
          </a>
          <Link
            href="/preguntas-frecuentes"
            className="flex items-center text-xs font-medium px-3 py-2 rounded-lg transition-colors"
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
                  style={{ background: 'var(--brand-primary)', boxShadow: '0 4px 14px rgba(var(--brand-primary-rgb),0.25)' }}
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
                  <a
                    href={buildPricingInquiryWhatsAppUrl()}
                    {...SALES_WHATSAPP_LINK_PROPS}
                    className="text-center text-sm font-bold px-5 py-2.5 rounded-xl text-white"
                    style={{ background: 'var(--brand-primary)', boxShadow: '0 4px 14px rgba(var(--brand-primary-rgb),0.25)' }}
                    onClick={() => setOpen(false)}
                  >
                    {t('startFree')}
                  </a>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
