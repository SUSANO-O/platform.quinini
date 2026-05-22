import type { CSSProperties } from 'react';
import { userInitials } from '@/lib/user-profile';

type UserAvatarProps = {
  displayName?: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function UserAvatar({
  displayName,
  email,
  avatarUrl,
  size = 40,
  className = '',
  style,
}: UserAvatarProps) {
  const shared: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    ...style,
  };

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={className}
        style={{ ...shared, objectFit: 'cover', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        ...shared,
        background: 'rgba(var(--brand-warm-rgb), 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 36 ? 11 : 12,
        fontWeight: 700,
        color: '#1a1a1a',
        letterSpacing: '-0.02em',
      }}
      aria-hidden
    >
      {userInitials(displayName, email)}
    </div>
  );
}
