'use client';

import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { Search } from '@/components/ui/icons';

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
    <TextField
      className={className}
      size="small"
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputProps={{ 'aria-label': ariaLabel ?? placeholder }}
      fullWidth
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={14} aria-hidden />
          </InputAdornment>
        ),
      }}
    />
  );
}
