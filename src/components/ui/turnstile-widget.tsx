'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { forwardRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

interface Props {
  onSuccess: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

/**
 * Renders a Cloudflare Turnstile widget only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured.
 * In dev (no key) → renders nothing and CAPTCHA is skipped transparently.
 */
export const TurnstileWidget = forwardRef<TurnstileInstance, Props>(
  ({ onSuccess, onExpire, onError }, ref) => {
    if (!SITE_KEY) return null;

    return (
      <Turnstile
        ref={ref}
        siteKey={SITE_KEY}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{ theme: 'light', size: 'compact' }}
      />
    );
  },
);

TurnstileWidget.displayName = 'TurnstileWidget';
