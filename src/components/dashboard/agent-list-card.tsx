'use client';

import {
  Calendar,
  ChevronRight,
  CircleOff,
  Cpu,
  Globe2,
  MoreVertical,
  Network,
  Power,
  PowerOff,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { TOOL_MAP } from '@/lib/agent-plans';
import { AgentInitialsBadge } from '@/components/dashboard/agent-initials-badge';
import { AgentSkillsCount } from '@/components/dashboard/agent-skills-count';
import { DashboardBadge } from '@/components/dashboard/dashboard-badge';
import { DashboardButton, DashboardButtonLink } from '@/components/dashboard/dashboard-button';
import {
  DashboardDropdownMenu,
  DashboardMenuDivider,
  DashboardMenuItem,
} from '@/components/dashboard/dashboard-dropdown-menu';
import { DashboardMetaRow } from '@/components/dashboard/dashboard-meta-row';
import { DashboardResourceCard } from '@/components/dashboard/dashboard-resource-card';
import { DashboardStatusBadge } from '@/components/dashboard/dashboard-status-badge';

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
  if (d.toDateString() === now.toDateString()) return 'Actualizado: Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Actualizado: Ayer';
  return `Actualizado: ${d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function shortModelDisplay(modelId: string, label: string): string {
  if (label !== modelId) return label;
  const segment = modelId.split('/').filter(Boolean).pop();
  return segment ?? modelId;
}

function ragMeta(agent: AgentListItem): { text: string; warn?: boolean } {
  const ragN = Array.isArray(agent.ragSources) ? agent.ragSources.length : 0;
  if (agent.ragEnabled && ragN > 0) {
    return { text: `Almacenamiento · ${ragN} fuente${ragN !== 1 ? 's' : ''}` };
  }
  if (agent.ragEnabled && ragN === 0) {
    return { text: 'Almacenamiento activo · sin fuentes', warn: true };
  }
  if (!agent.ragEnabled && ragN > 0) {
    return { text: `Almac. off · ${ragN} guardada${ragN !== 1 ? 's' : ''}` };
  }
  return { text: 'Sin almacenamiento RAG' };
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
  const rag = ragMeta(agent);
  const toolNames = (agent.tools ?? [])
    .map((t) => TOOL_MAP[t.toolId]?.name ?? t.toolId)
    .filter(Boolean);
  const toolsLabel =
    toolNames.length > 0
      ? toolNames.length > 2
        ? `${toolNames.slice(0, 2).join(', ')} +${toolNames.length - 2}`
        : toolNames.join(', ')
      : null;

  const modelLabel = getModelLabel(agent.model);
  const modelShort = shortModelDisplay(agent.model, modelLabel);
  const description = agent.description?.trim();
  const subtitle = description || modelShort;
  const subtitleFull = description ? `${description} · ${modelLabel}` : modelLabel;

  return (
    <DashboardResourceCard
      inactive={isDisabled}
      avatar={
        <AgentInitialsBadge
          name={agent.name}
          seed={agent._id}
          inactive={isDisabled}
          platform={isPlatform}
          size="md"
        />
      }
      status={<DashboardStatusBadge active={!isDisabled} />}
      headerAction={
        isPlatform ? null : (
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
            <DashboardMenuItem disabled={toggling === agent._id} onClick={() => onToggleStatus(agent)}>
              {isDisabled ? <Power size={14} /> : <PowerOff size={14} />}
              {isDisabled ? 'Activar' : 'Desactivar'}
            </DashboardMenuItem>
            <DashboardMenuDivider />
            <DashboardMenuItem danger onClick={() => onDelete(agent)} disabled={deleting === agent._id}>
              <Trash2 size={14} />
              Eliminar
            </DashboardMenuItem>
          </DashboardDropdownMenu>
        )
      }
      title={agent.name}
      subtitle={subtitle}
      subtitleTitle={subtitleFull}
      meta={
        <>
          {description ? (
            <DashboardMetaRow icon={Cpu}>
              <span className="dashboard-meta-row__truncate" title={modelLabel}>
                Modelo: {modelShort}
              </span>
            </DashboardMetaRow>
          ) : null}
          {toolsLabel ? <DashboardMetaRow icon={Wrench}>{toolsLabel}</DashboardMetaRow> : null}
          {(agent.subAgentIds?.length ?? 0) > 0 ? (
            <DashboardMetaRow icon={Network}>
              {agent.subAgentIds.length} sub-agente{agent.subAgentIds.length !== 1 ? 's' : ''}
            </DashboardMetaRow>
          ) : null}
          {(agent.ragEnabled || (Array.isArray(agent.ragSources) && agent.ragSources.length > 0)) ? (
            <DashboardMetaRow icon={Zap}>
              <span className={rag.warn ? 'dashboard-meta-row__warn' : undefined}>{rag.text}</span>
            </DashboardMetaRow>
          ) : null}
          {agent.syncStatus === 'synced' ? (
            <DashboardMetaRow icon={Globe2}>Hub sincronizado</DashboardMetaRow>
          ) : null}
          <DashboardMetaRow icon={Calendar}>{formatUpdatedLabel(agent.createdAt)}</DashboardMetaRow>
          {isPlatform ? (
            <p className="dashboard-agent-card__tag-row m-0">
              <DashboardBadge variant="muted">Plataforma</DashboardBadge>
            </p>
          ) : null}
          <AgentSkillsCount skillIds={agent.skills} />
        </>
      }
      actions={
        <>
          <DashboardButtonLink
            href={`/dashboard/agents/${agent._id}`}
            variant="primary"
            className={isPlatform ? 'dashboard-resource-card__action-full' : undefined}
          >
            {isPlatform ? 'Ver agente' : 'Configurar'}
            <ChevronRight size={14} />
          </DashboardButtonLink>
          {!isPlatform ? (
            <DashboardButton
              variant="secondary"
              disabled={toggling === agent._id || deleting === agent._id}
              title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
              onClick={() => onToggleStatus(agent)}
            >
              <CircleOff size={14} />
              {isDisabled ? 'Activar' : 'Pausar'}
            </DashboardButton>
          ) : null}
        </>
      }
    />
  );
}
