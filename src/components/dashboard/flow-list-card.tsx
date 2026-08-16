'use client';

import {
  Copy,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Trash2,
} from '@/components/ui/icons';
import { avatarStyleFromSeed } from '@/lib/flow-editor/geometry';
import { flowStatusLabel, parseFlowTags } from '@/lib/flow-admin';
import type { FlowListItem } from '@/lib/flow-editor/types';
import { AgentInitialsBadge } from '@/components/dashboard/agent-initials-badge';
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

function formatUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function FlowListCard({
  flow,
  busy,
  onDuplicate,
  onToggleStatus,
  onDelete,
}: {
  flow: FlowListItem;
  busy?: boolean;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const published = flow.status === 'published';
  const accent = avatarStyleFromSeed(flow.id || flow.name).color;
  const tags = parseFlowTags(flow.tags);
  const visible = tags.slice(0, 3);
  const hidden = tags.length - visible.length;
  const description = flow.description?.trim();

  return (
    <DashboardResourceCard
      inactive={!published}
      accentColor={accent}
      avatar={
        <AgentInitialsBadge
          name={flow.name}
          seed={flow.id}
          inactive={!published}
          filled
          size="sm"
        />
      }
      statusLabel={flowStatusLabel(flow.status)}
      statusOn={published}
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
          <DashboardMenuItem disabled={busy} onClick={onDuplicate}>
            <Copy size={13} />
            Duplicar
          </DashboardMenuItem>
          <DashboardMenuItem disabled={busy} onClick={onToggleStatus}>
            {published ? <Pause size={13} /> : <Play size={13} />}
            {published ? 'Pausar' : 'Activar'}
          </DashboardMenuItem>
          <DashboardMenuDivider />
          <DashboardMenuItem danger disabled={busy} onClick={onDelete}>
            <Trash2 size={13} />
            Eliminar
          </DashboardMenuItem>
        </DashboardDropdownMenu>
      }
      title={flow.name}
      subtitle={description || `${flow.stepCount} paso${flow.stepCount !== 1 ? 's' : ''}`}
      subtitleTitle={description || undefined}
      tags={
        <>
          <ResourceCardTag>
            {flow.stepCount} paso{flow.stepCount !== 1 ? 's' : ''}
          </ResourceCardTag>
          <ResourceCardTag>{formatUpdatedLabel(flow.createdAt)}</ResourceCardTag>
          {visible.map((tag) => (
            <ResourceCardTag key={tag}>{tag}</ResourceCardTag>
          ))}
          {hidden > 0 ? <ResourceCardTag>+{hidden}</ResourceCardTag> : null}
        </>
      }
      actions={
        <>
          <DashboardButtonLink
            href={`/dashboard/flows/${flow.id}/edit`}
            variant="secondary"
            className="resource-card__btn"
          >
            <Pencil size={12} />
            Editar
          </DashboardButtonLink>
          <DashboardButtonLink
            href={`/dashboard/flows/${flow.id}`}
            variant="secondary"
            className="resource-card__btn resource-card__btn--muted"
          >
            Abrir
          </DashboardButtonLink>
        </>
      }
    />
  );
}
