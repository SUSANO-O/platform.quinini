'use client';

import Link from 'next/link';
import {
  Bot, ChevronLeft, CircleOff, Loader2, Sparkles, Trash2,
} from 'lucide-react';

export function AgentDetailHeader({
  name,
  model,
  isDisabled,
  hubSynced,
  ragSummary,
  readOnly,
  deleting,
  saving,
  onToggleStatus,
  onDelete,
}: {
  name: string;
  model: string;
  isDisabled: boolean;
  hubSynced: boolean;
  ragSummary: string | null;
  readOnly: boolean;
  deleting: boolean;
  saving: boolean;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const R = 'var(--primary)';

  return (
    <div className="mb-6">
      <Link
        href="/dashboard/agents"
        className="landing-link-accent inline-flex items-center gap-1 text-xs no-underline mb-4 font-semibold"
      >
        <ChevronLeft size={14} /> Mis agentes
      </Link>

      <div
        className="rounded-2xl border overflow-hidden card-texture"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div className="h-[3px]" style={{ background: isDisabled ? 'var(--border)' : R }} />

        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
                style={{
                  background: isDisabled ? 'var(--muted)' : `${R}12`,
                  borderColor: isDisabled ? 'var(--border)' : `${R}30`,
                }}
              >
                <Bot
                  size={22}
                  style={{ color: isDisabled ? 'var(--muted-foreground)' : R }}
                  strokeWidth={1.75}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="m-0 text-lg md:text-xl font-bold tracking-tight truncate max-w-full">
                    {name}
                  </h1>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: isDisabled ? 'rgba(107,114,128,0.15)' : 'rgba(34,197,94,0.12)',
                      color: isDisabled ? '#6b7280' : '#22c55e',
                      flexShrink: 0,
                    }}
                  >
                    {isDisabled ? 'Desactivado' : 'Activo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                    title="Modelo principal"
                  >
                    {model}
                  </span>
                  {hubSynced && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
                    >
                      Hub sync
                    </span>
                  )}
                  {ragSummary && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md max-w-[220px] truncate"
                      style={{ background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--primary)' }}
                      title={ragSummary}
                    >
                      {ragSummary}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!readOnly && (
              <div className="flex items-center gap-2 shrink-0 sm:pt-1">
                <button
                  type="button"
                  onClick={onToggleStatus}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors card-hover"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--background)',
                    color: isDisabled ? '#22c55e' : 'var(--foreground)',
                  }}
                >
                  <CircleOff size={13} />
                  <span className="hidden sm:inline">{isDisabled ? 'Activar' : 'Desactivar'}</span>
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting || saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors"
                  style={{
                    borderColor: 'rgba(239,68,68,0.3)',
                    background: 'rgba(239,68,68,0.06)',
                    color: '#ef4444',
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  <span className="hidden sm:inline">{deleting ? 'Eliminando…' : 'Eliminar'}</span>
                </button>
              </div>
            )}
          </div>

          {readOnly && (
            <p
              className="mt-3 mb-0 text-xs px-3 py-2 rounded-lg border"
              style={{
                color: 'var(--muted-foreground)',
                borderColor: 'var(--border)',
                background: 'var(--muted)',
              }}
            >
              <Sparkles size={12} className="inline mr-1.5 -mt-0.5" />
              Agente de plataforma — edición en AgentFlowHub.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
