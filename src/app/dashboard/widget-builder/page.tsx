'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useSubscription } from '@/hooks/use-subscription';
import { WidgetBuilderTrustBadges } from '@/components/dashboard/widget-builder-trust-badges';
import {
  WidgetBuilderAppearanceStep,
  WidgetBuilderBehaviorStep,
  WidgetBuilderFormActions,
  WidgetBuilderFormHeader,
  WidgetBuilderIdentityStep,
  WidgetBuilderMobileStepper,
  WidgetBuilderPublishStep,
  WidgetBuilderShell,
} from '@/components/dashboard/widget-builder';
import {
  createDefaultPipelineConfig,
  normalizePipelineConfig,
  validatePipelineConfig,
  validatePipelineWidgetSetup,
} from '@/lib/widget-pipeline-ui';
import { isSoloChatOnlyPlan } from '@/lib/plan-catalog';
import { applySoloWidgetDefaults } from '@/lib/solo-plan-limits';
import { BRAND } from '@/lib/brand-colors';
import type {
  ClientAgentRow,
  FeedbackQuestion,
  FeedbackQuestionType,
  OrchestratorSubAgent,
  WidgetConfig,
  WidgetShortcut,
} from '@/lib/widget-builder';
import {
  DEFAULT_WIDGET_CONFIG,
  WIDGET_STEP_DESCRIPTIONS,
  WIDGET_WIZARD_STEPS,
  WIDGET_BUILDER_UI_ACCENT,
  agentProfileFromRow,
  effectiveWidgetAgentId,
  firstSelectableWidgetAgentId,
  generateWidgetSnippet,
  resolveAgentProfileByWidgetId,
  resolveStoredWidgetAgentId,
  sortAgentsForWidgetPicker,
} from '@/lib/widget-builder';

const BRAND_R = BRAND.primary;

export default function WidgetBuilderPage() {
  const { subscription } = useSubscription();
  const [cfg, setCfg] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG);
  const [agents, setAgents] = useState<ClientAgentRow[]>([]);
  const [orchestratorSubs, setOrchestratorSubs] = useState<OrchestratorSubAgent[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [editWidgetId, setEditWidgetId] = useState<string | null>(null);
  const [snippetToken, setSnippetToken] = useState('YOUR_TOKEN');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shortcuts, setShortcuts] = useState<WidgetShortcut[]>([]);
  const [suggestingShortcuts, setSuggestingShortcuts] = useState(false);
  const [feedbackQuestions, setFeedbackQuestions] = useState<FeedbackQuestion[]>([]);
  const [shortcutSuggestErr, setShortcutSuggestErr] = useState('');
  const [wizardStep, setWizardStep] = useState(0);

  const plan = subscription?.plan ?? 'free';
  const planActive =
    subscription?.status === 'active' || subscription?.status === 'trialing';
  const soloChatOnly = planActive && isSoloChatOnlyPlan(plan);
  const multiAgentEligible = planActive && (plan === 'business' || plan === 'enterprise');

  const selectedOrchestratorIds = useMemo(
    () =>
      (cfg.multiAgentEnabled ? [cfg.agentId, ...cfg.orchestratorAgentIds] : [cfg.agentId]).filter(
        (id) => /^[a-f0-9]{24}$/i.test(id),
      ),
    [cfg.agentId, cfg.orchestratorAgentIds, cfg.multiAgentEnabled],
  );

  const pipelineSetup = useMemo(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return null;
    return validatePipelineWidgetSetup(selectedOrchestratorIds, (id) =>
      resolveAgentProfileByWidgetId(agents, id),
    );
  }, [cfg.multiAgentEnabled, cfg.multiAgentMode, selectedOrchestratorIds, agents]);

  const pipelineConfigValidation = useMemo(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return null;
    return validatePipelineConfig(cfg.pipelineConfig, selectedOrchestratorIds, (id) =>
      resolveAgentProfileByWidgetId(agents, id),
    );
  }, [cfg.multiAgentEnabled, cfg.multiAgentMode, cfg.pipelineConfig, selectedOrchestratorIds, agents]);

  useEffect(() => {
    if (!soloChatOnly) return;
    setCfg((prev) => ({
      ...prev,
      ...applySoloWidgetDefaults(plan, prev as unknown as Record<string, unknown>),
    } as WidgetConfig));
  }, [soloChatOnly, plan]);

  const orchestratorOptions = useMemo(
    () =>
      selectedOrchestratorIds
        .map((id) => {
          const row = agents.find(
            (a) => effectiveWidgetAgentId(a) === id || a._id === id,
          );
          if (!row) return null;
          return {
            id,
            name: row.name,
            profile: agentProfileFromRow(row),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
    [selectedOrchestratorIds, agents],
  );

  useEffect(() => {
    if (!cfg.multiAgentEnabled || cfg.multiAgentMode !== 'pipeline') return;
    if (selectedOrchestratorIds.length < 2) return;
    setCfg((prev) => {
      if (prev.multiAgentMode !== 'pipeline') return prev;
      const resolve = (id: string) => resolveAgentProfileByWidgetId(agents, id);
      const normalized = normalizePipelineConfig(prev.pipelineConfig, selectedOrchestratorIds);
      const next =
        normalized ??
        createDefaultPipelineConfig(selectedOrchestratorIds, resolve);
      if (
        prev.pipelineConfig &&
        JSON.stringify(prev.pipelineConfig) === JSON.stringify(next)
      ) {
        return prev;
      }
      return { ...prev, pipelineConfig: next };
    });
  }, [
    cfg.multiAgentEnabled,
    cfg.multiAgentMode,
    selectedOrchestratorIds.join(','),
    agents,
  ]);

  useEffect(() => {
    const orchIds = (cfg.multiAgentEnabled
      ? [cfg.agentId, ...cfg.orchestratorAgentIds]
      : [cfg.agentId]
    ).filter((id) => /^[a-f0-9]{24}$/i.test(id));
    if (!orchIds.length) {
      setOrchestratorSubs([]);
      return;
    }
    let cancelled = false;
    setLoadingSubs(true);
    void (async () => {
      try {
        const merged = new Map<string, OrchestratorSubAgent>();
        for (const oid of orchIds) {
          const res = await fetch(`/api/agents/${oid}`);
          if (!res.ok) continue;
          const data = (await res.json()) as {
            subAgents?: OrchestratorSubAgent[];
            agent?: { name?: string };
          };
          const parentName = data.agent?.name ?? '';
          for (const sub of data.subAgents ?? []) {
            if (!sub || typeof sub._id !== 'string' || sub.status === 'disabled') continue;
            if (!merged.has(sub._id)) {
              merged.set(sub._id, { ...sub, parentName });
            }
          }
        }
        if (cancelled) return;
        const subs = [...merged.values()];
        setOrchestratorSubs(subs);
        setCfg((prev) => {
          const valid = new Set(subs.map((s) => s._id));
          const filtered = prev.agentIds.filter((id) => valid.has(id));
          return filtered.length === prev.agentIds.length ? prev : { ...prev, agentIds: filtered };
        });
      } catch {
        if (!cancelled) setOrchestratorSubs([]);
      } finally {
        if (!cancelled) setLoadingSubs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cfg.agentId, cfg.orchestratorAgentIds, cfg.multiAgentEnabled]);

  function isOrchestratorSelected(id: string) {
    return cfg.agentId === id || cfg.orchestratorAgentIds.includes(id);
  }

  function toggleOrchestratorAgent(id: string) {
    if (!cfg.multiAgentEnabled) {
      update({ agentId: id, orchestratorAgentIds: [] });
      return;
    }
    if (cfg.agentId === id) {
      if (cfg.orchestratorAgentIds.length === 0) return;
      update({
        agentId: cfg.orchestratorAgentIds[0],
        orchestratorAgentIds: cfg.orchestratorAgentIds.slice(1),
      });
      return;
    }
    if (cfg.orchestratorAgentIds.includes(id)) {
      update({ orchestratorAgentIds: cfg.orchestratorAgentIds.filter((x) => x !== id) });
      return;
    }
    const total = 1 + cfg.orchestratorAgentIds.length;
    if (total >= 5) {
      toast.error('Máximo 5 agentes orquestadores en el widget');
      return;
    }
    update({ orchestratorAgentIds: [...cfg.orchestratorAgentIds, id] });
  }

  function toggleTeamAgent(id: string) {
    setCfg((prev) => {
      const has = prev.agentIds.includes(id);
      if (has) {
        return { ...prev, agentIds: prev.agentIds.filter((x) => x !== id) };
      }
      if (prev.agentIds.length >= 5) {
        toast.error('Máximo 5 especialistas adicionales en el equipo');
        return prev;
      }
      return { ...prev, agentIds: [...prev.agentIds, id] };
    });
  }

  function goNextStep() {
    if (wizardStep === 0) {
      if (!cfg.name.trim()) { toast.error('Indica un nombre para el widget'); return; }
      if (!cfg.agentId) { toast.error('Selecciona un agente'); return; }
      if (pipelineConfigValidation && !pipelineConfigValidation.ok) {
        toast.error(pipelineConfigValidation.errors[0] ?? 'Revisa la configuración del pipeline');
        return;
      }
      if (pipelineSetup && !pipelineSetup.ok && !cfg.pipelineConfig) {
        toast.error(pipelineSetup.warnings[0] ?? 'Revisa la configuración del pipeline');
        return;
      }
    }
    setWizardStep((s) => Math.min(WIDGET_WIZARD_STEPS.length - 1, s + 1));
  }

  useEffect(() => {
    let cancelled = false;
    const editParam =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('edit')
        : null;
    const editId =
      editParam && /^[a-f0-9]{24}$/i.test(editParam) ? editParam : null;

    async function run() {
      try {
        const agentsRes = await fetch('/api/agents');
        const agentsData = (await agentsRes.json()) as { agents?: ClientAgentRow[] };
        const list = sortAgentsForWidgetPicker(
          (agentsData.agents ?? []).filter(
            (a) => a.type === 'agent' && a.status === 'active',
          ),
        );
        if (cancelled) return;
        setAgents(list);

        if (editId) {
          const wRes = await fetch(`/api/widgets/${editId}`);
          if (!wRes.ok) {
            setEditWidgetId(null);
            setCfg((prev) => {
              const okIds = new Set(
                list.map((a) => effectiveWidgetAgentId(a)).filter(Boolean),
              );
              const normalized = prev.agentId
                ? resolveStoredWidgetAgentId(prev.agentId, list)
                : '';
              if (normalized && okIds.has(normalized)) {
                return normalized === prev.agentId
                  ? prev
                  : { ...prev, agentId: normalized };
              }
              const first = firstSelectableWidgetAgentId(list);
              if (first) return { ...prev, agentId: first };
              return prev;
            });
          } else {
            const data = (await wRes.json()) as {
              widget?: Record<string, unknown>;
            };
            const widget = data.widget;
            if (cancelled || !widget) return;
            setEditWidgetId(editId);
            const tok =
              typeof widget.afhubToken === 'string' && widget.afhubToken.startsWith('wt_')
                ? widget.afhubToken
                : 'YOUR_TOKEN';
            setSnippetToken(tok);
            const th = widget.theme === 'dark' ? 'dark' : 'light';
            const rawAgent = String(widget.agentId ?? '');
            setCfg({
              name: String(widget.name ?? DEFAULT_WIDGET_CONFIG.name),
              agentId: resolveStoredWidgetAgentId(rawAgent, list) || rawAgent,
              color: String(widget.color ?? DEFAULT_WIDGET_CONFIG.color),
              title: String(widget.title ?? DEFAULT_WIDGET_CONFIG.title),
              subtitle: String(widget.subtitle ?? ''),
              welcome: String(widget.welcome ?? ''),
              fabHint: String(widget.fabHint ?? ''),
              humanSupportPhone: String(widget.humanSupportPhone ?? ''),
              humanSupportEnabled: widget.humanSupportEnabled !== false,
              handoffNotifyMode:
                widget.handoffNotifyMode === 'inbox' ||
                widget.handoffNotifyMode === 'webhook' ||
                widget.handoffNotifyMode === 'slack' ||
                widget.handoffNotifyMode === 'both'
                  ? widget.handoffNotifyMode
                  : 'both',
              handoffEnabled: widget.handoffEnabled !== false,
              handoffTimeout: typeof (widget as { handoffTimeout?: number }).handoffTimeout === 'number' ? (widget as { handoffTimeout?: number }).handoffTimeout! : 5,
              feedbackEnabled: (widget as { feedbackEnabled?: boolean }).feedbackEnabled === true,
              feedbackTitle: String((widget as { feedbackTitle?: string }).feedbackTitle ?? '¿Cómo fue tu experiencia?'),
              feedbackThanks: String((widget as { feedbackThanks?: string }).feedbackThanks ?? '¡Gracias por tu feedback!'),
              conversationIdleTimeout: typeof (widget as { conversationIdleTimeout?: number }).conversationIdleTimeout === 'number' ? (widget as { conversationIdleTimeout?: number }).conversationIdleTimeout! : 15,
              policyEnabled: (widget as { policyEnabled?: boolean }).policyEnabled !== false,
              policyText: String((widget as { policyText?: string }).policyText ?? DEFAULT_WIDGET_CONFIG.policyText),
              policyLinkLabel: String((widget as { policyLinkLabel?: string }).policyLinkLabel ?? DEFAULT_WIDGET_CONFIG.policyLinkLabel),
              policyUrl: String((widget as { policyUrl?: string }).policyUrl ?? ''),
              avatar: String(widget.avatar ?? ''),
              fabAvatarSize:
                typeof (widget as { fabAvatarSize?: number }).fabAvatarSize === 'number'
                  ? Math.min(120, Math.max(56, Math.round((widget as { fabAvatarSize?: number }).fabAvatarSize!)))
                  : DEFAULT_WIDGET_CONFIG.fabAvatarSize,
              position: String(widget.position ?? 'bottom-right'),
              theme: th,
              borderRadius: String(widget.borderRadius ?? '16px'),
              autoOpen: Boolean(widget.autoOpen),
              fabDismissible: widget.fabDismissible !== false,
              voiceEnabled: widget.voiceEnabled !== false,
              imageUploadEnabled: (widget as { imageUploadEnabled?: boolean }).imageUploadEnabled !== false,
              micEnabled: typeof (widget as { micEnabled?: boolean }).micEnabled === 'boolean'
                ? (widget as { micEnabled?: boolean }).micEnabled !== false
                : widget.voiceEnabled !== false,
              multiAgentEnabled: widget.multiAgentEnabled === true,
              multiAgentMode:
                widget.multiAgentMode === 'parallel'
                  ? 'parallel'
                  : widget.multiAgentMode === 'pipeline'
                    ? 'pipeline'
                    : 'triage',
              agentIds: Array.isArray(widget.agentIds)
                ? (widget.agentIds as string[]).filter((id) => typeof id === 'string')
                : [],
              orchestratorAgentIds: Array.isArray(widget.orchestratorAgentIds)
                ? (widget.orchestratorAgentIds as string[]).filter((id) => typeof id === 'string')
                : [],
              pipelineConfig: normalizePipelineConfig(
                widget.pipelineConfig,
                [
                  resolveStoredWidgetAgentId(rawAgent, list) || rawAgent,
                  ...(Array.isArray(widget.orchestratorAgentIds)
                    ? (widget.orchestratorAgentIds as string[])
                    : []),
                ].filter((id) => /^[a-f0-9]{24}$/i.test(String(id))),
              ),
            });
            if (Array.isArray(widget.shortcuts)) {
              setShortcuts((widget.shortcuts as WidgetShortcut[]).map((s) => ({
                id: s.id || crypto.randomUUID(),
                label: s.label || '',
                message: s.message || '',
                emoji: s.emoji || '',
                enabled: s.enabled !== false,
              })));
            }
            if (Array.isArray((widget as { feedbackQuestions?: FeedbackQuestion[] }).feedbackQuestions)) {
              setFeedbackQuestions(((widget as { feedbackQuestions?: FeedbackQuestion[] }).feedbackQuestions || []).map((q) => ({
                id: q.id || crypto.randomUUID(),
                text: q.text || '',
                type: (['rating', 'choice', 'text', 'yesno'].includes(q.type) ? q.type : 'rating') as FeedbackQuestionType,
                options: Array.isArray(q.options) ? q.options : [],
                required: q.required === true,
                enabled: q.enabled !== false,
              })));
            }
          }
        } else {
          setCfg((prev) => {
            const okIds = new Set(
              list.map((a) => effectiveWidgetAgentId(a)).filter(Boolean),
            );
            const normalized = prev.agentId
              ? resolveStoredWidgetAgentId(prev.agentId, list)
              : '';
            if (normalized && okIds.has(normalized)) {
              return normalized === prev.agentId ? prev : { ...prev, agentId: normalized };
            }
            const first = firstSelectableWidgetAgentId(list);
            if (first) return { ...prev, agentId: first };
            return prev;
          });
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<WidgetConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
  }, []);

  async function suggestShortcuts() {
    const agentName = agents.find((a) => effectiveWidgetAgentId(a) === cfg.agentId)?.name ?? cfg.title ?? '';
    if (!agentName) return;
    setSuggestingShortcuts(true);
    setShortcutSuggestErr('');
    try {
      const resp = await fetch('/api/ai/suggest-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          agentPurpose: cfg.subtitle || cfg.title || agentName,
          faqCount: 3,
          rulesCount: 3,
        }),
      });
      const json = await resp.json() as {
        success?: boolean;
        data?: { faqs?: Array<{ question: string }>; rules?: Array<{ title: string; description: string }> };
        error?: { code?: string; userMessage?: string; message?: string };
      };

      if (!json.success) {
        const msg = json.error?.userMessage ?? json.error?.message ?? 'No se pudieron generar shortcuts. Intenta de nuevo.';
        setShortcutSuggestErr(msg);
        return;
      }
      if (!json.data) return;

      const suggested: WidgetShortcut[] = [
        ...(json.data.faqs ?? []).slice(0, 3).map((f) => ({
          id: crypto.randomUUID(), label: f.question, message: f.question, emoji: '❓', enabled: true,
        })),
        ...(json.data.rules ?? []).slice(0, 2).map((r) => ({
          id: crypto.randomUUID(), label: r.title, message: r.description, emoji: '⚡', enabled: true,
        })),
      ];
      setShortcuts((prev) => {
        const existingMessages = new Set(prev.map((s) => s.message));
        const newOnes = suggested.filter((s) => !existingMessages.has(s.message));
        return [...prev, ...newOnes].slice(0, 20);
      });
    } catch {
      setShortcutSuggestErr('Error de conexión. Intenta de nuevo.');
    } finally {
      setSuggestingShortcuts(false);
    }
  }

  function copySnippet() {
    const code = generateWidgetSnippet(cfg, snippetToken);
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveWidget() {
    if (cfg.multiAgentEnabled && cfg.multiAgentMode === 'pipeline') {
      const check = validatePipelineConfig(cfg.pipelineConfig, selectedOrchestratorIds, (id) =>
        resolveAgentProfileByWidgetId(agents, id),
      );
      if (!check.ok) {
        toast.error(check.errors[0] ?? 'Configura el pipeline con dos pasos y agentes distintos');
        return;
      }
    }
    setSaving(true);
    try {
      const payload = soloChatOnly
        ? { ...applySoloWidgetDefaults(plan, { ...cfg, shortcuts, feedbackQuestions } as Record<string, unknown>), shortcuts, feedbackQuestions }
        : { ...cfg, shortcuts, feedbackQuestions };
      if (editWidgetId) {
        const res = await fetch(`/api/widgets/${editWidgetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success('Widget actualizado');
        } else {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? 'No se pudo guardar el widget');
        }
      } else {
        const res = await fetch('/api/widgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(soloChatOnly ? { ...applySoloWidgetDefaults(plan, cfg as unknown as Record<string, unknown>), feedbackQuestions } : { ...cfg, feedbackQuestions }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            widget?: { afhubToken?: string; _id?: string };
          };
          const wid = data.widget?._id;
          if (wid) {
            setEditWidgetId(String(wid));
            if (typeof window !== 'undefined') {
              window.history.replaceState(
                null,
                '',
                `/dashboard/widget-builder?edit=${wid}`,
              );
            }
          }
          if (data.widget?.afhubToken?.startsWith('wt_')) {
            setSnippetToken(data.widget.afhubToken);
          }
          toast.success('Widget creado correctamente');
        } else {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
            code?: string;
            existingWidgetId?: string;
          } | null;
          if (err?.code === 'WIDGET_NAME_TAKEN' && err.existingWidgetId) {
            setEditWidgetId(String(err.existingWidgetId));
            if (typeof window !== 'undefined') {
              window.history.replaceState(
                null,
                '',
                `/dashboard/widget-builder?edit=${err.existingWidgetId}`,
              );
            }
            toast.error(
              err.error ?? 'Ya existe un widget con ese nombre. Abriéndolo en modo edición.',
            );
          } else {
            toast.error(err?.error ?? 'No se pudo crear el widget');
          }
        }
      }
    } catch {
      toast.error('Error de red al guardar');
    }
    setSaving(false);
  }

  const activeStep = WIDGET_WIZARD_STEPS[wizardStep];
  const railItems = WIDGET_WIZARD_STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    icon: <s.icon size={18} strokeWidth={1.75} aria-hidden />,
    state: (i < wizardStep ? 'done' : i === wizardStep ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));

  return (
    <WidgetBuilderShell
      wizardStep={wizardStep}
      accentColor={BRAND_R}
      railItems={railItems}
      onStepSelect={(id) => {
        const idx = WIDGET_WIZARD_STEPS.findIndex((s) => s.id === id);
        if (idx >= 0) setWizardStep(idx);
      }}
    >
      <WidgetBuilderMobileStepper wizardStep={wizardStep} />

      <div
        className={`widget-builder-form-card${wizardStep === 3 ? ' widget-builder-form-card--publish' : ''}${wizardStep === 1 ? ' widget-builder-form-card--appearance' : ''}`}
        data-tour="widget-builder-form"
      >
            {wizardStep !== 3 ? (
              <WidgetBuilderFormHeader
                wizardStep={wizardStep}
                totalSteps={WIDGET_WIZARD_STEPS.length}
                editWidgetId={editWidgetId}
                stepIcon={activeStep.icon}
                stepLabel={activeStep.label}
                stepDescription={WIDGET_STEP_DESCRIPTIONS[activeStep.id]}
                accentColor={WIDGET_BUILDER_UI_ACCENT}
              />
            ) : null}

            {wizardStep === 3 ? (
              <WidgetBuilderPublishStep
                widgetName={cfg.name}
                snippet={generateWidgetSnippet(cfg, snippetToken)}
                snippetToken={snippetToken}
                copied={copied}
                saving={saving}
                loadingInitial={loadingInitial}
                editWidgetId={editWidgetId}
                onCopy={copySnippet}
                onSave={() => void saveWidget()}
                onBack={() => setWizardStep(2)}
              />
            ) : null}

            {wizardStep === 0 ? (
              <WidgetBuilderIdentityStep
                cfg={cfg}
                onChange={update}
                agents={agents}
                orchestratorSubs={orchestratorSubs}
                loadingInitial={loadingInitial}
                loadingSubs={loadingSubs}
                multiAgentEligible={multiAgentEligible}
                selectedOrchestratorIds={selectedOrchestratorIds}
                orchestratorOptions={orchestratorOptions}
                pipelineSetup={pipelineSetup}
                isOrchestratorSelected={isOrchestratorSelected}
                onToggleOrchestrator={toggleOrchestratorAgent}
                onToggleTeamAgent={toggleTeamAgent}
              />
            ) : null}

            {wizardStep === 1 ? (
              <WidgetBuilderAppearanceStep cfg={cfg} onChange={update} />
            ) : null}

            {wizardStep === 2 ? (
              <WidgetBuilderBehaviorStep
                cfg={cfg}
                onChange={update}
                soloChatOnly={soloChatOnly}
                shortcuts={shortcuts}
                onShortcutsChange={setShortcuts}
                feedbackQuestions={feedbackQuestions}
                onFeedbackQuestionsChange={setFeedbackQuestions}
                suggestingShortcuts={suggestingShortcuts}
                shortcutSuggestErr={shortcutSuggestErr}
                onSuggestShortcuts={() => void suggestShortcuts()}
              />
            ) : null}

            {wizardStep < 3 ? (
              <WidgetBuilderFormActions
                showBack={wizardStep > 0}
                soloPrimary={wizardStep === 0}
                onBack={() => setWizardStep((s) => Math.max(0, s - 1))}
                onNext={goNextStep}
              />
            ) : null}

            {wizardStep === 0 ? <WidgetBuilderTrustBadges /> : null}
      </div>
    </WidgetBuilderShell>
  );
}

