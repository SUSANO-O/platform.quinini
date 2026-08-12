'use client';

import { Check, CheckCircle2, Code2, Copy, Save } from '@/components/ui/icons';
import { BRAND_NAME } from '@/lib/brand';

const PUBLISH_STEPS = ['Identidad', 'Apariencia', 'Comportamiento', 'Publicar'] as const;

export function WidgetBuilderPublishStep({
  widgetName,
  snippet,
  snippetToken,
  copied,
  saving,
  loadingInitial,
  editWidgetId,
  onCopy,
  onSave,
  onBack,
}: {
  widgetName: string;
  snippet: string;
  snippetToken: string;
  copied: boolean;
  saving: boolean;
  loadingInitial: boolean;
  editWidgetId: string | null;
  onCopy: () => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const displayName = widgetName.trim() || 'tu widget';

  return (
    <div className="widget-builder-publish" data-tour="widget-builder-publish">
      <div className="widget-builder-publish__stepper" aria-label="Progreso del asistente">
        {PUBLISH_STEPS.map((label, i) => {
          const done = i < 3;
          const active = i === 3;
          return (
            <div key={label} className="widget-builder-publish__stepper-item">
              <span
                className={`widget-builder-publish__stepper-dot${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
                aria-hidden
              >
                {done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {active ? (
                <span className="widget-builder-publish__stepper-label">Paso 4: {label}</span>
              ) : null}
              {i < PUBLISH_STEPS.length - 1 ? (
                <span className="widget-builder-publish__stepper-line" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>

      <h2 className="widget-builder-publish__title">Publicar widget</h2>
      <p className="widget-builder-publish__desc">
        Sigue estas instrucciones para integrar <strong>{displayName}</strong> en tu sitio web con{' '}
        {BRAND_NAME} de forma rápida y segura.
      </p>

      <div className="widget-builder-publish__install-card">
        <div className="widget-builder-publish__install-head">
          <span className="widget-builder-publish__install-icon" aria-hidden>
            <Code2 size={18} />
          </span>
          <div>
            <p className="widget-builder-publish__install-title m-0">Instrucciones de instalación</p>
            <p className="widget-builder-publish__install-text m-0">
              Copia el fragmento de código y pégalo justo antes de la etiqueta de cierre{' '}
              <code>&lt;/body&gt;</code> en el HTML de tu sitio.
            </p>
          </div>
        </div>

        <div className="widget-builder-publish__code-wrap">
          <button type="button" className="widget-builder-publish__copy-btn" onClick={onCopy} data-tour="widget-builder-copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <pre className="widget-builder-publish__code">
            <code>{snippet}</code>
          </pre>
          {snippetToken !== 'YOUR_TOKEN' ? (
            <p className="widget-builder-publish__token-hint m-0">
              Token: <code>{snippetToken}</code>
            </p>
          ) : null}
        </div>
      </div>

      <ul className="widget-builder-publish__checks">
        <li>
          <CheckCircle2 size={16} aria-hidden />
          Optimizado para dispositivos móviles
        </li>
        <li>
          <CheckCircle2 size={16} aria-hidden />
          Carga asíncrona (no afecta la velocidad del sitio)
        </li>
      </ul>

      <div className="widget-builder-publish__actions">
        <button
          type="button"
          className="widget-builder-btn-primary"
          onClick={onSave}
          disabled={saving || loadingInitial}
          data-tour="widget-builder-save"
        >
          <Save size={16} />
          {saving ? 'Guardando…' : editWidgetId ? 'Guardar y finalizar' : 'Guardar y finalizar widget'}
        </button>
        <button type="button" className="widget-builder-btn-secondary" onClick={onBack}>
          Volver
        </button>
      </div>
    </div>
  );
}
