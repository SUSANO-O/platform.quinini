'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  Code2, Copy, Check, Download, MoreVertical, Pencil, Play,
  Power, PowerOff, Share2, Trash2,
} from 'lucide-react';
import { UI_SURFACE_SECONDARY } from '@/lib/brand';

const BTN_SECONDARY: CSSProperties = { ...UI_SURFACE_SECONDARY };

export type WidgetListItem = {
  _id: string;
  name: string;
  agentId: string;
  agentName?: string | null;
  color: string;
  position: string;
  theme: string;
  createdAt: string;
  afhubToken?: string | null;
  multiAgentEnabled?: boolean;
  multiAgentMode?: 'triage' | 'parallel' | 'pipeline';
  active?: boolean;
};

function formatWidgetMeta(w: WidgetListItem): string {
  const date = new Date(w.createdAt).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const pos = w.position.replace(/-/g, ' ');
  return `${pos} · ${w.theme} · ${date}`;
}

export function WidgetListCard({
  widget: w,
  isActive,
  toggling,
  expanded,
  copied,
  origin,
  avatar,
  onToggleActive,
  onToggleCode,
  onCopyCode,
  onExportHistory,
  onDelete,
  buildSnippet,
}: {
  widget: WidgetListItem;
  isActive: boolean;
  toggling: boolean;
  expanded: boolean;
  copied: boolean;
  origin: string;
  avatar: React.ReactNode;
  onToggleActive: () => void;
  onToggleCode: () => void;
  onCopyCode: () => void;
  onExportHistory: () => void;
  onDelete: () => void;
  buildSnippet: (w: WidgetListItem, origin: string) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const menuItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '9px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--foreground)',
    textAlign: 'left',
  };

  return (
    <div
      className="card-hover rounded-2xl overflow-hidden border"
      style={{
        borderColor: isActive ? 'var(--border)' : 'rgba(239,68,68,0.35)',
        background: 'var(--card)',
        opacity: isActive ? 1 : 0.92,
      }}
    >
      <div style={{ height: 3, background: isActive ? w.color : '#94a3b8' }} />

      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3 min-w-0">
          {avatar}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="m-0 text-sm font-bold truncate">{w.name}</h2>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: isActive ? '#16a34a' : '#ef4444',
                  flexShrink: 0,
                }}
              >
                {isActive ? 'Activo' : 'Off'}
              </span>
              {w.multiAgentEnabled && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                  style={BTN_SECONDARY}
                >
                  Multi ·{' '}
                  {w.multiAgentMode === 'parallel'
                    ? 'paralelo'
                    : w.multiAgentMode === 'pipeline'
                      ? 'pipeline'
                      : 'triaje'}
                </span>
              )}
            </div>

            <p className="text-xs m-0 mb-1 truncate" style={{ color: 'var(--foreground)' }}>
              {w.agentName?.trim() || 'Sin agente vinculado'}
            </p>
            <p className="text-[11px] m-0 truncate" style={{ color: 'var(--muted-foreground)' }}>
              {formatWidgetMeta(w)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link
            href={`/dashboard/widget-builder?edit=${w._id}`}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold no-underline transition-opacity hover:opacity-90 flex-1 sm:flex-none"
            style={{
              background: 'var(--primary)',
              color: '#fff',
              boxShadow: '0 2px 10px rgba(var(--brand-primary-rgb),0.22)',
            }}
          >
            <Pencil size={13} />
            Editar
          </Link>

          <Link
            href={`/dashboard/widget-preview?id=${w._id}`}
            title="Probar el chat"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold no-underline transition-opacity hover:opacity-90 flex-1 sm:flex-none"
            style={BTN_SECONDARY}
          >
            <Play size={13} />
            Probar
          </Link>

          <div className="relative ml-auto" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border cursor-pointer transition-colors hover:opacity-90"
              style={{ ...BTN_SECONDARY, padding: 0 }}
              aria-label="Más acciones"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={16} />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-20 min-w-[190px] rounded-xl border py-1 shadow-lg"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                }}
              >
                <button
                  type="button"
                  style={menuItemStyle}
                  disabled={toggling}
                  onClick={() => { setMenuOpen(false); onToggleActive(); }}
                >
                  {isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  {isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  style={menuItemStyle}
                  onClick={() => { setMenuOpen(false); onToggleCode(); }}
                >
                  <Code2 size={14} />
                  Código embed
                </button>
                <Link
                  href={`/dashboard/widgets/${w._id}/shares`}
                  style={{ ...menuItemStyle, textDecoration: 'none' }}
                  onClick={() => setMenuOpen(false)}
                >
                  <Share2 size={14} style={{ color: '#6366f1' }} />
                  Compartir
                </Link>
                <button
                  type="button"
                  style={menuItemStyle}
                  onClick={() => { setMenuOpen(false); onExportHistory(); }}
                >
                  <Download size={14} />
                  Historial
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  type="button"
                  style={{ ...menuItemStyle, color: '#ef4444' }}
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t overflow-hidden" style={{ borderColor: 'var(--border)', background: '#0d1117' }}>
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#161b22' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
                Código embed
              </span>
            </div>
            <button
              type="button"
              onClick={onCopyCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border-0 cursor-pointer transition-all shrink-0"
              style={{
                background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                color: copied ? '#4ade80' : '#94a3b8',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>

          {w.afhubToken && w.afhubToken.startsWith('wt_') && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(99,102,241,0.07)' }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: '#818cf8' }}>
                Token
              </span>
              <code className="text-[11px] font-mono flex-1 truncate" style={{ color: '#c7d2fe' }}>
                {w.afhubToken}
              </code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(w.afhubToken!); }}
                className="shrink-0 border-0 cursor-pointer rounded px-2 py-0.5 text-[10px] font-semibold transition-all"
                style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8' }}
              >
                Copiar
              </button>
            </div>
          )}

          <pre
            className="p-4 text-[11px] overflow-x-auto m-0"
            style={{
              color: '#e2e8f0',
              lineHeight: 1.7,
              fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
              tabSize: 2,
            }}
          >
            {buildSnippet(w, origin)}
          </pre>

          <div
            className="px-4 py-2.5 border-t flex items-center gap-2"
            style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#161b22' }}
          >
            <span style={{ fontSize: 10, color: '#4b5563' }}>
              Pega antes de &lt;/body&gt;. Los cambios del builder se propagan solos.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
