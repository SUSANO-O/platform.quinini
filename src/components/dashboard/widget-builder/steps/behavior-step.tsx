'use client';

import Link from 'next/link';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { HandoffNotifyMode } from '@/lib/handoff-notify';
import { HANDOFF_NOTIFY_MODE_LABELS } from '@/lib/handoff-notify';
import type {
  FeedbackQuestion,
  FeedbackQuestionType,
  WidgetConfig,
  WidgetConfigPatch,
  WidgetShortcut,
} from '@/lib/widget-builder';
import {
  WidgetBuilderField,
  WidgetBuilderHint,
  WidgetBuilderInput,
  WidgetBuilderLabel,
  WidgetBuilderSections,
  WidgetBuilderSelect,
  WidgetBuilderSwitch,
  WidgetBuilderTogglePanel,
} from '../ui';

export type WidgetBuilderBehaviorStepProps = {
  cfg: WidgetConfig;
  onChange: (patch: WidgetConfigPatch) => void;
  soloChatOnly: boolean;
  shortcuts: WidgetShortcut[];
  onShortcutsChange: (updater: WidgetShortcut[] | ((prev: WidgetShortcut[]) => WidgetShortcut[])) => void;
  feedbackQuestions: FeedbackQuestion[];
  onFeedbackQuestionsChange: (
    updater: FeedbackQuestion[] | ((prev: FeedbackQuestion[]) => FeedbackQuestion[]),
  ) => void;
  suggestingShortcuts: boolean;
  shortcutSuggestErr: string;
  onSuggestShortcuts: () => void;
};

export function WidgetBuilderBehaviorStep({
  cfg,
  onChange,
  soloChatOnly,
  shortcuts,
  onShortcutsChange,
  feedbackQuestions,
  onFeedbackQuestionsChange,
  suggestingShortcuts,
  shortcutSuggestErr,
  onSuggestShortcuts,
}: WidgetBuilderBehaviorStepProps) {
  return (
    <WidgetBuilderSections>
      {soloChatOnly ? (
        <p style={{ fontSize: '13px', color: 'var(--muted-foreground)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Plan <strong>Solo</strong>: widget de chat básico. WhatsApp, escalación, voz y apertura automática están
          disponibles desde Basic.
        </p>
      ) : (
        <>
      <WidgetBuilderTogglePanel
        active={cfg.humanSupportEnabled}
        accentColor={cfg.color}
        title="📱 WhatsApp para atención humana"
        description={
          cfg.humanSupportEnabled
            ? 'El widget ofrece un enlace a WhatsApp cuando el visitante pide hablar con una persona.'
            : 'Desactivado: no se mostrarán enlaces a WhatsApp.'
        }
        onToggle={(humanSupportEnabled) => onChange({ humanSupportEnabled })}
        tourId="widget-builder-support"
      >
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-human-phone">📥 Número que RECIBE (operador / WhatsApp humano)</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-human-phone"
            value={cfg.humanSupportPhone ?? ''}
            onChange={(e) => onChange({ humanSupportPhone: e.target.value.slice(0, 48) })}
            placeholder="+57 313 3174629 (celular del operador, NO el de Meta)"
          />
          <WidgetBuilderHint>
            Alertas de handoff y enlace wa.me van a este número. El Business Meta que <strong>envía</strong> se
            configura en el agente → pestaña WhatsApp.
            <br />
            Se activa el enlace cuando el visitante escribe «persona», «humano», etc.
          </WidgetBuilderHint>
        </WidgetBuilderField>
      </WidgetBuilderTogglePanel>

      <WidgetBuilderTogglePanel
        active={cfg.handoffEnabled}
        accentColor={cfg.color}
        title="🙋 Botón «Hablar con una persona»"
        description={
          cfg.handoffEnabled
            ? 'El visitante puede solicitar atención humana. La solicitud entra al Inbox.'
            : 'Desactivado: el visitante no verá el botón de escalación.'
        }
        onToggle={(handoffEnabled) => onChange({ handoffEnabled })}
      >
        <div className="widget-builder-toggle-panel__body--grid-2">
          <WidgetBuilderField>
            <WidgetBuilderLabel htmlFor="wb-handoff-mode">Destino al escalar</WidgetBuilderLabel>
            <WidgetBuilderSelect
              id="wb-handoff-mode"
              value={cfg.handoffNotifyMode}
              onChange={(e) => onChange({ handoffNotifyMode: e.target.value as HandoffNotifyMode })}
            >
              {(Object.keys(HANDOFF_NOTIFY_MODE_LABELS) as HandoffNotifyMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {HANDOFF_NOTIFY_MODE_LABELS[mode]}
                </option>
              ))}
            </WidgetBuilderSelect>
            <WidgetBuilderHint>
              El <strong>Inbox</strong> siempre recibe la solicitud.{' '}
              <Link href="/dashboard/compliance" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                Configurar webhook/Slack
              </Link>
              .
            </WidgetBuilderHint>
          </WidgetBuilderField>
          <WidgetBuilderField>
            <WidgetBuilderLabel htmlFor="wb-handoff-timeout">Espera antes de ofrecer WhatsApp (min)</WidgetBuilderLabel>
            <WidgetBuilderInput
              id="wb-handoff-timeout"
              type="number"
              min={0}
              max={60}
              value={cfg.handoffTimeout}
              onChange={(e) => onChange({ handoffTimeout: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
            <WidgetBuilderHint>
              <strong>0</strong> = sin límite. Si el agente no responde en ese tiempo, se ofrece WhatsApp.
            </WidgetBuilderHint>
          </WidgetBuilderField>
        </div>
      </WidgetBuilderTogglePanel>

      <WidgetBuilderTogglePanel
        active={cfg.policyEnabled}
        accentColor={cfg.color}
        control="checkbox"
        checkboxId="policyEnabled"
        title="📄 Aviso de privacidad en el pie del chat"
        description={
          cfg.policyEnabled
            ? 'Texto + enlace opcional a tu política, visible bajo cada conversación.'
            : 'Desactivado: no se muestra ningún aviso en el chat.'
        }
        onToggle={(policyEnabled) => onChange({ policyEnabled })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <WidgetBuilderField>
              <WidgetBuilderLabel htmlFor="wb-policy-text">Texto del aviso</WidgetBuilderLabel>
              <WidgetBuilderInput
                id="wb-policy-text"
                value={cfg.policyText}
                maxLength={200}
                onChange={(e) => onChange({ policyText: e.target.value })}
                placeholder="Las conversaciones pueden registrarse de acuerdo con nuestra"
              />
            </WidgetBuilderField>
            <WidgetBuilderField>
              <WidgetBuilderLabel htmlFor="wb-policy-link-label">Texto del enlace</WidgetBuilderLabel>
              <WidgetBuilderInput
                id="wb-policy-link-label"
                value={cfg.policyLinkLabel}
                maxLength={60}
                onChange={(e) => onChange({ policyLinkLabel: e.target.value })}
                placeholder="Política de Privacidad"
              />
            </WidgetBuilderField>
          </div>
          <WidgetBuilderField>
            <WidgetBuilderLabel htmlFor="wb-policy-url">URL de tu política</WidgetBuilderLabel>
            <WidgetBuilderInput
              id="wb-policy-url"
              type="url"
              value={cfg.policyUrl}
              onChange={(e) => onChange({ policyUrl: e.target.value })}
              placeholder="https://tusitio.com/privacidad"
            />
            <WidgetBuilderHint>
              Debe empezar por <strong>https://</strong>. Si lo dejas vacío, el texto del enlace se muestra sin enlace.
            </WidgetBuilderHint>
          </WidgetBuilderField>
        </div>
      </WidgetBuilderTogglePanel>

      <WidgetBuilderTogglePanel
        active={cfg.feedbackEnabled}
        accentColor={cfg.color}
        control="checkbox"
        checkboxId="feedbackEnabled"
        title="⭐ Encuesta de satisfacción al cerrar el chat"
        description={
          cfg.feedbackEnabled
            ? 'Al final de cada conversación se muestra un breve formulario con tus preguntas.'
            : 'Desactivado: no se pide feedback al visitante.'
        }
        onToggle={(feedbackEnabled) => onChange({ feedbackEnabled })}
      >
        {feedbackQuestions.filter((q) => q.text.trim()).length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '8px 10px',
              marginBottom: 12,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <span style={{ fontSize: 13 }}>⚠️</span>
            <span style={{ fontSize: 11, color: '#dc2626', lineHeight: 1.45 }}>
              Agrega al menos una pregunta <strong>con texto</strong> para que la encuesta funcione. Sin preguntas, no
              se le mostrará nada al visitante.
            </span>
          </div>
        )}

        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-feedback-title">Título de la encuesta</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-feedback-title"
            value={cfg.feedbackTitle}
            onChange={(e) => onChange({ feedbackTitle: e.target.value })}
            placeholder="¿Cómo fue tu experiencia?"
          />
        </WidgetBuilderField>
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-feedback-thanks">Mensaje de agradecimiento</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-feedback-thanks"
            value={cfg.feedbackThanks}
            onChange={(e) => onChange({ feedbackThanks: e.target.value })}
            placeholder="¡Gracias por tu feedback!"
          />
        </WidgetBuilderField>
        <WidgetBuilderField>
          <WidgetBuilderLabel htmlFor="wb-idle-timeout">Finalizar conversación por inactividad (minutos)</WidgetBuilderLabel>
          <WidgetBuilderInput
            id="wb-idle-timeout"
            type="number"
            min={0}
            max={1440}
            value={cfg.conversationIdleTimeout}
            onChange={(e) =>
              onChange({ conversationIdleTimeout: Math.max(0, parseInt(e.target.value, 10) || 0) })
            }
          />
          <WidgetBuilderHint>
            Si el visitante reabre el chat tras este tiempo sin actividad, se da por finalizada y se le ofrece la
            encuesta antes de iniciar otra. <strong>0</strong> = desactivado.
          </WidgetBuilderHint>
        </WidgetBuilderField>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <WidgetBuilderLabel>Preguntas ({feedbackQuestions.length}/10)</WidgetBuilderLabel>
          {feedbackQuestions.length < 10 && (
            <button
              type="button"
              onClick={() =>
                onFeedbackQuestionsChange((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), text: '', type: 'rating', options: [], required: false, enabled: true },
                ])
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                cursor: 'pointer',
              }}
            >
              <Plus size={11} /> Agregar pregunta
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {feedbackQuestions.map((q, i) => (
            <div
              key={q.id}
              style={{
                padding: '10px',
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: 'var(--background)',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select
                  value={q.type}
                  onChange={(e) =>
                    onFeedbackQuestionsChange((p) =>
                      p.map((x, j) =>
                        j === i ? { ...x, type: e.target.value as FeedbackQuestionType } : x,
                      ),
                    )
                  }
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    fontSize: 12,
                    background: 'var(--card)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="rating">⭐ Estrellas (1-5)</option>
                  <option value="choice">☑ Opción múltiple</option>
                  <option value="yesno">Sí / No</option>
                  <option value="text">✍ Comentario libre</option>
                </select>
                <button
                  type="button"
                  onClick={() => onFeedbackQuestionsChange((p) => p.filter((_, j) => j !== i))}
                  style={{
                    marginLeft: 'auto',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#ef4444',
                    padding: 4,
                    display: 'flex',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <WidgetBuilderInput
                value={q.text}
                onChange={(e) =>
                  onFeedbackQuestionsChange((p) => p.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
                placeholder="Texto de la pregunta (ej. ¿Resolvimos tu duda?)"
              />
              {q.type === 'choice' && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <WidgetBuilderInput
                        value={opt}
                        onChange={(e) =>
                          onFeedbackQuestionsChange((p) =>
                            p.map((x, j) =>
                              j === i
                                ? { ...x, options: x.options.map((o, k) => (k === oi ? e.target.value : o)) }
                                : x,
                            ),
                          )
                        }
                        placeholder={`Opción ${oi + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onFeedbackQuestionsChange((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x,
                            ),
                          )
                        }
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'var(--muted-foreground)',
                          fontSize: 16,
                          lineHeight: 1,
                          padding: '0 4px',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {q.options.length < 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        onFeedbackQuestionsChange((p) =>
                          p.map((x, j) => (j === i ? { ...x, options: [...x.options, ''] } : x)),
                        )
                      }
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--primary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 0',
                      }}
                    >
                      + opción
                    </button>
                  )}
                </div>
              )}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    onFeedbackQuestionsChange((p) =>
                      p.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)),
                    )
                  }
                />
                Obligatoria
              </label>
            </div>
          ))}
          {feedbackQuestions.length === 0 && (
            <WidgetBuilderHint>
              Agrega preguntas para tu encuesta: estrellas (dan el score), opción múltiple, sí/no o comentario libre.
            </WidgetBuilderHint>
          )}
        </div>
      </WidgetBuilderTogglePanel>

      <div data-tour="widget-builder-embed-options">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="autoOpen"
              checked={cfg.autoOpen}
              onChange={(e) => onChange({ autoOpen: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="autoOpen" style={{ fontSize: '13px', cursor: 'pointer' }}>
              Abrir automáticamente
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <WidgetBuilderSwitch
              checked={cfg.fabDismissible}
              accentColor={cfg.color}
              onChange={(fabDismissible) => onChange({ fabDismissible })}
              ariaLabel="Mostrar botón X para ocultar launcher"
            />
            <label
              style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => onChange({ fabDismissible: !cfg.fabDismissible })}
            >
              Mostrar botón X para ocultar launcher
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <WidgetBuilderSwitch
              checked={cfg.voiceEnabled}
              accentColor={cfg.color}
              onChange={(voiceEnabled) => onChange({ voiceEnabled })}
              ariaLabel="Lectura en voz alta"
            />
            <label
              style={{ fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => onChange({ voiceEnabled: !cfg.voiceEnabled })}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: cfg.voiceEnabled ? 1 : 0.4 }}
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              Lectura en voz alta
            </label>
          </div>
        </div>

        <WidgetBuilderHint>
          El código embed solo contiene el token. El color, título, avatar y demás ajustes se cargan en tiempo real desde
          el servidor — cualquier cambio aquí se refleja automáticamente en todos los sitios donde esté instalado el
          widget.
        </WidgetBuilderHint>
      </div>
        </>
      )}

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!soloChatOnly && <Sparkles size={13} style={{ color: '#6366f1' }} />}
            <label
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: soloChatOnly ? 'var(--muted-foreground)' : '#6366f1',
              }}
            >
              Shortcuts del widget
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!soloChatOnly && (
              <button
              type="button"
              onClick={onSuggestShortcuts}
              disabled={suggestingShortcuts || !cfg.agentId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                background: cfg.agentId && !suggestingShortcuts ? 'rgba(99,102,241,0.1)' : 'var(--border)',
                color: cfg.agentId && !suggestingShortcuts ? '#6366f1' : 'var(--muted-foreground)',
                cursor: cfg.agentId && !suggestingShortcuts ? 'pointer' : 'not-allowed',
              }}
            >
              {suggestingShortcuts ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {suggestingShortcuts ? 'Generando...' : 'Sugerir con AI'}
            </button>
            )}
            <button
              type="button"
              onClick={() =>
                onShortcutsChange((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), label: '', message: '', emoji: '', enabled: true },
                ])
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                cursor: 'pointer',
              }}
            >
              <Plus size={11} /> Agregar
            </button>
          </div>
        </div>
        {shortcutSuggestErr && (
          <WidgetBuilderHint variant="error">{shortcutSuggestErr}</WidgetBuilderHint>
        )}
        {shortcuts.length === 0 ? (
          <WidgetBuilderHint>Sin shortcuts. Agrega acciones rápidas que aparecerán como pills en el chat.</WidgetBuilderHint>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shortcuts.map((sc, i) => (
              <div
                key={sc.id}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--background)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <WidgetBuilderInput
                    value={sc.emoji}
                    onChange={(e) =>
                      onShortcutsChange((p) => p.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))
                    }
                    placeholder="🚀"
                    style={{ width: 34, textAlign: 'center', flexShrink: 0 }}
                  />
                  <WidgetBuilderInput
                    value={sc.label}
                    onChange={(e) =>
                      onShortcutsChange((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Etiqueta"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => onShortcutsChange((p) => p.filter((_, j) => j !== i))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#ef4444',
                      padding: 4,
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <WidgetBuilderInput
                  value={sc.message}
                  onChange={(e) =>
                    onShortcutsChange((p) => p.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))
                  }
                  placeholder="Mensaje que se envía al hacer clic"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetBuilderSections>
  );
}
