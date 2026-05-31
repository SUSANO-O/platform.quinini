'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, CheckCircle, AlertTriangle, ChevronRight, Loader2, Save, RefreshCw, ShieldAlert } from 'lucide-react';

// ── Plan model tiers ──────────────────────────────────────────────────────────
type ModelTier = 'lite' | 'flash' | 'default' | 'premium';

const TIER_OPTIONS: { value: ModelTier; label: string; color: string; bg: string; desc: string }[] = [
  { value: 'lite',    label: 'Flash Lite',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   desc: '~$0.30/M tokens' },
  { value: 'flash',   label: 'Flash',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  desc: '~$0.70–3/M tokens' },
  { value: 'default', label: 'Estándar',    color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  desc: '~$3–5/M tokens' },
  { value: 'premium', label: 'Pro / Todos', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   desc: '>$5/M tokens' },
];

const PLANS_ORDER = ['free','solo','basic','team','plus','starter','growth','business','enterprise'];

const PLAN_LABELS: Record<string, string> = {
  free: 'Free', solo: 'Solo', basic: 'Basic', team: 'Team', plus: 'Plus',
  starter: 'Starter', growth: 'Growth', business: 'Business', enterprise: 'Enterprise',
};

interface AiModelOption {
  modelId: string;
  name: string;
  provider: string;
  providerLabel: string;
  category: string;
  enabled: boolean;
  deprecated: boolean;
  badge?: string;
  maxTokens?: number;
  description?: string;
  replacementModelId?: string;
}

interface AiConfig {
  provider: string;
  modelId: string;
  updatedAt: string;
}

const PROVIDERS = [
  { key: 'vertex',      label: 'Vertex AI',   sub: 'Gemini (Google Cloud)' },
  { key: 'google-ai',   label: 'Google AI',   sub: 'Gemini API' },
  { key: 'anthropic',   label: 'Anthropic',   sub: 'Claude' },
  { key: 'deepseek',    label: 'DeepSeek',    sub: 'DeepSeek Chat' },
  { key: 'huggingface', label: 'HuggingFace', sub: 'Inference API' },
];

export default function AiConfigPage() {
  const [currentConfig, setCurrentConfig] = useState<AiConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('vertex');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Plan model tiers state ──────────────────────────────────────────────────
  const [planTiers, setPlanTiers] = useState<Record<string, ModelTier>>({});
  const [tierDraft, setTierDraft] = useState<Record<string, ModelTier>>({});
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [savingTiers, setSavingTiers] = useState(false);
  const [tierSavedOk, setTierSavedOk] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);

  // Carga la config guardada
  useEffect(() => {
    fetch('/api/admin/ai-config')
      .then(r => r.json())
      .then(json => {
        const cfg = json?.data as AiConfig | undefined;
        if (cfg) {
          setCurrentConfig(cfg);
          setSelectedProvider(cfg.provider);
          setSelectedModelId(cfg.modelId);
        }
      })
      .catch(() => setError('Error al cargar la configuración.'))
      .finally(() => setLoadingConfig(false));
  }, []);

  // Carga tiers por plan
  useEffect(() => {
    setLoadingTiers(true);
    fetch('/api/admin/plan-model-tiers')
      .then(r => r.json())
      .then(json => {
        const t = (json?.tiers ?? {}) as Record<string, ModelTier>;
        setPlanTiers(t);
        setTierDraft(t);
      })
      .catch(() => setTierError('Error al cargar los tiers de modelos.'))
      .finally(() => setLoadingTiers(false));
  }, []);

  const handleTierChange = (plan: string, tier: ModelTier) => {
    setTierDraft(prev => ({ ...prev, [plan]: tier }));
  };

  const saveTiers = async () => {
    setSavingTiers(true);
    setTierError(null);
    setTierSavedOk(false);
    try {
      const res = await fetch('/api/admin/plan-model-tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: tierDraft }),
      });
      const json = (await res.json()) as { tiers?: Record<string, ModelTier>; error?: string };
      if (!res.ok) throw new Error(json.error || 'Error al guardar.');
      if (json.tiers) { setPlanTiers(json.tiers); setTierDraft(json.tiers); }
      setTierSavedOk(true);
      setTimeout(() => setTierSavedOk(false), 3000);
    } catch (e) {
      setTierError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setSavingTiers(false);
    }
  };

  const tierDraftChanged = JSON.stringify(tierDraft) !== JSON.stringify(planTiers);

  // Carga modelos cuando cambia el provider
  const loadModels = useCallback((provider: string) => {
    setLoadingModels(true);
    setError(null);
    fetch(`/api/admin/ai-config/models?provider=${encodeURIComponent(provider)}`)
      .then(async r => {
        const json = await r.json() as { success?: boolean; data?: { models?: AiModelOption[] }; error?: string; detail?: string };
        if (!r.ok || json?.error) {
          const msg = json?.error ?? 'Error al cargar modelos.';
          const detail = json?.detail ? ` (${json.detail})` : '';
          setError(msg + detail);
          setModels([]);
          return;
        }
        const list = json?.data?.models;
        setModels(Array.isArray(list) ? list : []);
      })
      .catch(() => setError('No se pudo conectar con el servidor.'))
      .finally(() => setLoadingModels(false));
  }, []);

  useEffect(() => {
    if (!loadingConfig) loadModels(selectedProvider);
  }, [selectedProvider, loadingConfig, loadModels]);

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setSelectedModelId('');
  };

  const handleSave = async () => {
    if (!selectedModelId) return;
    setSaving(true);
    setSavedOk(false);
    setError(null);
    try {
      const resp = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, modelId: selectedModelId }),
      });
      if (!resp.ok) throw new Error('Error al guardar');
      const json = await resp.json();
      setCurrentConfig(json?.data);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      setError('Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    selectedModelId &&
    (selectedModelId !== currentConfig?.modelId || selectedProvider !== currentConfig?.provider);

  if (loadingConfig) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={24} style={{ color: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={20} style={{ color: '#6366f1' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Asistente AI</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
            Selecciona el proveedor y modelo que se usará como asistente AI en la plataforma.
          </p>
        </div>
      </div>

      {/* Config actual */}
      {currentConfig && (
        <div style={{ marginBottom: 28, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            Configuración actual: <strong style={{ color: 'var(--foreground)' }}>{currentConfig.modelId}</strong>
            {' '}· {PROVIDERS.find(p => p.key === currentConfig.provider)?.label ?? currentConfig.provider}
            {' '}· actualizado {new Date(currentConfig.updatedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {/* Selector de Provider */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Proveedor
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROVIDERS.map(p => {
            const active = selectedProvider === p.key;
            return (
              <button
                key={p.key}
                onClick={() => handleProviderChange(p.key)}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: active ? '2px solid #6366f1' : '1.5px solid var(--border)',
                  background: active ? 'rgba(99,102,241,0.08)' : 'var(--card)',
                  color: active ? '#6366f1' : 'var(--foreground)',
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                  transition: 'all 0.15s',
                }}
              >
                <span>{p.label}</span>
                <span style={{ fontSize: 10, color: active ? 'rgba(99,102,241,0.7)' : 'var(--muted-foreground)', fontWeight: 400 }}>{p.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Modelos */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Modelos disponibles
          </p>
          <button
            onClick={() => loadModels(selectedProvider)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)', fontSize: 11, cursor: 'pointer' }}
          >
            <RefreshCw size={11} style={{ animation: loadingModels ? 'spin 0.8s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {loadingModels ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8, color: 'var(--muted-foreground)', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
            Cargando modelos...
          </div>
        ) : models.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13, border: '1.5px dashed var(--border)', borderRadius: 12 }}>
            No hay modelos disponibles para este proveedor.<br />
            <span style={{ fontSize: 11 }}>Verifica que el hub esté activo y el API key configurado.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {models.map(model => {
              const isSelected = selectedModelId === model.modelId;
              const isCurrent = currentConfig?.modelId === model.modelId;

              return (
                <button
                  key={model.modelId}
                  onClick={() => !model.deprecated && setSelectedModelId(model.modelId)}
                  disabled={model.deprecated}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 12, border: isSelected ? '2px solid #6366f1' : '1.5px solid var(--border)',
                    background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                    cursor: model.deprecated ? 'not-allowed' : 'pointer',
                    opacity: model.deprecated ? 0.5 : 1,
                    textAlign: 'left', width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: model.deprecated ? '#ef4444' : model.enabled ? '#22c55e' : '#f59e0b',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: 'var(--foreground)' }}>
                        {model.name}
                      </span>
                      {model.badge && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 600 }}>
                          {model.badge}
                        </span>
                      )}
                      {model.deprecated && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
                          Deprecated
                        </span>
                      )}
                      {isCurrent && !isSelected && (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 600 }}>
                          Actual
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                        {model.modelId}
                      </span>
                      {model.maxTokens && (
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                          · {(model.maxTokens / 1000).toFixed(0)}K tokens
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                        · {model.category}
                      </span>
                    </div>
                    {model.description && (
                      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.4 }}>
                        {model.description}
                      </p>
                    )}
                    {model.deprecated && model.replacementModelId && (
                      <p style={{ fontSize: 11, color: '#f59e0b', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ChevronRight size={10} /> Reemplazado por: {model.replacementModelId}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <CheckCircle size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Botón guardar */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: hasChanges && !saving ? '#6366f1' : 'var(--border)',
            color: hasChanges && !saving ? '#fff' : 'var(--muted-foreground)',
            fontSize: 14, fontWeight: 600, cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {saving ? (
            <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <Save size={15} />
          )}
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>

        {savedOk && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
            <CheckCircle size={15} /> Guardado correctamente
          </div>
        )}
      </div>

      {/* ── Tiers de modelos por plan ────────────────────────────────────────── */}
      <div style={{ marginTop: 48, borderTop: '1px solid var(--border)', paddingTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={20} style={{ color: '#ef4444' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Modelos por plan</h2>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
              Controla el tier máximo de modelo que puede usar cada plan. Impacto directo en costos Vertex AI.
            </p>
          </div>
        </div>

        {/* Tier legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
          {TIER_OPTIONS.map(t => (
            <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: t.bg, border: `1px solid ${t.color}33` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.label}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{t.desc}</span>
            </div>
          ))}
        </div>

        {tierError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: 12, color: '#ef4444' }}>{tierError}</span>
          </div>
        )}

        {loadingTiers ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, color: 'var(--muted-foreground)', fontSize: 13 }}>
            <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Cargando...
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {PLANS_ORDER.map((planId, i) => {
              const currentTier = tierDraft[planId] ?? 'lite';
              const opt = TIER_OPTIONS.find(t => t.value === currentTier) ?? TIER_OPTIONS[0];
              return (
                <div key={planId} style={{
                  display: 'grid', gridTemplateColumns: '100px 1fr', gap: 16,
                  padding: '14px 20px', alignItems: 'center',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{PLAN_LABELS[planId] ?? planId}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {TIER_OPTIONS.map(t => {
                      const active = currentTier === t.value;
                      return (
                        <button
                          key={t.value}
                          onClick={() => handleTierChange(planId, t.value)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                            border: active ? `2px solid ${t.color}` : '1.5px solid var(--border)',
                            background: active ? t.bg : 'var(--background)',
                            color: active ? t.color : 'var(--muted-foreground)',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                    <span style={{ fontSize: 11, color: opt.color, alignSelf: 'center', marginLeft: 4 }}>← actual</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={saveTiers}
            disabled={!tierDraftChanged || savingTiers}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10,
              border: 'none',
              background: tierDraftChanged && !savingTiers ? '#ef4444' : 'var(--border)',
              color: tierDraftChanged && !savingTiers ? '#fff' : 'var(--muted-foreground)',
              fontSize: 14, fontWeight: 600, cursor: tierDraftChanged && !savingTiers ? 'pointer' : 'not-allowed',
            }}
          >
            {savingTiers ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={15} />}
            {savingTiers ? 'Guardando...' : 'Guardar tiers'}
          </button>
          {tierSavedOk && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
              <CheckCircle size={15} /> Tiers guardados
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
