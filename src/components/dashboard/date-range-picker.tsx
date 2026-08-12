'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown } from '@/components/ui/icons';
import { DashboardButton } from '@/components/dashboard/dashboard-button';
import { resolveRange, toColombiaDateInput, type DateRange, type RangePreset } from '@/lib/date-range';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'last_7d', label: 'Últimos 7 días' },
  { key: 'last_30d', label: 'Últimos 30 días' },
  { key: 'last_90d', label: 'Últimos 90 días' },
  { key: 'this_month', label: 'Este mes' },
  { key: 'last_month', label: 'Mes anterior' },
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toColombiaDateInput(value.from));
  const [customTo, setCustomTo] = useState(() => toColombiaDateInput(value.to));
  const ref = useRef<HTMLDivElement>(null);
  const isCustom = value.preset === 'custom';

  useEffect(() => {
    setCustomFrom(toColombiaDateInput(value.from));
    setCustomTo(toColombiaDateInput(value.to));
  }, [value.from, value.to]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function selectPreset(key: RangePreset) {
    if (key === 'custom') return;
    onChange(resolveRange(key));
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    onChange(resolveRange('custom', customFrom, customTo));
    setOpen(false);
  }

  return (
    <div className="dashboard-filter-menu dashboard-date-range-picker" ref={ref}>
      <DashboardButton
        variant="secondary"
        className={`dashboard-filter-menu__trigger${isCustom ? ' is-active' : ''}`}
        aria-label="Filtrar por fecha"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Calendar size={14} />
        {value.label}
        <ChevronDown
          size={14}
          aria-hidden
          className={`dashboard-date-range-picker__chevron${open ? ' is-open' : ''}`}
        />
      </DashboardButton>

      {open ? (
        <div
          className="dashboard-filter-menu__panel dashboard-date-range-picker__panel"
          role="menu"
        >
          {PRESETS.map((p) => {
            const selected = value.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`dashboard-filter-menu__option${selected ? ' is-selected' : ''}`}
                onClick={() => selectPreset(p.key)}
              >
                <span>{p.label}</span>
                {selected ? <Check size={14} aria-hidden /> : null}
              </button>
            );
          })}

          <div className="dashboard-date-range-picker__custom">
            <p className="dashboard-date-range-picker__custom-title">Personalizado</p>
            <div className="dashboard-date-range-picker__fields">
              <label className="dashboard-date-range-picker__field">
                <span className="dashboard-date-range-picker__field-label">Desde</span>
                <input
                  type="date"
                  className="dashboard-date-range-picker__input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="dashboard-date-range-picker__field">
                <span className="dashboard-date-range-picker__field-label">Hasta</span>
                <input
                  type="date"
                  className="dashboard-date-range-picker__input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
              <DashboardButton
                variant="primary"
                className="dashboard-date-range-picker__apply"
                disabled={!customFrom || !customTo}
                onClick={applyCustom}
              >
                Aplicar
              </DashboardButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
