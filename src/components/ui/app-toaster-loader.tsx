'use client';

import dynamic from 'next/dynamic';

/** Wrapper cliente: `ssr: false` no está permitido en `layout.tsx` (Server Component). */
const AppToaster = dynamic(
  () => import('@/components/ui/app-toaster').then((m) => m.AppToaster),
  { ssr: false },
);

export function AppToasterLoader() {
  return <AppToaster />;
}
