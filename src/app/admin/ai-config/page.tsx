'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bot, CheckCircle, AlertTriangle, ChevronRight, Loader2, Save, RefreshCw } from 'lucide-react';

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

  // Carga modelos cuando cambia el provider
  const loadModels = useCallback((provider: string) => {
    setLoadingModels(true);
    setError(null);
    fetch(`/api/admin/ai-config/models?provider=${encodeURIComponent(provider)}`)
      .then(r => r.json())
      .then(json => {
        const list = json?.data?.models as AiModelOption[] | undefined;
        setModels(list ?? []);
      })
      .catch(() => setError('No se pudieron cargar los modelos. Verifica que el hub esté activo.'))
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
    </div>
  );
}
