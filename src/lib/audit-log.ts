/**
 * Registro de auditoría para acciones de cuenta (RGPD / trazabilidad).
 */

import { connectDB } from '@/lib/db/connection';
import { AuditLog } from '@/lib/db/models';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'gdpr.export'
  | 'gdpr.delete_completed'
  | 'saas_webhook.updated'
  | 'profile.updated'
  | string;

export async function recordAudit(params: {
  userId: string;
  action: AuditAction;
  resource?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await connectDB();
    await AuditLog.create({
      userId: params.userId,
      action: params.action,
      resource: params.resource ?? '',
      meta: params.meta ?? {},
      ip: params.ip ?? '',
    });
  } catch (e) {
    console.error('[audit-log] record failed:', e);
  }
}

export async function listAuditLogs(userId: string, limit = 50): Promise<
  Array<{
    id: string;
    action: string;
    resource: string;
    meta: Record<string, unknown>;
    ip: string;
    createdAt: string;
  }>
> {
  await connectDB();
  const rows = await AuditLog.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    action: r.action,
    resource: r.resource ?? '',
    meta: (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>,
    ip: r.ip ?? '',
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date().toISOString(),
  }));
}
