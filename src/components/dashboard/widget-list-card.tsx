'use client';

import {
  Calendar,
  Code2,
  Download,
  MapPin,
  MoreVertical,
  Pencil,
  Play,
  Power,
  PowerOff,
  Share2,
  Sun,
  Trash2,
} from 'lucide-react';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import {
  DashboardDropdownMenu,
  DashboardMenuDivider,
  DashboardMenuItem,
} from '@/components/dashboard/dashboard-dropdown-menu';
import { DashboardMetaRow } from '@/components/dashboard/dashboard-meta-row';
import { DashboardResourceCard } from '@/components/dashboard/dashboard-resource-card';
import { DashboardStatusBadge } from '@/components/dashboard/dashboard-status-badge';
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
  return position.replace(/-/g, ' ');
}

function formatTheme(theme: string): string {
  if (theme === 'dark') return 'Tema oscuro';
  if (theme === 'light') return 'Tema claro';
  return theme;
}

function formatUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Actualizado: Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Actualizado: Ayer';
  return `Actualizado: ${d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`;
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
  return (
    <DashboardResourceCard
      inactive={!isActive}
      avatar={<WidgetAvatar widgetId={w._id} color={w.color} avatarUrl={w.avatar} size="lg" />}
      status={<DashboardStatusBadge active={isActive} />}
      headerAction={
        <DashboardDropdownMenu
          placement="bottom"
          trigger={({ open, toggle }) => (
            <DashboardButton
              variant="icon"
              className={open ? 'is-open' : ''}
              aria-label="Más acciones"
              aria-expanded={open}
              onClick={toggle}
            >
              <MoreVertical size={15} />
            </DashboardButton>
          )}
        >
          <DashboardMenuItem disabled={toggling} onClick={onToggleActive}>
            {isActive ? <PowerOff size={14} /> : <Power size={14} />}
            {isActive ? 'Desactivar' : 'Activar'}
          </DashboardMenuItem>
          <DashboardMenuItem onClick={onToggleCode}>
            <Code2 size={14} />
            Código embed
          </DashboardMenuItem>
          <DashboardMenuItem href={`/dashboard/widgets/${w._id}/shares`}>
            <Share2 size={14} className="text-[#6366f1]" />
            Compartir
          </DashboardMenuItem>
          <DashboardMenuItem onClick={onExportHistory}>
            <Download size={14} />
            Historial
          </DashboardMenuItem>
          <DashboardMenuDivider />
          <DashboardMenuItem danger onClick={onDelete}>
            <Trash2 size={14} />
            Eliminar
          </DashboardMenuItem>
        </DashboardDropdownMenu>
      }
      title={w.name}
      subtitle={w.agentName?.trim() || 'Sin agente vinculado'}
      meta={
        <>
          <DashboardMetaRow icon={MapPin}>{formatPosition(w.position)}</DashboardMetaRow>
          <DashboardMetaRow icon={Sun}>{formatTheme(w.theme)}</DashboardMetaRow>
          <DashboardMetaRow icon={Calendar}>{formatUpdatedLabel(w.createdAt)}</DashboardMetaRow>
          {w.multiAgentEnabled ? (
            <p className="dashboard-meta-row m-0 text-[11px] font-semibold text-[var(--primary)]">
              Multiagente · {w.multiAgentMode === 'parallel' ? 'paralelo' : w.multiAgentMode === 'pipeline' ? 'pipeline' : 'triaje'}
            </p>
          ) : null}
        </>
      }
      actions={
        <>
          <DashboardButtonLink href={`/dashboard/widget-builder?edit=${w._id}`} variant="primary">
            <Pencil size={14} />
            Editar
          </DashboardButtonLink>
          <DashboardButtonLink href={`/dashboard/widget-preview?id=${w._id}`} variant="secondary" title="Probar el chat">
            <Play size={14} />
            Probar
          </DashboardButtonLink>
        </>
      }
      footer={
        expanded ? (
          <WidgetEmbedPanel
            snippet={buildSnippet(w, origin)}
            token={w.afhubToken}
            copied={copied}
            onCopySnippet={onCopyCode}
          />
        ) : undefined
      }
    />
  );
}
