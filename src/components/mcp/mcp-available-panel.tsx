'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Plug, ExternalLink, AlertCircle } from 'lucide-react';
import type { McpCatalogRow } from '@/lib/mcp-catalog-types';

type Props = {
  /** En formulario nuevo agente: menos altura y enlace al listado completo */
  compact?: boolean;
  /** Si se define, cada tarjeta es clicable para iniciar conexión MCP (modal en el padre). */
  onConnectRequest?: (row: McpCatalogRow) => void;
};

const INTEGRATION_ICONS: Record<string, string> = {
  gmail: '📧',
  hubspot: '🏢',
  google_calendar: '📅',
  slack: '💬',
  weather: '🌤️',
  webSearch: '🔍',
};

export function McpAvailablePanel({ compact, onConnectRequest }: Props) {
  const [catalog, setCatalog] = useState<McpCatalogRow[]>([]);
  const [backendBase, setBackendBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/mcp/available', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setError(typeof data.error === 'string' ? data.error : 'No se pudo cargar el catálogo MCP.');
          setCatalog([]);
        } else {
          const list = Array.isArray(data.catalog) ? data.catalog : [];
          setCatalog(list.filter((row: McpCatalogRow) => row?.key !== 'mcp_standard'));
          if (typeof data.backendBase === 'string') setBackendBase(data.backendBase);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error de red');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = compact ? catalog.slice(0, 6) : catalog;

  return (
    <div>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--muted-foreground)', fontSize: '13px' }}>
          <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
          Cargando catálogo MCP desde el backend…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            color: '#ef4444',
            fontSize: '13px',
            lineHeight: 1.45,
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ display: 'block', marginBottom: '4px' }}>No se pudo conectar con AIBackHub</strong>
            {error}
            <p style={{ margin: '8px 0 0', fontSize: '12px', opacity: 0.95 }}>
              Define <code style={{ fontSize: '11px' }}>BACKEND_URL</code> (y opcionalmente{' '}
              <code style={{ fontSize: '11px' }}>AIBACKHUB_API_KEY</code>) en <code style={{ fontSize: '11px' }}>.env</code> de la landing y
              reinicia el servidor.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && backendBase && (
        <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: compact ? '10px' : '14px', lineHeight: 1.5 }}>
          Origen del catálogo:{' '}
          <code style={{ fontSize: '11px', background: 'var(--background)', padding: '2px 6px', borderRadius: '6px' }}>{backendBase}</code>
          {' '}→ <code style={{ fontSize: '11px' }}>/api/mcp/catalog</code>
        </p>
      )}

      {!loading && !error && shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '8px' : '10px' }}>
          {shown.map((row) => (
            <div
              key={row.key}
              role={onConnectRequest ? 'button' : undefined}
              tabIndex={onConnectRequest ? 0 : undefined}
              onClick={onConnectRequest ? () => onConnectRequest(row) : undefined}
              onKeyDown={
                onConnectRequest
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onConnectRequest(row);
                      }
                    }
                  : undefined
              }
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: compact ? '10px 12px' : '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                cursor: onConnectRequest ? 'pointer' : undefined,
                transition: onConnectRequest ? 'background 0.15s, border-color 0.15s' : undefined,
              }}
            >
              <span style={{ fontSize: compact ? '18px' : '22px', flexShrink: 0, lineHeight: 1.2 }}>
                {INTEGRATION_ICONS[row.key] ?? '🔌'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 4px', color: 'var(--foreground)' }}>
                  {row.name}
                  {onConnectRequest && (
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(99,102,241,0.12)',
                        color: '#6366f1',
                        verticalAlign: 'middle',
                      }}
                    >
                      Conectar
                    </span>
                  )}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>{row.description}</p>
                <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '6px 0 0', fontFamily: 'ui-monospace, monospace' }}>
                  key: <code>{row.key}</code> · tools: <code>{row.toolIdPrefix}*</code>
                </p>
                {row.authMethods && row.authMethods.length > 0 && !compact && (
                  <p style={{ fontSize: '10px', color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
                    Auth: {row.authMethods.map((a) => a.label).join(' · ')}
                  </p>
                )}
                {row.docsUrl && (
                  <a
                    href={row.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#6366f1',
                      textDecoration: 'none',
                      marginTop: '6px',
                    }}
                  >
                    Documentación <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && catalog.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)' }}>El backend devolvió un catálogo vacío.</p>
      )}

      {compact && catalog.length > 6 && (
        <Link
          href="/dashboard/mcp"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#6366f1',
            textDecoration: 'none',
          }}
        >
          <Plug size={14} />
          Ver todas las integraciones MCP ({catalog.length})
        </Link>
      )}
    </div>
  );
}
