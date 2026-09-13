'use client';

import {
  MoreVertical,
  Pause,
  Play,
  Power,
  PowerOff,
  Trash2,
} from '@/components/ui/icons';
import {
  agentCardChips,
  formatUpdatedLabel,
  shortModelDisplay,
  type AgentLike,
} from '@/lib/agent-list';
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

export type AgentListItem = AgentLike;

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
  const modelLabel = getModelLabel(agent.model);
  const modelShort = shortModelDisplay(agent.model, modelLabel);
  const description = agent.description?.trim();
  const subtitle = description || modelShort;
  const subtitleFull = description ? `${description} · ${modelLabel}` : modelLabel;

  // Antes se pintaban hasta ocho etiquetas y no se leía ninguna. Ahora van las
  // que importan, con tope, y el metadato (fecha, sync) baja a su propia línea.
  const { chips, overflow } = agentCardChips(agent, getModelLabel);
  const meta = [
    formatUpdatedLabel(agent.createdAt),
    agent.syncStatus === 'synced' ? 'Sincronizado con el hub' : null,
    isPlatform ? 'Agente de plataforma' : null,
  ].filter(Boolean).join(' · ');

  return (
    <DashboardResourceCard
      inactive={isDisabled}
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
          {chips.map((chip) => (
            <ResourceCardTag key={chip.key} tone={chip.tone} title={chip.title}>
              {chip.label}
            </ResourceCardTag>
          ))}
          {overflow > 0 ? <ResourceCardTag title="Abre el agente para ver el resto">+{overflow}</ResourceCardTag> : null}
          <span className="resource-card__meta">{meta}</span>
        </>
      }
      actions={
        <>
          <DashboardButtonLink
            href={`/dashboard/agents/${agent._id}`}
            variant="secondary"
            className={isPlatform ? 'resource-card__btn resource-card__btn--full' : 'resource-card__btn'}
          >
            {isPlatform ? 'Ver agente' : 'Configurar'}
          </DashboardButtonLink>
          {!isPlatform ? (
            <DashboardButton
              variant="secondary"
              className="resource-card__btn resource-card__btn--muted"
              disabled={toggling === agent._id || deleting === agent._id}
              title={isDisabled ? 'Activar agente' : 'Desactivar agente'}
              onClick={() => onToggleStatus(agent)}
            >
              {isDisabled ? <Play size={12} /> : <Pause size={12} />}
              {isDisabled ? 'Activar' : 'Pausar'}
            </DashboardButton>
          ) : null}
        </>
      }
    />
  );
}
