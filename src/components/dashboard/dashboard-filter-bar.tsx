'use client';

import { Search } from '@/components/ui/icons';
import type { DashboardFilterOption } from '@/components/dashboard/dashboard-filter-menu';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

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
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      role="search"
      sx={{ mb: 2 }}
    >
      <TextField
        size="small"
        type="search"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        inputProps={{ 'aria-label': searchAriaLabel ?? searchPlaceholder }}
        sx={{ flex: 1, minWidth: 0 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={14} aria-hidden />
            </InputAdornment>
          ),
        }}
      />

      <ToggleButtonGroup
        exclusive
        size="small"
        value={filterValue}
        onChange={(_e, next) => {
          if (next != null) onFilterChange(next as T);
        }}
        aria-label={filterAriaLabel}
        sx={{ flexWrap: 'wrap' }}
      >
        {filterOptions.map((opt) => (
          <ToggleButton key={opt.value} value={opt.value} sx={{ textTransform: 'none', px: 1.5 }}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
