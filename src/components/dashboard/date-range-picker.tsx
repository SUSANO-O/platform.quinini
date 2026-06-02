'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { resolveRange, toColombiaDateInput, type DateRange, type RangePreset } from '@/lib/date-range';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today',       label: 'Hoy' },
  { key: 'last_7d',     label: 'Últimos 7 días' },
  { key: 'last_30d',    label: 'Últimos 30 días' },
  { key: 'last_90d',    label: 'Últimos 90 días' },
  { key: 'this_month',  label: 'Este mes' },
  { key: 'last_month',  label: 'Mes anterior' },
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toColombiaDateInput(value.from));
  const [customTo, setCustomTo]     = useState(() => toColombiaDateInput(value.to));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  function selectPreset(key: RangePreset) {
    if (key === 'custom') return; // handled separately
    onChange(resolveRange(key));
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    onChange(resolveRange('custom', customFrom, customTo));
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-surface-sm)',
        }}
      >
        <Calendar size={13} style={{ opacity: 0.7 }} />
        <span>{value.label}</span>
        <ChevronDown size={12} style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 240,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 6,
            zIndex: 100,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => selectPreset(p.key)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 10px',
                background: value.preset === p.key ? 'rgba(99,102,241,0.08)' : 'transparent',
                border: 'none',
                borderRadius: 7,
                color: value.preset === p.key ? '#6366f1' : 'var(--foreground)',
                fontSize: 12,
                fontWeight: value.preset === p.key ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {p.label}
            </button>
          ))}

          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0', paddingTop: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', margin: '0 0 6px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Personalizado
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                <span style={{ width: 40 }}>Desde</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--muted)', color: 'var(--foreground)' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                <span style={{ width: 40 }}>Hasta</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--muted)', color: 'var(--foreground)' }}
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
                style={{
                  marginTop: 4,
                  padding: '6px 8px',
                  background: !customFrom || !customTo ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: !customFrom || !customTo ? 'not-allowed' : 'pointer',
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
