import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { FlowConditionOperator, FlowNodeConfig, FlowNodeType } from '@/lib/flow-editor/types';
import type { FlowNodeData } from '@/lib/flow-editor/serialization';

type Props = {
  data: FlowNodeData;
  onChange: (patch: Partial<FlowNodeData>) => void;
};

const OPERATOR_LABELS: { value: FlowConditionOperator; label: string }[] = [
  { value: 'eq', label: 'Es igual a' },
  { value: 'neq', label: 'No es igual a' },
  { value: 'gt', label: 'Mayor que' },
  { value: 'lt', label: 'Menor que' },
  { value: 'contains', label: 'Contiene' },
  { value: 'empty', label: 'Está vacío' },
  { value: 'not_empty', label: 'No está vacío' },
];

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flow-editor-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="flow-editor-field__hint">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flow-editor-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function questionLabel(type: FlowNodeType): string {
  if (type === 'end') return 'Mensaje de cierre';
  if (type === 'condition') return 'Descripción (solo editor)';
  if (type === 'message') return 'Mensaje del bot';
  if (type === 'delay') return 'Mensaje mientras espera';
  if (type === 'set_variable') return 'Nota (solo editor)';
  if (type === 'goto') return 'Nota (solo editor)';
  if (type === 'random') return 'Descripción (solo editor)';
  if (type === 'calendar_booking' || type === 'calendly_booking') return 'Mensaje al usuario';
  return 'Pregunta / mensaje';
}

export function FlowNodePropsPanel({ data, onChange }: Props) {
  const type = data.flowType;
  const config = data.config ?? {};

  const patchConfig = (partial: Partial<FlowNodeConfig>) => {
    onChange({ config: { ...config, ...partial } });
  };

  const updateOptions = (options: NonNullable<FlowNodeData['options']>) => {
    onChange({ options });
  };

  const needsValue =
    config.operator !== 'empty' && config.operator !== 'not_empty';

  return (
    <div className="flow-editor-props-body">
      <Field label={questionLabel(type)} htmlFor="flow-node-question">
        <textarea
          id="flow-node-question"
          value={data.question ?? ''}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="Escribe el mensaje que verá el usuario…"
        />
      </Field>

      {/* ── Texto / email / teléfono / número ─────────────────────────── */}
      {(type === 'text' || type === 'email' || type === 'phone' || type === 'number') && (
        <>
          <Field label="Placeholder" htmlFor="flow-cfg-placeholder" hint="Texto gris en el campo de entrada.">
            <input
              id="flow-cfg-placeholder"
              value={config.placeholder ?? ''}
              onChange={(e) => patchConfig({ placeholder: e.target.value })}
              placeholder="Ej. Escribe aquí…"
            />
          </Field>
          <Field label="Texto de ayuda" htmlFor="flow-cfg-help" hint="Se muestra debajo de la pregunta.">
            <input
              id="flow-cfg-help"
              value={config.helpText ?? ''}
              onChange={(e) => patchConfig({ helpText: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <Field
            label="Clave de variable"
            htmlFor="flow-cfg-var"
            hint="Nombre interno para usar en condiciones (ej. email, presupuesto)."
          >
            <input
              id="flow-cfg-var"
              value={config.variableKey ?? ''}
              onChange={(e) => patchConfig({ variableKey: e.target.value.replace(/\s+/g, '_') })}
              placeholder={type}
            />
          </Field>
          <Toggle
            id="flow-cfg-required"
            label="Campo obligatorio"
            checked={config.required !== false}
            onChange={(v) => patchConfig({ required: v })}
          />
        </>
      )}

      {type === 'text' && (
        <div className="flow-editor-field-grid">
          <Field label="Mín. caracteres" htmlFor="flow-cfg-minlen">
            <input
              id="flow-cfg-minlen"
              type="number"
              min={0}
              value={config.minLength ?? ''}
              onChange={(e) =>
                patchConfig({
                  minLength: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Máx. caracteres" htmlFor="flow-cfg-maxlen">
            <input
              id="flow-cfg-maxlen"
              type="number"
              min={1}
              value={config.maxLength ?? ''}
              onChange={(e) =>
                patchConfig({
                  maxLength: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      )}

      {type === 'number' && (
        <div className="flow-editor-field-grid">
          <Field label="Mínimo" htmlFor="flow-cfg-min">
            <input
              id="flow-cfg-min"
              type="number"
              value={config.min ?? ''}
              onChange={(e) =>
                patchConfig({ min: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Máximo" htmlFor="flow-cfg-max">
            <input
              id="flow-cfg-max"
              type="number"
              value={config.max ?? ''}
              onChange={(e) =>
                patchConfig({ max: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Paso" htmlFor="flow-cfg-step">
            <input
              id="flow-cfg-step"
              type="number"
              step="any"
              value={config.step ?? ''}
              onChange={(e) =>
                patchConfig({ step: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
        </div>
      )}

      {/* ── Opción múltiple ───────────────────────────────────────────── */}
      {type === 'multiple_choice' && (
        <>
          <Field
            label="Clave de variable"
            htmlFor="flow-cfg-choice-var"
            hint="Para ramificar luego con un nodo Condición."
          >
            <input
              id="flow-cfg-choice-var"
              value={config.variableKey ?? ''}
              onChange={(e) => patchConfig({ variableKey: e.target.value.replace(/\s+/g, '_') })}
              placeholder="choice"
            />
          </Field>
          <Toggle
            id="flow-cfg-required-choice"
            label="Respuesta obligatoria"
            checked={config.required !== false}
            onChange={(v) => patchConfig({ required: v })}
          />
          <Toggle
            id="flow-cfg-random"
            label="Mezclar orden de opciones"
            checked={Boolean(config.randomizeOptions)}
            onChange={(v) => patchConfig({ randomizeOptions: v })}
          />
          <div className="flow-editor-field">
            <div className="flow-editor-field__row">
              <label>Opciones</label>
              <button
                type="button"
                className="flow-editor-chip-btn"
                onClick={() => {
                  const opts = [...(data.options ?? [])];
                  const n = opts.length + 1;
                  opts.push({ label: `Opción ${n}`, value: `opt_${n}` });
                  updateOptions(opts);
                }}
              >
                <Plus size={13} strokeWidth={2} aria-hidden />
                Añadir
              </button>
            </div>
            <div className="flow-editor-options-list">
              {(data.options ?? []).map((opt, idx) => (
                <div key={`${opt.value}-${idx}`} className="flow-editor-option-row flow-editor-option-row--dual">
                  <input
                    aria-label={`Etiqueta opción ${idx + 1}`}
                    value={opt.label}
                    onChange={(e) => {
                      const opts = [...(data.options ?? [])];
                      const label = e.target.value;
                      opts[idx] = {
                        label,
                        value: opts[idx].value || label.trim().toLowerCase().replace(/\s+/g, '_') || `opt_${idx + 1}`,
                      };
                      updateOptions(opts);
                    }}
                    placeholder="Etiqueta visible"
                  />
                  <input
                    aria-label={`Valor opción ${idx + 1}`}
                    value={opt.value}
                    onChange={(e) => {
                      const opts = [...(data.options ?? [])];
                      opts[idx] = { ...opts[idx], value: e.target.value };
                      updateOptions(opts);
                    }}
                    placeholder="Valor"
                  />
                  <button
                    type="button"
                    className="flow-editor-icon-btn"
                    aria-label={`Eliminar opción ${idx + 1}`}
                    onClick={() => {
                      updateOptions((data.options ?? []).filter((_, i) => i !== idx));
                    }}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {(data.options ?? []).length === 0 && (
                <p className="flow-editor-options-empty">Añade al menos una opción.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Condición ─────────────────────────────────────────────────── */}
      {type === 'condition' && (
        <>
          <Field
            label="Variable a evaluar"
            htmlFor="flow-cfg-src"
            hint="Debe coincidir con la clave de un paso anterior."
          >
            <input
              id="flow-cfg-src"
              value={config.sourceVariable ?? ''}
              onChange={(e) => patchConfig({ sourceVariable: e.target.value.replace(/\s+/g, '_') })}
              placeholder="email, choice, presupuesto…"
            />
          </Field>
          <Field label="Operador" htmlFor="flow-cfg-op">
            <select
              id="flow-cfg-op"
              value={config.operator ?? 'eq'}
              onChange={(e) => patchConfig({ operator: e.target.value as FlowConditionOperator })}
            >
              {OPERATOR_LABELS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </Field>
          {needsValue && (
            <Field label="Valor de comparación" htmlFor="flow-cfg-cmp">
              <input
                id="flow-cfg-cmp"
                value={config.compareValue ?? ''}
                onChange={(e) => patchConfig({ compareValue: e.target.value })}
                placeholder="Valor esperado"
              />
            </Field>
          )}
          <p className="flow-editor-field__hint">
            Conecta las salidas <strong>Sí</strong> y <strong>No</strong> del nodo a los siguientes pasos.
          </p>
        </>
      )}

      {/* ── Mensaje ───────────────────────────────────────────────────── */}
      {type === 'message' && (
        <>
          <Field label="Texto de ayuda extra" htmlFor="flow-cfg-msg-help">
            <input
              id="flow-cfg-msg-help"
              value={config.helpText ?? ''}
              onChange={(e) => patchConfig({ helpText: e.target.value })}
              placeholder="Opcional"
            />
          </Field>
          <Toggle
            id="flow-cfg-msg-auto"
            label="Continuar automáticamente"
            checked={Boolean(config.autoContinue)}
            onChange={(v) => patchConfig({ autoContinue: v })}
          />
          {!config.autoContinue && (
            <Field label="Texto del botón" htmlFor="flow-cfg-msg-btn">
              <input
                id="flow-cfg-msg-btn"
                value={config.buttonLabel ?? ''}
                onChange={(e) => patchConfig({ buttonLabel: e.target.value })}
                placeholder="Continuar"
              />
            </Field>
          )}
          {config.autoContinue && (
            <Field label="Espera antes de continuar (ms)" htmlFor="flow-cfg-msg-delay">
              <input
                id="flow-cfg-msg-delay"
                type="number"
                min={0}
                step={100}
                value={config.delayMs ?? 800}
                onChange={(e) =>
                  patchConfig({
                    delayMs: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
            </Field>
          )}
        </>
      )}

      {/* ── Espera ────────────────────────────────────────────────────── */}
      {type === 'delay' && (
        <>
          <Field
            label="Duración (ms)"
            htmlFor="flow-cfg-delay"
            hint="1000 = 1 segundo. Muestra el mensaje y espera."
          >
            <input
              id="flow-cfg-delay"
              type="number"
              min={0}
              step={100}
              value={config.delayMs ?? 1500}
              onChange={(e) =>
                patchConfig({
                  delayMs: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        </>
      )}

      {/* ── Variable ──────────────────────────────────────────────────── */}
      {type === 'set_variable' && (
        <>
          <Field label="Clave de variable" htmlFor="flow-cfg-set-key" hint="Se guarda sin preguntar al usuario.">
            <input
              id="flow-cfg-set-key"
              value={config.variableKey ?? ''}
              onChange={(e) => patchConfig({ variableKey: e.target.value.replace(/\s+/g, '_') })}
              placeholder="estado"
            />
          </Field>
          <Field label="Valor" htmlFor="flow-cfg-set-val">
            <input
              id="flow-cfg-set-val"
              value={config.setValue ?? ''}
              onChange={(e) => patchConfig({ setValue: e.target.value })}
              placeholder="activo"
            />
          </Field>
          <p className="flow-editor-field__hint">
            Útil para marcar etapas y luego ramificar con Condición.
          </p>
        </>
      )}

      {/* ── Saltar ────────────────────────────────────────────────────── */}
      {type === 'goto' && (
        <>
          <Field
            label="ID del nodo destino"
            htmlFor="flow-cfg-goto"
            hint="Déjalo vacío para reiniciar desde Inicio. Copia el id del nodo en el lienzo."
          >
            <input
              id="flow-cfg-goto"
              value={config.targetNodeId ?? ''}
              onChange={(e) => patchConfig({ targetNodeId: e.target.value.trim() })}
              placeholder="start o node_…"
            />
          </Field>
        </>
      )}

      {/* ── Aleatorio ─────────────────────────────────────────────────── */}
      {type === 'random' && (
        <>
          <Field label="Clave de variable" htmlFor="flow-cfg-rand-var">
            <input
              id="flow-cfg-rand-var"
              value={config.variableKey ?? ''}
              onChange={(e) => patchConfig({ variableKey: e.target.value.replace(/\s+/g, '_') })}
              placeholder="random_path"
            />
          </Field>
          <div className="flow-editor-field">
            <div className="flow-editor-field__row">
              <label>Rutas posibles</label>
              <button
                type="button"
                className="flow-editor-chip-btn"
                onClick={() => {
                  const opts = [...(data.options ?? [])];
                  const n = opts.length + 1;
                  opts.push({ label: `Ruta ${String.fromCharCode(64 + n)}`, value: `path_${n}` });
                  updateOptions(opts);
                }}
              >
                <Plus size={13} strokeWidth={2} aria-hidden />
                Añadir
              </button>
            </div>
            <div className="flow-editor-options-list">
              {(data.options ?? []).map((opt, idx) => (
                <div key={`${opt.value}-${idx}`} className="flow-editor-option-row flow-editor-option-row--dual">
                  <input
                    aria-label={`Etiqueta ruta ${idx + 1}`}
                    value={opt.label}
                    onChange={(e) => {
                      const opts = [...(data.options ?? [])];
                      opts[idx] = { ...opts[idx], label: e.target.value };
                      updateOptions(opts);
                    }}
                    placeholder="Etiqueta"
                  />
                  <input
                    aria-label={`Valor ruta ${idx + 1}`}
                    value={opt.value}
                    onChange={(e) => {
                      const opts = [...(data.options ?? [])];
                      opts[idx] = { ...opts[idx], value: e.target.value };
                      updateOptions(opts);
                    }}
                    placeholder="Valor"
                  />
                  <button
                    type="button"
                    className="flow-editor-icon-btn"
                    aria-label={`Eliminar ruta ${idx + 1}`}
                    onClick={() => updateOptions((data.options ?? []).filter((_, i) => i !== idx))}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            <p className="flow-editor-field__hint">
              El widget elige una ruta al azar y sigue por esa salida.
            </p>
          </div>
        </>
      )}

      {/* ── Fin ───────────────────────────────────────────────────────── */}
      {type === 'end' && (
        <>
          <Field label="Texto del botón" htmlFor="flow-cfg-end-btn">
            <input
              id="flow-cfg-end-btn"
              value={config.buttonLabel ?? ''}
              onChange={(e) => patchConfig({ buttonLabel: e.target.value })}
              placeholder="Cerrar"
            />
          </Field>
          <Field
            label="URL de redirección"
            htmlFor="flow-cfg-redirect"
            hint="Opcional. Tras completar, abre esta URL."
          >
            <input
              id="flow-cfg-redirect"
              type="url"
              value={config.redirectUrl ?? ''}
              onChange={(e) => patchConfig({ redirectUrl: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        </>
      )}

      {/* ── Calendario / Calendly ──────────────────────────────────────── */}
      {(type === 'calendar_booking' || type === 'calendly_booking') && (
        <>
          <Field
            label={type === 'calendly_booking' ? 'URL de Calendly' : 'URL de reserva'}
            htmlFor="flow-cfg-booking"
            hint={
              type === 'calendly_booking'
                ? 'Ej. https://calendly.com/tu-usuario/30min'
                : 'Enlace a tu agenda BotIvA u otra URL de reserva.'
            }
          >
            <input
              id="flow-cfg-booking"
              type="url"
              value={config.bookingUrl ?? ''}
              onChange={(e) => patchConfig({ bookingUrl: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label="Texto del botón" htmlFor="flow-cfg-book-btn">
            <input
              id="flow-cfg-book-btn"
              value={config.buttonLabel ?? ''}
              onChange={(e) => patchConfig({ buttonLabel: e.target.value })}
              placeholder={type === 'calendly_booking' ? 'Abrir Calendly' : 'Reservar cita'}
            />
          </Field>
          {type === 'calendar_booking' && (
            <div className="flow-editor-field-grid">
              <Field label="Duración (min)" htmlFor="flow-cfg-dur">
                <input
                  id="flow-cfg-dur"
                  type="number"
                  min={5}
                  step={5}
                  value={config.durationMinutes ?? ''}
                  onChange={(e) =>
                    patchConfig({
                      durationMinutes: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Zona horaria" htmlFor="flow-cfg-tz">
                <input
                  id="flow-cfg-tz"
                  value={config.timezone ?? ''}
                  onChange={(e) => patchConfig({ timezone: e.target.value })}
                  placeholder="Europe/Madrid"
                />
              </Field>
            </div>
          )}
          <Field label="Clave de variable" htmlFor="flow-cfg-book-var">
            <input
              id="flow-cfg-book-var"
              value={config.variableKey ?? ''}
              onChange={(e) => patchConfig({ variableKey: e.target.value.replace(/\s+/g, '_') })}
              placeholder={type === 'calendly_booking' ? 'calendly' : 'booking'}
            />
          </Field>
          <Toggle
            id="flow-cfg-book-req"
            label="Reserva obligatoria para continuar"
            checked={config.required !== false}
            onChange={(v) => patchConfig({ required: v })}
          />
        </>
      )}
    </div>
  );
}
