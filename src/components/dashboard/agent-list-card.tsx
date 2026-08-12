'use client';

import {
  CircleOff,
  MoreVertical,
  Power,
  PowerOff,
  Trash2,
} from '@/components/ui/icons';
import { TOOL_MAP } from '@/lib/agent-plans';
import { avatarStyleFromSeed } from '@/lib/flow-editor/geometry';
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

export type AgentListItem = {
  _id: string;
  name: string;
  description: string;
  model: string;
  type: 'agent' | 'sub-agent';
  status: 'active' | 'disabled';
  tools: { toolId: string }[];
  subAgentIds: string[];
  syncStatus: string;
  ragEnabled: boolean;
  ragSources?: unknown[];
  createdAt: string;
  isPlatform?: boolean;
  skills?: string[];
};

function formatUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

function shortModelDisplay(modelId: string, label: string): string {
  if (label !== modelId) return label;
  const segment = modelId.split('/').filter(Boolean).pop();
  return segment ?? modelId;
}

function skillsCount(agent: AgentListItem): number {
  return (agent.skills ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0).length;
}

export function AgentListCard({
  agent,
  getModelLabel,
  toggling,
  deleting,
  onToggleStatus,
  onDelete,
}: {
  agent: AgentListItem;
  getModelLabel: (id: string) => string;
  toggling: string | null;
  deleting: string | null;
  onToggleStatus: (a: AgentListItem) => void;
  onDelete: (a: AgentListItem) => void;
}) {
  const isDisabled = agent.status === 'disabled';
  const isPlatform = Boolean(agent.isPlatform);
  const accent = avatarStyleFromSeed(agent._id || agent.name).color;
  const modelLabel = getModelLabel(agent.model);
  const modelShort = shortModelDisplay(agent.model, modelLabel);
  const description = agent.description?.trim();
  const subtitle = description || modelShort;
  const subtitleFull = description ? `${description} · ${modelLabel}` : modelLabel;
  const toolNames = (agent.tools ?? [])
    .map((t) => TOOL_MAP[t.toolId]?.name ?? t.toolId)
    .filter(Boolean);
  const toolsLabel =
    toolNames.length > 0
      ? toolNames.length > 2
        ? `${toolNames.slice(0, 2).join(', ')} +${toolNames.length - 2}`
        : toolNames.join(', ')
      : null;
  const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  const skillN = skillsCount(agent);
  const subN = agent.subAgentIds?.length ?? 0;

  return (
    <DashboardResourceCard
      inactive={isDisabled}
      accentColor={accent}
      avatar={
        <AgentInitialsBadge
          name={agent.name}
          seed={agent._id}
          inactive={isDisabled}
          platform={isPlatform}
          size="sm"
        />
      }
      statusLabel={isDisabled ? 'Inactivo' : 'Activo'}
      statusOn={!isDisabled}
      headerAction={
        isPlatform ? null : (
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
            <DashboardMenuItem disabled={toggling === agent._id} onClick={() => onToggleStatus(agent)}>
              {isDisabled ? <Power size={13} /> : <PowerOff size={13} />}
              {isDisabled ? 'Activar' : 'Desactivar'}
            </DashboardMenuItem>
            <DashboardMenuDivider />
            <DashboardMenuItem danger onClick={() => onDelete(agent)} disabled={deleting === agent._id}>
              <Trash2 size={13} />
              Eliminar
            </DashboardMenuItem>
          </DashboardDropdownMenu>
        )
      }
      title={agent.name}
      subtitle={subtitle}
      subtitleTitle={subtitleFull}
      tags={
        <>
          <ResourceCardTag title={modelLabel}>{modelShort}</ResourceCardTag>
          {toolsLabel ? <ResourceCardTag title={toolsLabel}>{toolsLabel}</ResourceCardTag> : null}
          {subN > 0 ? (
            <ResourceCardTag>
              {subN} sub-agente{subN !== 1 ? 's' : ''}
            </ResourceCardTag>
          ) : null}
          {agent.ragEnabled || ragN > 0 ? (
            <ResourceCardTag>
              {agent.ragEnabled
                ? ragN > 0
                  ? `RAG · ${ragN}`
                  : 'RAG sin fuentes'
                : `RAG off · ${ragN}`}
            </ResourceCardTag>
          ) : null}
          {agent.syncStatus === 'synced' ? <ResourceCardTag>Hub sync</ResourceCardTag> : null}
          <ResourceCardTag>{formatUpdatedLabel(agent.createdAt)}</ResourceCardTag>
          {isPlatform ? <ResourceCardTag accent>Plataforma</ResourceCardTag> : null}
          {skillN > 0 ? (
            <ResourceCardTag accent>
              {skillN} skill{skillN !== 1 ? 's' : ''}
            </ResourceCardTag>
          ) : null}
        </>
      }
      actions={
        <>
          <DashboardButtonLink
            href={`/dashboard/agents/${agent._id}`}
            variant="primary"
            className={isPlatform ? 'resource-card__btn resource-card__btn--full' : 'resource-card__btn'}
          >
            {isPlatform ? 'Ver agente' : 'Configurar'}
          </DashboardButtonLink>
          {!isPlatform ? (
            <DashboardButton
              variant="secondary"
              className="resource-card__btn"
              disabled={toggling === agent._id || deleting === agent._id}
              title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
              onClick={() => onToggleStatus(agent)}
            >
              <CircleOff size={12} />
              {isDisabled ? 'Activar' : 'Pausar'}
            </DashboardButton>
          ) : null}
        </>
      }
    />
  );
}
