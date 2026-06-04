'use client';

import { useEffect, useRef, useState } from 'react';
import { Filter, Check } from 'lucide-react';
import { DashboardButton } from '@/components/dashboard/dashboard-button';

export type DashboardFilterOption<T extends string> = {
  value: T;
  label: string;
};

export function DashboardFilterMenu<T extends string>({
  label = 'Filtrar',
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: DashboardFilterOption<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value);
  const isFiltered = value !== options[0]?.value;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="dashboard-filter-menu" ref={ref}>
      <DashboardButton
        variant="secondary"
        className={`dashboard-filter-menu__trigger${isFiltered ? ' is-active' : ''}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Filter size={14} />
        {label}
        {isFiltered && active ? (
          <span className="dashboard-filter-menu__pill">{active.label}</span>
        ) : null}
      </DashboardButton>

      {open ? (
        <div className="dashboard-filter-menu__panel" role="menu">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`dashboard-filter-menu__option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
                {selected ? <Check size={14} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
