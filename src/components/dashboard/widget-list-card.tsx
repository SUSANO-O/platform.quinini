'use client';

import {
  Code2,
  Download,
  MoreVertical,
  Power,
  PowerOff,
  Share2,
  Trash2,
} from '@/components/ui/icons';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import {
  DashboardDropdownMenu,
  DashboardMenuDivider,
  DashboardMenuItem,
} from '@/components/dashboard/dashboard-dropdown-menu';
import { WidgetAvatar } from '@/components/dashboard/widget-avatar';
import { WidgetEmbedPanel } from '@/components/dashboard/widget-embed-panel';

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
  avatar?: string | null;
  multiAgentEnabled?: boolean;
  multiAgentMode?: 'triage' | 'parallel' | 'pipeline';
  active?: boolean;
};

function formatPosition(position: string): string {
  const map: Record<string, string> = {
    'bottom-right': 'Abajo der.',
    'bottom-left': 'Abajo izq.',
    'top-right': 'Arriba der.',
    'top-left': 'Arriba izq.',
  };
  return map[position] ?? position.replace(/-/g, ' ');
}

function formatTheme(theme: string): string {
  if (theme === 'dark') return 'Oscuro';
  if (theme === 'light') return 'Claro';
  return theme;
}

function formatUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function multiLabel(mode?: WidgetListItem['multiAgentMode']): string {
  if (mode === 'parallel') return 'Paralelo';
  if (mode === 'pipeline') return 'Pipeline';
  return 'Triaje';
}

export function WidgetListCard({
  widget: w,
  isActive,
  toggling,
  expanded,
  copied,
  origin,
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
  onToggleActive: () => void;
  onToggleCode: () => void;
  onCopyCode: () => void;
  onExportHistory: () => void;
  onDelete: () => void;
  buildSnippet: (w: WidgetListItem, origin: string) => string;
}) {
  const agentLabel = w.agentName?.trim() || 'Sin agente';

  return (
    <article
      className={`widget-card card-texture${isActive ? '' : ' widget-card--off'}${expanded ? ' is-open' : ''}`}
      style={{ ['--resource-accent' as string]: w.color }}
    >
      <div className="widget-card__accent" aria-hidden />

      <header className="widget-card__head">
        <div className="widget-card__identity">
          <WidgetAvatar widgetId={w._id} color={w.color} avatarUrl={w.avatar} size="md" />
          <div className="widget-card__head-text">
            <div className="widget-card__status-row">
              <span className={`widget-card__dot${isActive ? ' is-on' : ''}`} aria-hidden />
              <span className={`widget-card__status${isActive ? ' is-on' : ''}`}>
                {isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <p className="widget-card__title" title={w.name}>
              {w.name}
            </p>
            <p className="widget-card__subtitle" title={agentLabel}>
              {agentLabel}
            </p>
          </div>
        </div>

        <DashboardDropdownMenu
          placement="bottom"
          trigger={({ open, toggle }) => (
            <DashboardButton
              variant="icon"
              className={`widget-card__menu${open ? ' is-open' : ''}`}
              aria-label="Más acciones"
              aria-expanded={open}
              onClick={toggle}
            >
              <MoreVertical size={15} />
            </DashboardButton>
          )}
        >
          <DashboardMenuItem disabled={toggling} onClick={onToggleActive}>
            {isActive ? <PowerOff size={13} /> : <Power size={13} />}
            {isActive ? 'Desactivar' : 'Activar'}
          </DashboardMenuItem>
          <DashboardMenuItem onClick={onToggleCode}>
            <Code2 size={13} />
            Código embed
          </DashboardMenuItem>
          <DashboardMenuItem href={`/dashboard/widgets/${w._id}/shares`}>
            <Share2 size={13} />
            Compartir
          </DashboardMenuItem>
          <DashboardMenuItem onClick={onExportHistory}>
            <Download size={13} />
            Historial
          </DashboardMenuItem>
          <DashboardMenuDivider />
          <DashboardMenuItem danger onClick={onDelete}>
            <Trash2 size={13} />
            Eliminar
          </DashboardMenuItem>
        </DashboardDropdownMenu>
      </header>

      <div className="widget-card__tags">
        <span className="widget-card__tag">{formatPosition(w.position)}</span>
        <span className="widget-card__tag">{formatTheme(w.theme)}</span>
        <span className="widget-card__tag">{formatUpdatedLabel(w.createdAt)}</span>
        {w.multiAgentEnabled ? (
          <span className="widget-card__tag widget-card__tag--accent">{multiLabel(w.multiAgentMode)}</span>
        ) : null}
      </div>

      <footer className="widget-card__footer">
        <DashboardButtonLink
          href={`/dashboard/widget-builder?edit=${w._id}`}
          variant="primary"
          className="widget-card__btn"
        >
          Editar
        </DashboardButtonLink>
        <DashboardButtonLink
          href={`/dashboard/widget-preview?id=${w._id}`}
          variant="secondary"
          className="widget-card__btn"
          title="Probar el chat"
        >
          Probar
        </DashboardButtonLink>
      </footer>

      {expanded ? (
        <div className="widget-card__embed">
          <WidgetEmbedPanel
            snippet={buildSnippet(w, origin)}
            token={w.afhubToken}
            copied={copied}
            onCopySnippet={onCopyCode}
          />
        </div>
      ) : null}
    </article>
  );
}
