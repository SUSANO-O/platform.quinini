'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

export type AdminUserOption = {
  id: string;
  email: string;
  displayName: string;
};

type Props = {
  selected: AdminUserOption | null;
  onSelect: (user: AdminUserOption | null) => void;
};

export function AdminUserPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AdminUserOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (selected || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/users/lookup?q=${encodeURIComponent(query)}`);
        const d = await r.json() as { users?: AdminUserOption[] };
        setSuggestions(d.users ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, selected]);

  if (selected) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(99,102,241,0.35)',
          background: 'rgba(99,102,241,0.08)',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{selected.email}</p>
          {selected.displayName ? (
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>{selected.displayName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <X size={12} /> Cambiar usuario
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar usuario por email, nombre o ID…"
          style={{
            width: '100%',
            padding: '11px 12px 11px 36px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--background)',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
        {searching ? (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}
          />
        ) : null}
      </div>
      {suggestions.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            left: 0,
            right: 0,
            marginTop: 6,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-surface-lg)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onSelect(u);
                setQuery('');
                setSuggestions([]);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600 }}>{u.email}</span>
              {u.displayName ? (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  {u.displayName}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
