'use client';

import type { CSSProperties, ReactNode } from 'react';

export function DashboardResourceCard({
  inactive,
  accentColor,
  avatar,
  statusLabel,
  statusOn = true,
  title,
  subtitle,
  subtitleTitle,
  tags,
  actions,
  headerAction,
  embed,
  className = '',
}: {
  inactive?: boolean;
  accentColor?: string;
  avatar: ReactNode;
  statusLabel: string;
  statusOn?: boolean;
  title: string;
  subtitle?: string;
  subtitleTitle?: string;
  tags?: ReactNode;
  actions: ReactNode;
  headerAction?: ReactNode;
  embed?: ReactNode;
  className?: string;
}) {
  const style = {
    ['--resource-accent' as string]: accentColor || 'var(--primary)',
  } as CSSProperties;

  return (
    <article
      className={[
        'resource-card',
        'card-texture',
        inactive ? 'resource-card--off' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div className="resource-card__accent" aria-hidden />

      <header className="resource-card__head">
        <div className="resource-card__topline">
          <div className="resource-card__identity">
            <div className="resource-card__avatar-slot">{avatar}</div>
            <div className="resource-card__status-row">
              <span className={`resource-card__dot${statusOn ? ' is-on' : ''}`} aria-hidden />
              <span className={`resource-card__status${statusOn ? ' is-on' : ''}`}>
                {statusLabel}
              </span>
            </div>
          </div>
          {headerAction ? <div className="resource-card__menu-wrap">{headerAction}</div> : null}
        </div>
        <p className="resource-card__title" title={title}>
          {title}
        </p>
        {subtitle ? (
          <p className="resource-card__subtitle" title={subtitleTitle || subtitle}>
            {subtitle}
          </p>
        ) : null}
      </header>

      {tags ? <div className="resource-card__tags">{tags}</div> : null}

      <footer className="resource-card__footer">{actions}</footer>

      {embed ? <div className="resource-card__embed">{embed}</div> : null}
    </article>
  );
}

export function ResourceCardTag({
  children,
  accent,
  title,
}: {
  children: ReactNode;
  accent?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`resource-card__tag${accent ? ' resource-card__tag--accent' : ''}`}
      title={title}
    >
      {children}
    </span>
  );
}
