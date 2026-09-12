/**
 * Alcance del borrado de una cuenta: QUÉ se borra, QUÉ se conserva y CÓMO se
 * vincula cada dato a la cuenta. Declarativo y puro, para que se pueda revisar
 * a simple vista — esto decide qué información de un cliente desaparece.
 *
 * Regla de seguridad central: cada filtro se arma SOLO con valores únicos de
 * la cuenta (su id, los ids de sus agentes, los ids de sus widgets), validados
 * como ObjectId. Nunca con un valor que pueda compartir otro cliente. Hay
 * campos en esta base que a veces valen 'default' (ScheduledTask.userId,
 * Webhook*.tenantId): filtrar por ese VALOR borraría datos de otros. Como acá
 * el valor siempre es un id propio de la cuenta, un `$or` sobre todos los
 * campos de pertenencia nunca puede alcanzar a otra cuenta — y a la vez atrapa
 * los registros de la cuenta que quedaron guardados con un campo "raro".
 */

/** Campos por los que un registro se vincula a una cuenta. */
export type OwnershipField = 'userId' | 'agentId' | 'widgetId' | 'tenantId';

export type PurgeTarget = {
  /** Nombre lógico del modelo (el adaptador lo traduce al modelo real). */
  model: string;
  /** Campos de pertenencia que tiene; se combinan en un `$or`. */
  match: OwnershipField[];
};

/**
 * Datos hijos: se borran PRIMERO. Si el proceso se corta a mitad de camino,
 * los agentes y widgets todavía existen para volver a encontrarlos.
 */
export const PURGE_CHILDREN: readonly PurgeTarget[] = [
  { model: 'WidgetMessage',        match: ['userId', 'agentId', 'widgetId'] },
  { model: 'WidgetSessionContext', match: ['userId', 'widgetId'] },
  { model: 'ConversationSession',  match: ['userId', 'agentId', 'widgetId'] },
  { model: 'WidgetFeedback',       match: ['userId', 'agentId', 'widgetId'] },
  { model: 'WidgetShare',          match: ['userId', 'widgetId'] },
  { model: 'FlowConversation',     match: ['userId', 'widgetId'] },
  { model: 'ConversationFlow',     match: ['userId'] },
  { model: 'ScheduledTask',        match: ['userId', 'agentId', 'widgetId'] },
  { model: 'TaskExecution',        match: ['userId', 'agentId'] },
  { model: 'WebhookDelivery',      match: ['tenantId', 'agentId'] },
  { model: 'WebhookOutbox',        match: ['tenantId', 'agentId'] },
  { model: 'SheetSnapshot',        match: ['userId', 'agentId'] },
  { model: 'SheetSyncUsage',       match: ['userId'] },
  { model: 'RagBulkJob',           match: ['userId', 'agentId'] },
  { model: 'AbTest',               match: ['userId', 'agentId'] },
  { model: 'InferenceMetric',      match: ['userId', 'agentId', 'widgetId'] },
  { model: 'WidgetChatLatency',    match: ['userId', 'agentId', 'widgetId'] },
  { model: 'RequestLog',           match: ['userId', 'widgetId'] },
  { model: 'ConversationDailyLog', match: ['userId'] },
  { model: 'PlatformUsage',        match: ['userId'] },
  { model: 'ConversationPack',     match: ['userId'] },
];

/** Raíces: se borran AL FINAL, en este orden. El usuario va último de todo. */
export const PURGE_ROOTS: readonly PurgeTarget[] = [
  { model: 'Widget',       match: ['userId'] },
  { model: 'ClientAgent',  match: ['userId'] },
  { model: 'Subscription', match: ['userId'] },
];

/** Lo que NUNCA se borra, con el porqué. */
export const PRESERVED: readonly { model: string; reason: string }[] = [
  { model: 'ManualInvoice',    reason: 'Obligación tributaria de conservar la facturación.' },
  { model: 'AuditLog',         reason: 'Registro de auditoría.' },
  { model: 'SecurityLog',      reason: 'Registro de seguridad.' },
  { model: 'Referral',         reason: 'Involucra a otra cuenta y a sus recompensas.' },
  { model: 'RegistrationCode', reason: 'Códigos del sistema, creados por un admin.' },
  { model: 'Organization',     reason: 'Puede tener otros miembros: requiere revisión manual.' },
  { model: 'SkillCatalog',     reason: 'Catálogo global, no pertenece a una cuenta.' },
  { model: 'AccountLifecycleNotice',  reason: 'Prueba de que se avisó antes de borrar.' },
  { model: 'AccountDeletionRecord',   reason: 'Constancia del borrado.' },
  { model: 'AccountExportChunk',      reason: 'Respaldo previo al borrado; se autodestruye a los 30 días.' },
];

/** Ids que identifican lo que es de la cuenta. */
export type OwnedIds = {
  accountId: string;
  agentIds: string[];
  widgetIds: string[];
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** ¿Es un id propio (ObjectId), y no un valor compartido tipo 'default' o ''? */
export function isOwnId(v: unknown): v is string {
  return typeof v === 'string' && OBJECT_ID.test(v);
}

/**
 * Filtro de borrado para un modelo. `null` si no hay nada que filtrar — nunca
 * se devuelve un filtro vacío (`{}` borraría la colección entera).
 *
 * Lanza si algún id no es propio: preferible abortar el borrado de la cuenta
 * entera antes que ejecutar un filtro que pueda alcanzar datos de otro.
 */
export function buildOwnershipFilter(
  target: PurgeTarget,
  owned: OwnedIds,
): Record<string, unknown> | null {
  if (!isOwnId(owned.accountId)) throw new Error(`accountId inválido: ${String(owned.accountId)}`);
  for (const id of [...owned.agentIds, ...owned.widgetIds]) {
    if (!isOwnId(id)) throw new Error(`id de agente/widget inválido: ${String(id)}`);
  }

  const branches: Record<string, unknown>[] = [];
  for (const field of target.match) {
    if (field === 'userId' || field === 'tenantId') branches.push({ [field]: owned.accountId });
    else if (field === 'agentId' && owned.agentIds.length) branches.push({ agentId: { $in: owned.agentIds } });
    else if (field === 'widgetId' && owned.widgetIds.length) branches.push({ widgetId: { $in: owned.widgetIds } });
  }
  if (!branches.length) return null;
  return branches.length === 1 ? branches[0] : { $or: branches };
}
