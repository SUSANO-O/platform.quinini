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
    Widget.find({ userId }).lean(),
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

  return {
    exportVersion: 1,
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
    auditLogRecent: auditTail,
    notice:
      'Este archivo contiene los datos de cuenta almacenados en MatIAs Landing. ' +
      'Los datos en AgentFlowhub/AIBackHub (motor de IA) pueden requerir borrado adicional por soporte si aplica.',
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
