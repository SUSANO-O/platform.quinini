'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from '@/components/ui/icons';

export function AdminCollapsibleSection({
  title,
  subtitle,
  count,
  defaultOpen = true,
  maxHeight = 420,
  accentColor = '#6366f1',
  headerActions,
  children,
  empty = false,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  maxHeight?: number;
  accentColor?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  empty?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        background: 'var(--card)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderBottom: open ? '1px solid var(--border)' : undefined,
          background: 'var(--background)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            padding: 0,
            minWidth: 0,
          }}
        >
          <ChevronDown
            size={16}
            style={{
              color: accentColor,
              flexShrink: 0,
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s ease',
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {title}
              </span>
              {typeof count === 'number' && count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: `${accentColor}18`,
                    color: accentColor,
                  }}
                >
                  {count}
                </span>
              )}
            </div>
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                {subtitle}
              </p>
            )}
          </div>
        </button>
        {headerActions && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ flexShrink: 0 }}
          >
            {headerActions}
          </div>
        )}
      </div>

      {open && (
        <div
          style={{
            maxHeight: empty ? undefined : maxHeight,
            overflowY: empty ? 'visible' : 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
