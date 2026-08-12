'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Loader2, Search } from '@/components/ui/icons';
import { PipelineEditor } from '@/components/dashboard/pipeline-editor';
import {
  createDefaultPipelineConfig,
  isContentCapableAgent,
  isCreativeCapableAgent,
  type PipelineSetupValidation,
} from '@/lib/widget-pipeline-ui';
import type {
  ClientAgentRow,
  OrchestratorSubAgent,
  WidgetConfig,
  WidgetConfigPatch,
} from '@/lib/widget-builder';
import {
  agentProfileFromRow,
  effectiveWidgetAgentId,
  resolveAgentProfileByWidgetId,
  WIDGET_BUILDER_UI_ACCENT,
} from '@/lib/widget-builder';
import { WidgetBuilderAgentPickerCard } from '@/components/dashboard/widget-builder/agent-picker-card';
import {
  WidgetBuilderField,
  WidgetBuilderHint,
  WidgetBuilderInput,
  WidgetBuilderLabel,
  WidgetBuilderTogglePanel,
} from '../ui';

export type WidgetBuilderIdentityStepProps = {
  cfg: WidgetConfig;
  onChange: (patch: WidgetConfigPatch) => void;
  agents: ClientAgentRow[];
  orchestratorSubs: OrchestratorSubAgent[];
  loadingInitial: boolean;
  loadingSubs: boolean;
  multiAgentEligible: boolean;
  selectedOrchestratorIds: string[];
  orchestratorOptions: Array<{
    id: string;
    name: string;
    profile: ReturnType<typeof agentProfileFromRow>;
  }>;
  pipelineSetup: PipelineSetupValidation | null;
  isOrchestratorSelected: (id: string) => boolean;
  onToggleOrchestrator: (id: string) => void;
  onToggleTeamAgent: (id: string) => void;
};

export function WidgetBuilderIdentityStep({
  cfg,
  onChange,
  agents,
  orchestratorSubs,
  loadingInitial,
  loadingSubs,
  multiAgentEligible,
  selectedOrchestratorIds,
  orchestratorOptions,
  pipelineSetup,
  isOrchestratorSelected,
  onToggleOrchestrator,
  onToggleTeamAgent,
}: WidgetBuilderIdentityStepProps) {
  const [agentFilter, setAgentFilter] = useState('');
  const filteredAgents = useMemo(() => {
    const query = agentFilter.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter((agent) => {
      const haystack = `${agent.name} ${agent.description ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [agentFilter, agents]);

  return (
    <>
      <div data-tour="widget-builder-name">
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-widget-name">Nombre del widget</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-widget-name"
            value={cfg.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Mi widget"
          />
        </WidgetBuilderField>
      </div>

      {multiAgentEligible ? (
        <WidgetBuilderTogglePanel
          active={cfg.multiAgentEnabled}
          accentColor={WIDGET_BUILDER_UI_ACCENT}
          title="Widget multiagente avanzado"
          badge="Business · Enterprise"
          description={
            cfg.multiAgentEnabled
              ? 'Selecciona varios agentes en la grilla de abajo. Cada uno aporta su equipo al triaje.'
              : 'Sin activar esto, un solo agente en la grilla; sus sub-agentes se enrutan solos si existen.'
          }
          onToggle={(multiAgentEnabled) =>
            onChange({
              multiAgentEnabled,
              ...(multiAgentEnabled
                ? {}
                : {
                    agentIds: [], 
                    orchestratorAgentIds: [],
                    multiAgentMode: 'triage',
                    pipelineConfig: null,
                  }),
            })
          }
          control="checkbox"
          checkboxId="multiAgentEnabled"
          tourId="widget-builder-multi-agent"
        />
      ) : null}

      <div data-tour="widget-builder-agent">
        <WidgetBuilderField>
          <WidgetBuilderLabel>
            {cfg.multiAgentEnabled ? 'Agentes orquestadores' : 'Agente'}
          </WidgetBuilderLabel>
          {cfg.multiAgentEnabled ? (
            <WidgetBuilderHint>
              Selecciona uno o más agentes. Cada uno aporta su equipo de sub-agentes al triaje.
            </WidgetBuilderHint>
          ) : null}
          {loadingInitial ? (
            <p className="flex items-center gap-2 text-[13px] m-0" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
              Cargando…
            </p>
          ) : agents.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
              No tienes agentes activos.{' '}
              <Link href="/dashboard/agents/new" className="font-semibold landing-link-accent text-[13px]">
                Crear agente
              </Link>
            </p>
          ) : (
            <>
              {agents.length >= 8 ? (
                <div className="relative mb-3">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--muted-foreground)' }}
                    aria-hidden
                  />
                  <WidgetBuilderInput
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    placeholder="Buscar agente por nombre o descripción…"
                    className="pl-9"
                    aria-label="Buscar agente"
                  />
                </div>
              ) : null}
              {filteredAgents.length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
                  Ningún agente coincide con «{agentFilter.trim()}».
                </p>
              ) : (
                <div
                  className="max-h-[26rem] overflow-y-auto overscroll-contain rounded-xl border pr-1"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                    {filteredAgents.map((a) => {
                    const agentIdForWidget = effectiveWidgetAgentId(a);
                    const selectable = agentIdForWidget.length > 0;
                    const selected = selectable && isOrchestratorSelected(agentIdForWidget);
                    const profile = agentProfileFromRow(a);
                    const pipelineCreative =
                      cfg.multiAgentEnabled &&
                      cfg.multiAgentMode === 'pipeline' &&
                      selected &&
                      isCreativeCapableAgent(profile);
                    const pipelineContent =
                      cfg.multiAgentEnabled &&
                      cfg.multiAgentMode === 'pipeline' &&
                      selected &&
                      isContentCapableAgent(profile);
                    const pipelineTags: string[] = [];
                    if (pipelineContent) pipelineTags.push('Contenido');
                    if (pipelineCreative) pipelineTags.push('Creativo');

                    return (
                      <WidgetBuilderAgentPickerCard
                        key={a._id}
                        agent={a}
                        selected={selected}
                        accentColor={cfg.color}
                        selectable={selectable}
                        onSelect={() => onToggleOrchestrator(agentIdForWidget)}
                        extraMeta={pipelineTags.length > 0 ? pipelineTags : undefined}
                      />
                    );
                  })}
                  </div>
                </div>
              )}
            </>
          )}
          {!loadingInitial && agents.some((a) => !effectiveWidgetAgentId(a)) && (
            <WidgetBuilderHint>
              Los agentes atenuados no tienen un <code style={{ fontSize: '10px' }}>_id</code> Mongo válido (24 hex) ni{' '}
              <code style={{ fontSize: '10px' }}>agentHubId</code>. Si acabas de crear el agente, abre{' '}
              <Link href="/dashboard/agents" className="font-semibold landing-link-accent text-[11px]">
                Mis agentes
              </Link>{' '}
              y pulsa sincronizar con el hub, o espera a que pase de estado pendiente a sincronizado.
            </WidgetBuilderHint>
          )}
          {!loadingInitial && agents.length > 0 && (
            <WidgetBuilderHint>
              El snippet usará el <strong>ID de este agente en la landing</strong> (misma clave que en la URL al
              editarlo). El chat y el MCP del hub siguen resolviendo al catálogo vía{' '}
              <code style={{ fontSize: '10px' }}>landingClientAgentId</code>.
            </WidgetBuilderHint>
          )}
          {!cfg.multiAgentEnabled && orchestratorSubs.length > 0 ? (
            <p
              style={{
                fontSize: 11,
                color: 'var(--muted-foreground)',
                margin: '8px 0 0',
                lineHeight: 1.45,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(34,197,94,0.25)',
                background: 'rgba(34,197,94,0.06)',
              }}
            >
              Este agente tiene {orchestratorSubs.length} sub-agente{orchestratorSubs.length !== 1 ? 's' : ''}. El
              chat los usará automáticamente (triaje) sin activar el modo multiagente avanzado.
            </p>
          ) : null}
        </WidgetBuilderField>
      </div>

      {multiAgentEligible && cfg.multiAgentEnabled && (
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 12,
            border: '1px solid rgba(var(--brand-primary-rgb), 0.22)',
            background: 'rgba(var(--brand-primary-rgb), 0.05)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {(
              [
                ['triage', 'Triaje (rápido)', 'Deriva a un especialista y responde con una llamada.'],
                [
                  'pipeline',
                  'Pipeline contenido→creativo',
                  'Primero datos del catálogo (vendedor), luego banner/imagen (creativo). Requiere 2+ agentes en la grilla.',
                ],
                [
                  'parallel',
                  'Paralelo + síntesis',
                  'Consulta orquestador y especialista en paralelo; una respuesta unificada.',
                ],
              ] as const
            ).map(([mode, label, hint]) => {
              const selected = cfg.multiAgentMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === 'pipeline') {
                      const resolve = (id: string) => resolveAgentProfileByWidgetId(agents, id);
                      const orchIds = selectedOrchestratorIds;
                      onChange({
                        multiAgentMode: mode,
                        pipelineConfig:
                          cfg.pipelineConfig ??
                          (orchIds.length >= 2 ? createDefaultPipelineConfig(orchIds, resolve) : null),
                      });
                      return;
                    }
                    onChange({ multiAgentMode: mode, pipelineConfig: null });
                  }}
                  title={hint}
                  style={{
                    flex: '1 1 140px',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: selected ? '1px solid rgba(var(--brand-primary-rgb), 0.4)' : '1px solid var(--border)',
                    background: selected ? 'rgba(var(--brand-primary-rgb), 0.1)' : 'var(--background)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{label}</span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 10,
                      color: 'var(--muted-foreground)',
                      marginTop: 3,
                      lineHeight: 1.35,
                    }}
                  >
                    {hint}
                  </span>
                </button>
              );
            })}
          </div>
          {cfg.multiAgentMode === 'pipeline' && cfg.pipelineConfig && orchestratorOptions.length >= 2 ? (
            <div style={{ marginBottom: 12 }}>
              <PipelineEditor
                config={cfg.pipelineConfig}
                orchestratorOptions={orchestratorOptions}
                onChange={(pipelineConfig) => onChange({ pipelineConfig })}
                resolveAgentProfile={(id) => resolveAgentProfileByWidgetId(agents, id)}
              />
            </div>
          ) : cfg.multiAgentMode === 'pipeline' && pipelineSetup ? (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(245,158,11,0.45)',
                background: 'rgba(245,158,11,0.1)',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgb(180,83,9)' }}>
                Selecciona al menos 2 agentes orquestadores para configurar el pipeline.
              </p>
              {pipelineSetup.warnings.length > 0 ? (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.45 }}>
                  {pipelineSetup.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {loadingSubs ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Cargando equipo…</p>
          ) : orchestratorSubs.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.45 }}>
              Ningún orquestador seleccionado tiene sub-agentes.{' '}
              <Link href={`/dashboard/agents/${cfg.agentId}`} className="font-semibold landing-link-accent">
                Configura sub-agentes
              </Link>{' '}
              para activar el triaje.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 4px', color: 'var(--foreground)' }}>
                Especialistas del equipo (opcional — vacío = todos los sub-agentes de cada orquestador)
              </p>
              {orchestratorSubs.map((sub) => {
                const checked = cfg.agentIds.includes(sub._id);
                return (
                  <label
                    key={sub._id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: checked ? '1px solid rgba(var(--brand-primary-rgb), 0.32)' : '1px solid var(--border)',
                      background: checked ? 'rgba(var(--brand-primary-rgb), 0.07)' : 'var(--background)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleTeamAgent(sub._id)}
                      style={{ marginTop: 2, cursor: 'pointer' }}
                    />
                    <span>
                      <strong>{sub.name}</strong>
                      {sub.parentName ? (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 6 }}>
                          · {sub.parentName}
                        </span>
                      ) : null}
                      {sub.description ? (
                        <span style={{ display: 'block', color: 'var(--muted-foreground)', marginTop: 2 }}>
                          {sub.description.slice(0, 120)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
