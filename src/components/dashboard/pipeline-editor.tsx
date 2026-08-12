'use client';

import { ArrowDown, ArrowLeftRight, CheckCircle2, AlertTriangle, Sparkles } from '@/components/ui/icons';
import {
  PIPELINE_TEMPLATES,
  applyPipelineTemplate,
  pipelineRoleHint,
  pipelineRoleLabel,
  swapPipelineSteps,
  updatePipelineStepAgent,
  updatePipelineTrigger,
  validatePipelineConfig,
  type PipelineAgentOption,
  type PipelineConfig,
  type PipelineStepRole,
  type PipelineTriggerMode,
} from '@/lib/widget-pipeline-ui';

const ROLE_STYLES: Record<PipelineStepRole, { bg: string; border: string; color: string }> = {
  content: {
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.35)',
    color: 'rgb(37,99,235)',
  },
  creative: {
    bg: 'rgba(168,85,247,0.08)',
    border: 'rgba(168,85,247,0.35)',
    color: 'rgb(126,34,206)',
  },
};

const TRIGGER_OPTIONS: Array<{ mode: PipelineTriggerMode; title: string; hint: string }> = [
  {
    mode: 'mixed',
    title: 'Mixto (recomendado)',
    hint: 'Solo si el mensaje mezcla producto/datos y pedido visual (banner, imagen, px).',
  },
  {
    mode: 'always',
    title: 'Siempre',
    hint: 'Ejecuta la cadena en cada mensaje del visitante.',
  },
  {
    mode: 'keywords',
    title: 'Palabras clave',
    hint: 'Activa si aparece alguna palabra de tus listas personalizadas.',
  },
];

type Props = {
  config: PipelineConfig;
  orchestratorOptions: PipelineAgentOption[];
  onChange: (next: PipelineConfig) => void;
  resolveAgentProfile: (id: string) => import('@/lib/widget-pipeline-ui').PipelineAgentProfile | undefined;
};

export function PipelineEditor({
  config,
  orchestratorOptions,
  onChange,
  resolveAgentProfile,
}: Props) {
  const orchestratorIds = orchestratorOptions.map((o) => o.id);
  const validation = validatePipelineConfig(config, orchestratorIds, resolveAgentProfile);

  function applyTemplate(templateId: string) {
    const tpl = PIPELINE_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    onChange(
      applyPipelineTemplate(tpl, orchestratorIds, (id) => {
        const opt = orchestratorOptions.find((o) => o.id === id);
        return opt?.profile;
      }),
    );
  }

  function keywordsToText(keys: string[] | undefined): string {
    return (keys ?? []).join(', ');
  }

  function textToKeywords(text: string): string[] {
    return text
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40);
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(99,102,241,0.28)', background: 'rgba(99,102,241,0.04)' }}
      data-tour="widget-builder-pipeline-editor"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} style={{ color: '#6366f1' }} />
            <h3 className="text-sm font-bold m-0">Editor de pipeline</h3>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}
            >
              Business+
            </span>
          </div>
          <p className="text-xs m-0 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
            Define quién ejecuta cada paso y cuándo se activa la cadena contenido → creativo.
          </p>
        </div>
        {validation.ok ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={14} />
            Listo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
            <AlertTriangle size={14} />
            Revisar
          </span>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-2 m-0" style={{ color: 'var(--muted-foreground)' }}>
          Plantillas
        </p>
        <div className="flex flex-wrap gap-2">
          {PIPELINE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl.id)}
              title={tpl.description}
              className="text-left px-3 py-2 rounded-lg border text-xs transition-colors hover:border-indigo-400/50"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            >
              <span className="block font-bold">{tpl.name}</span>
              <span className="block mt-0.5 opacity-70">{tpl.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide m-0" style={{ color: 'var(--muted-foreground)' }}>
            Pasos
          </p>
          <button
            type="button"
            onClick={() => onChange(swapPipelineSteps(config))}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            title="Intercambiar roles de los dos pasos"
          >
            <ArrowLeftRight size={12} />
            Intercambiar pasos
          </button>
        </div>

        {config.steps.map((step, index) => {
          const style = ROLE_STYLES[step.role];
          const agentName =
            orchestratorOptions.find((o) => o.id === step.agentId)?.name ?? 'Seleccionar agente';
          return (
            <div key={step.id}>
              <div
                className="rounded-xl border p-3"
                style={{ background: style.bg, borderColor: style.border }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: style.color }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold m-0" style={{ color: style.color }}>
                      {step.label ?? pipelineRoleLabel(step.role)}
                    </p>
                    <p className="text-[10px] m-0 opacity-80">{pipelineRoleHint(step.role)}</p>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: 'rgba(255,255,255,0.5)', color: style.color }}
                  >
                    {pipelineRoleLabel(step.role)}
                  </span>
                </div>
                <label className="block text-[10px] font-semibold uppercase mb-1 opacity-70">
                  Agente
                </label>
                <select
                  value={step.agentId}
                  onChange={(e) =>
                    onChange(updatePipelineStepAgent(config, step.id, e.target.value))
                  }
                  className="w-full text-xs rounded-lg border px-2 py-2 outline-none"
                  style={{ borderColor: style.border, background: 'var(--background)' }}
                >
                  {orchestratorOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] m-0 mt-1.5 opacity-70 truncate">Actual: {agentName}</p>
              </div>
              {index < config.steps.length - 1 ? (
                <div className="flex justify-center py-1" style={{ color: '#6366f1' }}>
                  <ArrowDown size={16} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-2 m-0" style={{ color: 'var(--muted-foreground)' }}>
          Cuándo activar el pipeline
        </p>
        <div className="space-y-2">
          {TRIGGER_OPTIONS.map((opt) => {
            const selected = config.trigger.mode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => onChange(updatePipelineTrigger(config, { mode: opt.mode }))}
                className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                style={{
                  borderColor: selected ? 'rgba(99,102,241,0.45)' : 'var(--border)',
                  background: selected ? 'rgba(99,102,241,0.1)' : 'var(--background)',
                }}
              >
                <span className="block text-xs font-bold">{opt.title}</span>
                <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {config.trigger.mode === 'keywords' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>
              Palabras — contenido
            </label>
            <textarea
              rows={3}
              value={keywordsToText(config.trigger.contentKeywords)}
              onChange={(e) =>
                onChange(
                  updatePipelineTrigger(config, {
                    contentKeywords: textToKeywords(e.target.value),
                  }),
                )
              }
              placeholder="producto, catálogo, precio…"
              className="w-full text-xs rounded-lg border px-2 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>
              Palabras — creativo
            </label>
            <textarea
              rows={3}
              value={keywordsToText(config.trigger.creativeKeywords)}
              onChange={(e) =>
                onChange(
                  updatePipelineTrigger(config, {
                    creativeKeywords: textToKeywords(e.target.value),
                  }),
                )
              }
              placeholder="banner, imagen, diseño, 1200x628…"
              className="w-full text-xs rounded-lg border px-2 py-2 outline-none resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
            />
          </div>
        </div>
      ) : null}

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-1.5">
          {validation.errors.map((msg) => (
            <p key={msg} className="text-[11px] m-0 text-red-600 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {msg}
            </p>
          ))}
          {validation.warnings.map((msg) => (
            <p key={msg} className="text-[11px] m-0 text-amber-700 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export type { PipelineConfig };
