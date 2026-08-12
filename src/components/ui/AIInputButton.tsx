'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, ArrowRight, Loader2 } from '@/components/ui/icons';

export type AiFieldType =
  | 'agent_name'
  | 'agent_description'
  | 'system_prompt'
  | 'faq_question'
  | 'faq_answer'
  | 'behavior_rule'
  | 'welcome_message'
  | 'error_message'
  | 'widget_title'
  | 'generic';

interface AgentContext {
  name?: string;
  purpose?: string;
  industry?: string;
  tone?: string;
  language?: string;
}

interface AIInputButtonProps {
  fieldType: AiFieldType;
  fieldName: string;
  agentContext?: AgentContext;
  onResult: (content: string) => void;
  position?: 'right' | 'right-top';
}

const PLACEHOLDER_BY_TYPE: Record<AiFieldType, string> = {
  agent_name:        'Ej: Quiero un nombre para un agente de ventas de seguros médicos...',
  agent_description: 'Ej: Describe qué hace este agente y a quién está dirigido...',
  system_prompt:     'Ej: Un asistente de soporte técnico para software de contabilidad, tono formal...',
  faq_question:      'Ej: Pregunta que haría un cliente sobre precios o tiempos de entrega...',
  faq_answer:        'Ej: Respuesta sobre política de devoluciones en 30 días...',
  behavior_rule:     'Ej: Regla para que el agente no comparta información de competidores...',
  welcome_message:   'Ej: Bienvenida para un agente de soporte de e-commerce...',
  error_message:     'Ej: Mensaje cuando el agente no puede responder la pregunta...',
  widget_title:      'Ej: Título para el chat de un banco digital...',
  generic:           'Describe lo que necesitas generar...',
};

export function AIInputButton({
  fieldType,
  fieldName,
  agentContext,
  onResult,
  position = 'right',
}: AIInputButtonProps) {
  const [open, setOpen]               = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [mounted, setMounted]         = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Necesario para createPortal — solo disponible en el cliente
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      setDescription('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && open && description.trim()) {
        void handleGenerate();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, description]);

  const handleGenerate = async () => {
    if (!description.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/ai/enhance-field', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fieldType,
          fieldName,
          userDescription: description.trim(),
          agentContext:    agentContext ?? {},
        }),
      });

      const json = await resp.json() as { success?: boolean; data?: { content?: string }; error?: string };

      if (!resp.ok || !json.success) {
        throw new Error(json.error ?? 'Error al generar contenido');
      }

      const content = json.data?.content ?? '';
      if (!content) throw new Error('El modelo no generó contenido. Intenta de nuevo.');

      onResult(content);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const buttonTop       = position === 'right-top' ? 8 : '50%';
  const buttonTransform = position === 'right-top' ? 'none' : 'translateY(-50%)';

  // Modal renderizado en document.body via portal — completamente aislado del árbol del formulario
  const modal = open && mounted ? createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        padding: 16,
      }}
      onMouseDown={e => {
        // Solo cierra si el click fue exactamente en el backdrop (no en el contenido)
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={13} style={{ color: '#6366f1' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                Generar con AI
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>
                {fieldName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={PLACEHOLDER_BY_TYPE[fieldType]}
          rows={3}
          style={{
            width: '100%', resize: 'vertical',
            padding: '10px 12px',
            border: '1.5px solid var(--border)',
            borderRadius: 10,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 13,
            lineHeight: 1.5,
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = '#6366f1'; }}
          onBlur={e   => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0' }}>{error}</p>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>
            ⌘ + Enter para generar
          </p>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!description.trim() || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: description.trim() && !loading ? '#6366f1' : 'var(--border)',
              color:      description.trim() && !loading ? '#fff'    : 'var(--muted-foreground)',
              fontSize: 13, fontWeight: 600,
              cursor: description.trim() && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            {loading ? (
              <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <ArrowRight size={13} />
            )}
            {loading ? 'Generando...' : 'Generar'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Generar con AI"
        aria-label="Generar con AI"
        style={{
          position: 'absolute',
          right: 8,
          top: buttonTop,
          transform: buttonTransform,
          width: 24,
          height: 24,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6366f1',
          opacity: 0.7,
          transition: 'opacity 0.15s, background 0.15s',
          zIndex: 10,
          padding: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.1)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <Sparkles size={13} />
      </button>

      {modal}
    </>
  );
}
