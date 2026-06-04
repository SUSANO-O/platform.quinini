import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function DashboardPageHeader({
  badge,
  badgeIcon: BadgeIcon,
  titleIcon: TitleIcon,
  title,
  titleAccent,
  description,
  actions,
}: {
  badge: string;
  badgeIcon?: LucideIcon;
  titleIcon?: LucideIcon;
  title: string;
  titleAccent?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const HeadingIcon = TitleIcon ?? BadgeIcon;

  return (
    <header className="dashboard-page-header">
      <div>
        <div className="badge-primary mb-3 w-fit">
          {BadgeIcon ? <BadgeIcon size={13} /> : null}
          {badge}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight m-0 flex items-center gap-2 flex-wrap">
          <span className="dashboard-page-header__icon" aria-hidden>
            {HeadingIcon ? <HeadingIcon size={22} strokeWidth={1.75} /> : null}
          </span>
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
          <p className="text-sm mt-2 m-0 text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
