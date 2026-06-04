'use client';

import { Check, Copy } from 'lucide-react';

export function WidgetEmbedPanel({
  snippet,
  token,
  copied,
  onCopySnippet,
}: {
  snippet: string;
  token?: string | null;
  copied: boolean;
  onCopySnippet: () => void;
}) {
  const showToken = Boolean(token?.startsWith('wt_'));

  return (
    <section className="dashboard-embed" aria-label="Código embed">
      <div className="dashboard-embed__toolbar">
        <div className="flex items-center gap-3 min-w-0">
          <div className="dashboard-embed__dots" aria-hidden>
            <span className="dashboard-embed__dot dashboard-embed__dot--red" />
            <span className="dashboard-embed__dot dashboard-embed__dot--yellow" />
            <span className="dashboard-embed__dot dashboard-embed__dot--green" />
          </div>
          <span className="dashboard-embed__label">Código embed</span>
        </div>
        <button
          type="button"
          className={`dashboard-embed__copy-btn${copied ? ' is-copied' : ''}`}
          onClick={onCopySnippet}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>

      {showToken && token ? (
        <div className="dashboard-embed__token">
          <span className="dashboard-embed__token-label">Token</span>
          <code className="dashboard-embed__token-code">{token}</code>
          <button
            type="button"
            className="dashboard-embed__token-copy"
            onClick={() => void navigator.clipboard.writeText(token)}
          >
            Copiar
          </button>
        </div>
      ) : null}

      <pre className="dashboard-embed__code">{snippet}</pre>
      <p className="dashboard-embed__hint m-0">
        Pega antes de &lt;/body&gt;. Los cambios del builder se propagan solos.
      </p>
    </section>
  );
}
