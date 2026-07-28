import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { FlowsBetaBadge } from '@/components/flows/flows-beta-badge';

export function DashboardPageHeader({
  badge,
  badgeIcon: BadgeIcon,
  titleIcon: TitleIcon,
  title,
  titleAccent,
  description,
  actions,
  beta,
  compact,
  hideIcon,
}: {
  badge: string;
  badgeIcon?: LucideIcon;
  titleIcon?: LucideIcon;
  title: string;
  titleAccent?: string;
  description?: string;
  actions?: ReactNode;
  beta?: boolean;
  /** Menos margen y tipografía más compacta (listas, inbox, chats). */
  compact?: boolean;
  /** Oculta el icono grande del título — look más minimal. */
  hideIcon?: boolean;
}) {
  const HeadingIcon = TitleIcon ?? BadgeIcon;
  const showIcon = !hideIcon && HeadingIcon;

  return (
    <header className={`dashboard-page-header${compact ? ' dashboard-page-header--compact' : ''}`}>
      <div>
        <div className="badge-primary mb-2 w-fit">
          {BadgeIcon ? <BadgeIcon size={13} /> : null}
          {badge}
          {beta ? <FlowsBetaBadge style={{ marginLeft: 4 }} /> : null}
        </div>
        <h1 className={`dashboard-page-header__title m-0${showIcon ? ' dashboard-page-header__title--with-icon' : ''}`}>
          {showIcon ? (
            <span className="dashboard-page-header__icon" aria-hidden>
              <HeadingIcon size={20} strokeWidth={1.75} />
            </span>
          ) : null}
          <span>
            {title}
            {titleAccent ? (
              <>
                {' '}
                <span className="gradient-text">{titleAccent}</span>
              </>
            ) : null}
          </span>
        </h1>
        {description ? (
          <p className="dashboard-page-header__desc m-0">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="dashboard-page-header__actions shrink-0">{actions}</div> : null}
    </header>
  );
}
