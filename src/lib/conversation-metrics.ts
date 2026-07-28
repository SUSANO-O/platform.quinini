/**
 * Métricas del dashboard alineadas con facturación (RequestLog):
 * - billableTurns: cada respuesta AI ≈ +1 en "Uso del mes" (716/45.000)
 * - sessionsStarted: chats nuevos (primer mensaje en el rango)
 */

import { WidgetMessage } from '@/lib/db/models';
import {
  COLOMBIA_OFFSET_MS,
  colombiaDateKey,
  colombiaHour,
  findPeakHour,
} from '@/lib/colombia-time';

const EXCLUDED_SESSION_PREFIXES = ['ho_', 'smoke_', 'img_test_', 'dbg-'] as const;

export function isExcludedConversationSessionId(sessionId: unknown): boolean {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return true;
  const sid = sessionId.trim();
  if (sid.startsWith('ho_')) return true;
  const lower = sid.toLowerCase();
  if (/verify_|curltest|_curl/i.test(sid)) return true;
  return EXCLUDED_SESSION_PREFIXES.some(
    (prefix) => prefix !== 'ho_' && lower.startsWith(prefix),
  );
}

function sessionIdMatch(userId: string) {
  return {
    userId,
    sessionId: { $type: 'string' as const, $ne: '', $not: /^ho_/ },
  };
}

/** Sesiones únicas cuyo primer mensaje cae dentro del rango [from, to?]. */
export async function countUserConversationsStartedInRange(
  userId: string,
  from: Date,
  to?: Date | null,
): Promise<number> {
  const firstAtFilter: Record<string, Date> = { $gte: from };
  if (to) firstAtFilter.$lte = to;

  const rows = await WidgetMessage.aggregate<{ _id: string; firstAt: Date }>([
    {
      $match: sessionIdMatch(userId),
    },
    {
      $group: {
        _id: '$sessionId',
        firstAt: { $min: '$createdAt' },
      },
    },
    { $match: { firstAt: firstAtFilter } },
  ]);

  return rows.filter((r) => !isExcludedConversationSessionId(r._id)).length;
}

/**
 * Turnos facturables en el rango — proxy de RequestLog: respuestas del agente AI
 * (no humano inbox). Coincide con lo que ves en "Uso del mes actual".
 */
export async function countUserBillableTurnsInRange(
  userId: string,
  from: Date,
  to?: Date | null,
): Promise<number> {
  const createdAt: Record<string, Date> = { $gte: from };
  if (to) createdAt.$lte = to;

  const rows = await WidgetMessage.find({
    ...sessionIdMatch(userId),
    role: 'assistant',
    sentBy: { $ne: 'human' },
    createdAt,
  })
    .select({ sessionId: 1 })
    .lean() as { sessionId?: string }[];

  return rows.filter((r) => !isExcludedConversationSessionId(r.sessionId)).length;
}

export type DailyActivityRow = { date: string; turns: number; sessions: number };

/** Mapas auxiliares para serie diaria (fallback cuando no hay ConversationDailyLog). */
export async function buildWidgetDailyMaps(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ turnsByDay: Map<string, number>; sessionsByDay: Map<string, number> }> {
  const createdAt = { $gte: from, $lte: to };

  const [turnRows, sessionRows] = await Promise.all([
    WidgetMessage.aggregate<{ _id: string; turns: number }>([
      {
        $match: {
          ...sessionIdMatch(userId),
          role: 'assistant',
          sentBy: { $ne: 'human' },
          createdAt,
        },
      },
      {
        $addFields: {
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $subtract: ['$createdAt', COLOMBIA_OFFSET_MS] },
            },
          },
        },
      },
      { $group: { _id: '$day', turns: { $sum: 1 } } },
    ]),
    WidgetMessage.aggregate<{ _id: string; firstAt: Date }>([
      { $match: sessionIdMatch(userId) },
      { $group: { _id: '$sessionId', firstAt: { $min: '$createdAt' } } },
      { $match: { firstAt: createdAt } },
    ]),
  ]);

  const turnsByDay = new Map<string, number>();
  for (const row of turnRows) turnsByDay.set(row._id, row.turns);

  const sessionsByDay = new Map<string, number>();
  for (const row of sessionRows) {
    if (isExcludedConversationSessionId(row._id)) continue;
    const key = colombiaDateKey(row.firstAt);
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
  }

  return { turnsByDay, sessionsByDay };
}

/** @deprecated Usar countUserDailyConversationSeries — mantiene compatibilidad interna. */
export async function countUserDailyActivityInRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<DailyActivityRow[]> {
  const { turnsByDay, sessionsByDay } = await buildWidgetDailyMaps(userId, from, to);
  const days: DailyActivityRow[] = [];
  const cursor = new Date(from.getTime() - COLOMBIA_OFFSET_MS);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to.getTime() - COLOMBIA_OFFSET_MS);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const key = colombiaDateKey(new Date(cursor.getTime() + COLOMBIA_OFFSET_MS));
    days.push({
      date: key,
      turns: turnsByDay.get(key) ?? 0,
      sessions: sessionsByDay.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Mensajes por hora (Colombia) — tráfico real, no solo inicio de sesión. */
export async function countUserHourlyTrafficInRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ hourBuckets: number[]; peakHour: number | null; totalMessages: number }> {
  const hourBuckets = new Array(24).fill(0) as number[];
  const createdAt = { $gte: from, $lte: to };

  const rows = await WidgetMessage.find({
    ...sessionIdMatch(userId),
    createdAt,
  })
    .select({ sessionId: 1, createdAt: 1 })
    .lean() as { sessionId?: string; createdAt?: Date }[];

  let totalMessages = 0;
  for (const row of rows) {
    if (isExcludedConversationSessionId(row.sessionId)) continue;
    const at = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string);
    if (isNaN(at.getTime())) continue;
    hourBuckets[colombiaHour(at)]++;
    totalMessages++;
  }

  return { hourBuckets, peakHour: findPeakHour(hourBuckets), totalMessages };
}
