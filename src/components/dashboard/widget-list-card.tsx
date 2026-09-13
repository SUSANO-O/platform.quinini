'use client';

import {
  Code2,
  Download,
  MoreVertical,
  Pause,
  Play,
  Power,
  PowerOff,
  Share2,
  Trash2,
} from '@/components/ui/icons';
import { AgentInitialsBadge } from '@/components/dashboard/agent-initials-badge';
import { formatPosition, formatTheme, multiAgentLabel } from '@/lib/widget-list';
import { formatDayLabel } from '@/lib/panel-dates';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import {
  DashboardDropdownMenu,
  DashboardMenuDivider,
  DashboardMenuItem,
} from '@/components/dashboard/dashboard-dropdown-menu';
import {
  DashboardResourceCard,
  ResourceCardTag,
} from '@/components/dashboard/dashboard-resource-card';
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
  const subtitle = w.agentName?.trim()
    ? `Chat publicado · ${agentLabel}`
    : 'Sin agente asignado';

  return (
    <DashboardResourceCard
      className={expanded ? 'is-open' : ''}
      inactive={!isActive}
      accentColor={w.color}
      avatar={
        w.avatar ? (
          <WidgetAvatar widgetId={w._id} color={w.color} avatarUrl={w.avatar} size="md" />
        ) : (
          <AgentInitialsBadge
            name={w.name}
            seed={w._id}
            accentColor={w.color}
            inactive={!isActive}
            filled
            size="sm"
          />
        )
      }
      statusLabel={isActive ? 'Activo' : 'Inactivo'}
      statusOn={isActive}
      headerAction={
        <DashboardDropdownMenu
          placement="bottom"
          trigger={({ open, toggle }) => (
            <DashboardButton
              variant="icon"
              className={`resource-card__menu${open ? ' is-open' : ''}`}
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
          <DashboardMenuItem href={`/dashboard/widget-preview?id=${w._id}`}>
            <Play size={13} />
            Probar chat
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
      }
      title={w.name}
      subtitle={subtitle}
      subtitleTitle={agentLabel}
      tags={
        <>
          <ResourceCardTag>{formatPosition(w.position)}</ResourceCardTag>
          <ResourceCardTag>{formatTheme(w.theme)}</ResourceCardTag>
          <ResourceCardTag>{formatDayLabel(w.createdAt)}</ResourceCardTag>
          {w.multiAgentEnabled ? (
            <ResourceCardTag accent>{multiAgentLabel(w.multiAgentMode)}</ResourceCardTag>
          ) : null}
        </>
      }
      actions={
        <>
          <DashboardButtonLink
            href={`/dashboard/widget-builder?edit=${w._id}`}
            variant="secondary"
            className="resource-card__btn"
          >
            Configurar
          </DashboardButtonLink>
          <DashboardButton
            variant="secondary"
            className="resource-card__btn resource-card__btn--muted"
            disabled={toggling}
            title={isActive ? 'Desactivar widget' : 'Activar widget'}
            onClick={onToggleActive}
          >
            {isActive ? <Pause size={12} /> : <Play size={12} />}
            {isActive ? 'Pausar' : 'Activar'}
          </DashboardButton>
        </>
      }
      embed={
        expanded ? (
          <WidgetEmbedPanel
            snippet={buildSnippet(w, origin)}
            token={w.afhubToken}
            copied={copied}
            onCopySnippet={onCopyCode}
          />
        ) : null
      }
    />
  );
}
