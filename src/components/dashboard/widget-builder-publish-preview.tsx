'use client';

import { Bot } from 'lucide-react';

export function WidgetBuilderPublishPreview({
  color,
  welcome,
  title,
  avatarUrl,
}: {
  color: string;
  welcome: string;
  title: string;
  avatarUrl?: string | null;
}) {
  const displayTitle = title.trim() || 'Asistente';
  const message =
    welcome.trim() ||
    `¡Hola! Soy tu asistente ${displayTitle}. ¿En qué puedo ayudarte hoy?`;

  return (
    <div className="widget-builder-publish-preview" data-tour="widget-builder-preview">
      <div className="widget-builder-publish-preview__screen">
        <div className="widget-builder-publish-preview__notch" aria-hidden />
        <div className="widget-builder-publish-preview__hero" style={{ background: color }}>
          <div className="widget-builder-publish-preview__hero-shine" aria-hidden />
        </div>
        <div className="widget-builder-publish-preview__skeleton">
          <span style={{ width: '72%' }} />
          <span style={{ width: '88%' }} />
          <span style={{ width: '54%' }} />
          <span style={{ width: '64%' }} />
        </div>

        <div className="widget-builder-publish-preview__widget">
          <div className="widget-builder-publish-preview__bubble">
            <p className="m-0">{message}</p>
          </div>
          <button
            type="button"
            className="widget-builder-publish-preview__fab"
            style={{ background: color, boxShadow: `0 6px 20px ${color}55` }}
            aria-label={`Abrir chat ${displayTitle}`}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="widget-builder-publish-preview__fab-img" />
            ) : (
              <Bot size={22} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
