'use client';

import { useCallback, useState } from 'react';
import {
  Check,
  Copy,
  Rocket,
  Save,
  ShieldCheck,
  Smartphone,
  Zap,
} from '@/components/ui/icons';
import { BRAND_NAME } from '@/lib/brand';

const INSTALL_STEPS = [
  'Copia el snippet de integración.',
  'Pégalo justo antes de la etiqueta de cierre </body> en tu HTML.',
  'Guarda y publica: el widget quedará activo con tu token.',
] as const;

const FEATURES = [
  {
    icon: Smartphone,
    title: 'Responsive',
    desc: 'Se adapta a móvil y escritorio.',
  },
  {
    icon: Zap,
    title: 'Carga async',
    desc: 'No bloquea la carga de tu sitio.',
  },
] as const;

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
  const [tokenCopied, setTokenCopied] = useState(false);

  const copyToken = useCallback(() => {
    if (snippetToken === 'YOUR_TOKEN') return;
    void navigator.clipboard.writeText(snippetToken).then(() => {
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 2000);
    });
  }, [snippetToken]);

  return (
    <div className="widget-builder-publish" data-tour="widget-builder-publish">
      <div className="widget-builder-publish__hero">
        <span className="widget-builder-publish__hero-icon" aria-hidden>
          <Rocket size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="widget-builder-publish__hero-eyebrow m-0">Listo para publicar</p>
          <p className="widget-builder-publish__hero-title m-0">
            Integra <strong>{displayName}</strong> con {BRAND_NAME}
          </p>
        </div>
      </div>

      <ol className="widget-builder-publish__steps">
        {INSTALL_STEPS.map((text, i) => (
          <li key={text}>
            <span className="widget-builder-publish__step-num" aria-hidden>
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="widget-builder-publish__editor" data-tour="widget-builder-copy">
        <div className="widget-builder-publish__editor-bar">
          <div className="widget-builder-publish__traffic" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <span className="widget-builder-publish__editor-label">embed.html</span>
          <button
            type="button"
            className="widget-builder-publish__copy-btn"
            onClick={onCopy}
            aria-label={copied ? 'Snippet copiado' : 'Copiar snippet de integración'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar snippet'}
          </button>
        </div>
        <pre className="widget-builder-publish__code">
          <code>{snippet}</code>
        </pre>
        {snippetToken !== 'YOUR_TOKEN' ? (
          <div className="widget-builder-publish__token-row">
            <ShieldCheck size={15} aria-hidden className="widget-builder-publish__token-icon" />
            <span className="widget-builder-publish__token-label">Token</span>
            <code className="widget-builder-publish__token-value">{snippetToken}</code>
            <button
              type="button"
              className="widget-builder-publish__token-copy"
              onClick={copyToken}
              aria-label={tokenCopied ? 'Token copiado' : 'Copiar token'}
            >
              {tokenCopied ? <Check size={13} /> : <Copy size={13} />}
              {tokenCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="widget-builder-publish__features">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="widget-builder-publish__feature">
            <span className="widget-builder-publish__feature-icon" aria-hidden>
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <div>
              <p className="widget-builder-publish__feature-title m-0">{title}</p>
              <p className="widget-builder-publish__feature-desc m-0">{desc}</p>
            </div>
          </div>
        ))}
      </div>

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
