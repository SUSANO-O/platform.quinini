'use client';

import { Search } from 'lucide-react';

export function DashboardSearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  ariaLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`dashboard-search-input${className ? ` ${className}` : ''}`}>
      <Search size={14} className="dashboard-search-input__icon" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="dashboard-search-input__field"
      />
    </div>
  );
}
