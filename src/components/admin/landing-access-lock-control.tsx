'use client';

import { Lock, RefreshCw } from 'lucide-react';

type Props = {
  enabled: boolean;
  accessCode: string | null;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
  onRegenerate: () => void;
  onCodeChange: (code: string) => void;
  onSaveCode: () => void;
};

export function AdminLandingAccessLockControl({
  enabled,
  accessCode,
  saving,
  onToggle,
  onRegenerate,
  onCodeChange,
  onSaveCode,
}: Props) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${enabled ? 'rgba(234,179,8,0.45)' : 'var(--border)'}`,
        background: enabled ? 'rgba(234,179,8,0.06)' : 'transparent',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          color: enabled ? '#ca8a04' : 'var(--muted-foreground)',
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ accentColor: '#ca8a04' }}
        />
        <Lock size={12} />
        Candado landing
      </label>

      {enabled && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={accessCode ?? ''}
              onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
              placeholder="Código"
              disabled={saving}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--background)',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                letterSpacing: '0.08em',
              }}
            />
            <button
              type="button"
              title="Generar nuevo código"
              disabled={saving}
              onClick={onRegenerate}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--background)',
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <button
            type="button"
            disabled={saving || !accessCode?.trim()}
            onClick={onSaveCode}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              border: '1px solid rgba(234,179,8,0.45)',
              background: 'rgba(234,179,8,0.1)',
              color: '#a16207',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Guardar código
          </button>
        </div>
      )}
    </div>
  );
}
