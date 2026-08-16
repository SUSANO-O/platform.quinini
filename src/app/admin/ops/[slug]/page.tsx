import { notFound } from 'next/navigation';
import { isAdminOpsLiveSlug } from '@/lib/admin-ops-live';
import { AdminOpsLivePanel } from '@/components/admin/admin-ops-live-panel';

export default async function AdminOpsLivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isAdminOpsLiveSlug(slug)) notFound();
  return <AdminOpsLivePanel />;
}
