'use client';

/**
 * Barra minimalista compartida: búsqueda + chips de filtro.
 * Usada en `/dashboard/agents` y `/dashboard/widgets`.
 */
import { Search } from 'lucide-react';
import type { DashboardFilterOption } from '@/components/dashboard/dashboard-filter-menu';

export function DashboardFilterBar<T extends string>({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  searchAriaLabel,
  filterValue,
  filterOptions,
  onFilterChange,
  filterAriaLabel = 'Filtrar lista',
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  filterValue: T;
  filterOptions: DashboardFilterOption<T>[];
  onFilterChange: (value: T) => void;
  filterAriaLabel?: string;
}) {
  return (
    <div className="dashboard-filter-bar" role="search">
      <label className="dashboard-filter-bar__search">
        <Search size={14} className="dashboard-filter-bar__search-icon" aria-hidden />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel ?? searchPlaceholder}
          className="dashboard-filter-bar__search-input"
        />
      </label>

      <div className="dashboard-filter-bar__chips" role="group" aria-label={filterAriaLabel}>
        {filterOptions.map((opt) => {
          const active = opt.value === filterValue;
          return (
            <button
              key={opt.value}
              type="button"
              className={`dashboard-filter-bar__chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => onFilterChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
