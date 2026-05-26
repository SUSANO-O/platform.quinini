/**
 * Exportación y borrado de datos personales (RGPD — paquete cuenta landing).
 */

import { connectDB } from '@/lib/db/connection';
import {
  User,
  Subscription,
  Widget,
  RequestLog,
  ClientAgent,
  PlatformUsage,
  ConversationPack,
  AuditLog,
} from '@/lib/db/models';
import { exportWidgetConversations } from '@/lib/widget-conversation-export';
import { historyRetentionDays } from '@/lib/widget-memory-plan';
import { effectiveProductPlan } from '@/lib/plan-catalog';

/** Meses máximos de transcripciones en el paquete RGPD (alineado con /api/widgets/[id]/export). */
const GDPR_CONVERSATION_MONTHS_CAP = 12;
const GDPR_SESSIONS_PER_WIDGET = 200;

export async function buildPersonalDataExport(userId: string): Promise<Record<string, unknown>> {
  await connectDB();

  const user = await User.findById(userId).lean();
  if (!user) throw new Error('Usuario no encontrado.');

  const raw = user as Record<string, unknown>;
  const { passwordHash: _ph, ...rest } = raw;
  const safeUser = {
    ...rest,
    passwordHash: '[NO EXPORTADO — solo hash irreversible en servidor]',
  };

  const [
    subscription,
    widgets,
    agents,
    requestLogs,
    platformUsage,
    packs,
    auditTail,
  ] = await Promise.all([
    Subscription.findOne({ userId }).lean(),
    Widget.find({ userId }).select({ name: 1, agentId: 1, createdAt: 1 }).lean(),
    ClientAgent.find({ userId }).select({
      name: 1,
      description: 1,
      model: 1,
      status: 1,
      type: 1,
      agentHubId: 1,
      createdAt: 1,
      updatedAt: 1,
      ragEnabled: 1,
      isPlatform: 1,
    }).lean(),
    RequestLog.find({ userId }).sort({ month: -1 }).limit(500).lean(),
    PlatformUsage.find({ userId }).sort({ month: -1 }).limit(36).lean(),
    ConversationPack.find({ userId }).lean(),
    AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const sub = subscription as { plan?: string; status?: string } | null;
  const plan = effectiveProductPlan(sub?.plan ?? 'free', sub?.status ?? 'free');
  const retentionDays = historyRetentionDays(plan);
  const monthsFromRetention =
    retentionDays < 0 ? GDPR_CONVERSATION_MONTHS_CAP : Math.max(1, Math.ceil(retentionDays / 30));
  const exportMonths = Math.min(GDPR_CONVERSATION_MONTHS_CAP, monthsFromRetention);

  const widgetRows = widgets as { _id: unknown; name?: string; agentId?: string }[];
  const conversationExports = await Promise.all(
    widgetRows.map((w) =>
      exportWidgetConversations(String(w._id), {
        widgetName: w.name ?? '',
        agentId: typeof w.agentId === 'string' ? w.agentId : '',
        months: exportMonths,
        maxSessions: GDPR_SESSIONS_PER_WIDGET,
      }),
    ),
  );

  return {
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    subjectId: userId,
    user: safeUser,
    subscription,
    widgets,
    agents,
    usage: {
      requestLogs,
      platformUsage,
      conversationPacks: packs,
    },
    conversationExports,
    conversationExportMeta: {
      periodMonths: exportMonths,
      maxSessionsPerWidget: GDPR_SESSIONS_PER_WIDGET,
      plan,
      historyRetentionDays: retentionDays,
      note:
        'Transcripciones de chat del widget (mensajes usuario/asistente). ' +
        'Para exportar un solo widget en CSV de uso mensual: GET /api/widgets/{id}/export?format=csv.',
    },
    auditLogRecent: auditTail,
    notice:
      'Paquete RGPD: cuenta, widgets, agentes, uso y transcripciones de chat según retención de tu plan. ' +
      'Memoria vectorial/RAG en AIBackHub puede requerir solicitud adicional a soporte.',
  };
}

export async function deleteAllPersonalData(userId: string): Promise<{ deleted: string[] }> {
  await connectDB();

  const deleted: string[] = [];

  const r1 = await Widget.deleteMany({ userId });
  deleted.push(`widgets:${r1.deletedCount}`);
  const r2 = await ClientAgent.deleteMany({ userId });
  deleted.push(`clientAgents:${r2.deletedCount}`);
  const r3 = await RequestLog.deleteMany({ userId });
  deleted.push(`requestLogs:${r3.deletedCount}`);
  const r4 = await PlatformUsage.deleteMany({ userId });
  deleted.push(`platformUsage:${r4.deletedCount}`);
  const r5 = await ConversationPack.deleteMany({ userId });
  deleted.push(`conversationPacks:${r5.deletedCount}`);
  const r6 = await Subscription.deleteMany({ userId });
  deleted.push(`subscriptions:${r6.deletedCount}`);
  const r7 = await AuditLog.deleteMany({ userId });
  deleted.push(`auditLogs:${r7.deletedCount}`);

  await User.deleteOne({ _id: userId });
  deleted.push('user:1');

  return { deleted };
}
