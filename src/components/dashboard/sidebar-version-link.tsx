'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-release-notes';
import { BRAND_TEXT_COLOR } from '@/lib/brand';

type SidebarVersionLinkProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function SidebarVersionLink({ collapsed, onNavigate }: SidebarVersionLinkProps) {
  const label = `v${APP_VERSION}`;

  return (
    <Link
      href="/dashboard/whats-new"
      onClick={onNavigate}
      title={`Novedades de ${label}`}
      className="dashboard-sidebar-version-link"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 6,
        marginTop: 6,
        padding: collapsed ? '6px 0' : '6px 10px',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--muted-foreground)',
        textDecoration: 'none',
        width: '100%',
        transition: 'color 0.15s ease, background 0.15s ease',
      }}
    >
      <Sparkles size={13} strokeWidth={2} aria-hidden style={{ color: BRAND_TEXT_COLOR, flexShrink: 0 }} />
      {!collapsed ? (
        <>
          <span style={{ color: BRAND_TEXT_COLOR }}>{label}</span>
          <span style={{ opacity: 0.85 }}>· Novedades</span>
        </>
      ) : (
        <span className="sr-only">{label} — Novedades</span>
      )}
    </Link>
  );
}
