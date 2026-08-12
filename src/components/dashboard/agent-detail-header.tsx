'use client';

import Link from 'next/link';
import {
  Bot, ChevronLeft, CircleOff, Loader2, Sparkles, Trash2,
} from '@/components/ui/icons';

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
  return (
    <div className="agent-detail-header">
      <Link
        href="/dashboard/agents"
        className="landing-link-accent inline-flex items-center gap-1 text-[11px] no-underline mb-3 font-semibold"
      >
        <ChevronLeft size={13} aria-hidden /> Mis agentes
      </Link>

      <div
        className="agent-detail-header__card rounded-xl border overflow-hidden card-texture"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
      >
        <div
          className="h-[2px]"
          style={{ background: isDisabled ? 'var(--border)' : 'var(--primary)' }}
        />

        <div className="p-3 md:p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div
                className={`agent-detail-header__avatar${isDisabled ? ' agent-detail-header__avatar--disabled' : ''}`}
              >
                <Bot
                  size={16}
                  style={{ color: isDisabled ? 'var(--muted-foreground)' : 'var(--primary)' }}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <h1 className="agent-detail-header__title truncate max-w-full">
                    {name}
                  </h1>
                  <span
                    className={`agent-detail-header__status${isDisabled ? ' agent-detail-header__status--off' : ''}`}
                  >
                    {isDisabled ? 'Desactivado' : 'Activo'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="agent-detail-header__chip" title="Modelo principal">
                    {model}
                  </span>
                  {hubSynced ? (
                    <span className="agent-detail-header__chip agent-detail-header__chip--ok">
                      Hub sync
                    </span>
                  ) : null}
                  {ragSummary ? (
                    <span
                      className="agent-detail-header__chip agent-detail-header__chip--accent max-w-[220px] truncate"
                      title={ragSummary}
                    >
                      {ragSummary}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {!readOnly ? (
              <div className="flex items-center gap-2 shrink-0 sm:pt-1">
                <button
                  type="button"
                  onClick={onToggleStatus}
                  disabled={deleting}
                  className="agent-detail-header__action agent-detail-header__action--neutral card-hover"
                >
                  <CircleOff size={13} aria-hidden />
                  <span className="hidden sm:inline">{isDisabled ? 'Activar' : 'Desactivar'}</span>
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting || saving}
                  className="agent-detail-header__action agent-detail-header__action--danger"
                >
                  {deleting ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 size={13} aria-hidden />
                  )}
                  <span className="hidden sm:inline">
                    {deleting ? 'Eliminando…' : 'Eliminar'}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          {readOnly ? (
            <p className="agent-detail-header__readonly-note mt-3 mb-0">
              <Sparkles size={12} className="inline mr-1.5 -mt-0.5" aria-hidden />
              Agente de plataforma — edición en AgentFlowHub.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
