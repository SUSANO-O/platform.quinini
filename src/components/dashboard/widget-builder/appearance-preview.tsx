'use client';

import type { CSSProperties } from 'react';
import { ImageIcon, Mic, Paperclip, Volume2, X } from 'lucide-react';
import { initialsFromName } from '@/lib/flow-editor/geometry';
import type { WidgetConfig } from '@/lib/widget-builder';
import { BorderBeamField } from '@/components/ui/border-beam-field';
import { widgetPositionLabel } from './ui';

type PreviewCfg = Pick<
  WidgetConfig,
  | 'color'
  | 'theme'
  | 'title'
  | 'subtitle'
  | 'welcome'
  | 'fabHint'
  | 'avatar'
  | 'fabAvatarSize'
  | 'borderRadius'
  | 'position'
  | 'imageUploadEnabled'
  | 'micEnabled'
  | 'voiceEnabled'
  | 'fabDismissible'
  | 'policyEnabled'
  | 'policyLinkLabel'
>;

function parseRadiusPx(value: string): number {
  const n = Number.parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? Math.min(32, Math.max(0, n)) : 16;
}

function fabSizePx(cfg: PreviewCfg): number {
  const hasAvatar = Boolean(cfg.avatar?.trim());
  if (!hasAvatar) return 56;
  return Math.min(120, Math.max(56, cfg.fabAvatarSize || 86));
}

const POSITION_STYLE: Record<string, CSSProperties> = {
  'top-left': { top: '10%', left: '8%' },
  'top-center': { top: '10%', left: '50%', transform: 'translateX(-50%)' },
  'top-right': { top: '10%', right: '8%' },
  'center-left': { top: '50%', left: '8%', transform: 'translateY(-50%)' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'center-right': { top: '50%', right: '8%', transform: 'translateY(-50%)' },
  'bottom-left': { bottom: '12%', left: '8%' },
  'bottom-center': { bottom: '12%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right': { bottom: '12%', right: '8%' },
};

export function WidgetBuilderAppearancePreview({ cfg }: { cfg: PreviewCfg }) {
  const dark = cfg.theme === 'dark';
  const radius = parseRadiusPx(cfg.borderRadius);
  const fabPx = Math.round(fabSizePx(cfg) * 0.42);
  const initials = initialsFromName(cfg.title || 'Bot');
  const posStyle = POSITION_STYLE[cfg.position] ?? POSITION_STYLE['bottom-right'];
  const hasAvatar = Boolean(cfg.avatar?.trim());

  return (
    <div className="wb-preview">
      <div className="wb-preview__head">
        <p className="wb-preview__title">Vista previa en vivo</p>
        <p className="wb-preview__meta">{widgetPositionLabel(cfg.position)}</p>
      </div>

      <div className={`wb-preview__device${dark ? ' is-dark' : ''}`} data-theme={cfg.theme}>
        <div className="wb-preview__page">
          <span className="wb-preview__page-bar" />
          <span className="wb-preview__page-block" />
          <span className="wb-preview__page-block wb-preview__page-block--sm" />
        </div>

        <div
          className="wb-preview__chat"
          style={{
            borderRadius: `${Math.max(8, radius)}px`,
            ['--wb-accent' as string]: cfg.color,
          }}
        >
          <header className="wb-preview__chat-header" style={{ background: cfg.color }}>
            <div className="wb-preview__chat-header-main">
              {hasAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cfg.avatar} alt="" className="wb-preview__chat-avatar-img" />
              ) : (
                <span className="wb-preview__chat-avatar">{initials}</span>
              )}
              <div className="min-w-0">
                <p className="wb-preview__chat-title">{cfg.title || 'Asistente'}</p>
                <p className="wb-preview__chat-subtitle">{cfg.subtitle || 'En línea'}</p>
              </div>
            </div>
            <div className="wb-preview__chat-actions">
              {cfg.voiceEnabled ? (
                <span className="wb-preview__icon-btn" aria-hidden>
                  <Volume2 size={11} />
                </span>
              ) : null}
              <span className="wb-preview__icon-btn" aria-hidden>
                <X size={11} />
              </span>
            </div>
          </header>

          <div className="wb-preview__chat-body">
            <div className="wb-preview__bubble wb-preview__bubble--bot">{cfg.welcome || '¡Hola!'}</div>
            <div className="wb-preview__bubble wb-preview__bubble--user">Quiero más información</div>
          </div>

          <BorderBeamField
            radius={18}
            theme={cfg.theme === 'dark' ? 'dark' : 'light'}
            className="wb-preview__composer-beam"
          >
            <footer className="wb-preview__composer" style={{ borderRadius: 18 }}>
              {cfg.imageUploadEnabled ? (
                <span className="wb-preview__composer-icon" aria-hidden>
                  <Paperclip size={12} />
                </span>
              ) : null}
              <span className="wb-preview__composer-input">Escribe un mensaje…</span>
              {cfg.micEnabled ? (
                <span className="wb-preview__composer-icon" aria-hidden>
                  <Mic size={12} />
                </span>
              ) : null}
              <span className="wb-preview__composer-send" style={{ background: cfg.color }} aria-hidden>
                →
              </span>
            </footer>
          </BorderBeamField>

          {cfg.policyEnabled !== false ? (
            <p className="wb-preview__policy">
              {cfg.policyLinkLabel || 'Política de Privacidad'}
            </p>
          ) : null}
        </div>

        <div className="wb-preview__launcher" style={posStyle}>
          {cfg.fabHint ? <p className="wb-preview__fab-hint">{cfg.fabHint}</p> : null}
          <div className="wb-preview__fab-wrap">
            {cfg.fabDismissible ? (
              <span className="wb-preview__fab-dismiss" aria-hidden>
                <X size={8} />
              </span>
            ) : null}
            <button
              type="button"
              className={`wb-preview__fab${hasAvatar ? ' has-avatar' : ''}`}
              style={{
                width: fabPx,
                height: fabPx,
                background: hasAvatar ? 'transparent' : cfg.color,
              }}
              aria-hidden
            >
              {hasAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cfg.avatar} alt="" className="wb-preview__fab-img" />
              ) : (
                <span className="wb-preview__fab-orb" />
              )}
            </button>
          </div>
        </div>
      </div>

      <ul className="wb-preview__legend">
        <li>
          <ImageIcon size={11} aria-hidden />
          Barra según toggles de input
        </li>
      </ul>
    </div>
  );
}
