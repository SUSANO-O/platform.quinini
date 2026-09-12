import { GRACE_PERIOD_DAYS } from '@/lib/subscription-access';
import { isPaidProductPlan } from '@/lib/plan-catalog';
import { resolveLifecycle } from '../domain/lifecycle';
import { decideDeletionWarning, decidePaymentNotice, type NoticeDecision, type NoticeKind } from '../domain/notices';
import type { ILifecycleSubscriptions } from '../ports/ILifecycleSubscriptions';
import type { ILifecycleNotifier } from '../ports/ILifecycleNotifier';
import type { INoticeLedger } from '../ports/INoticeLedger';
import type { IClock } from '../ports/IClock';

const DAY_SEC = 24 * 60 * 60;

export interface ProcessLifecycleNoticesDeps {
  subscriptions: ILifecycleSubscriptions;
  notifier: ILifecycleNotifier;
  ledger: INoticeLedger;
  clock: IClock;
  /** true = solo reporta qué avisaría, sin enviar ni marcar. */
  dryRun: boolean;
}

export interface ProcessLifecycleNoticesResult {
  ok: true;
  dryRun: boolean;
  checked: number;
  found: number;
  sent: number;
  failed: number;
  report: Array<{
    userId: string;
    email: string;
    kind: NoticeKind;
    plan: string;
    daysLeft?: number;
    deletionAt?: string;
    sent: boolean;
    error?: string;
  }>;
}

/**
 * Envía los avisos del ciclo de vida que correspondan hoy: cortesía,
 * suspensión y aviso semanal de borrado. Qué aviso corresponde lo decide el
 * dominio; acá solo se orquesta.
 *
 * Un fallo con una cuenta no corta el lote: se registra y se sigue con la
 * siguiente. Orden por cuenta: enviar → marcar → registrar. Si se cae entre
 * enviar y marcar, el aviso se repite al día siguiente — preferible a que se
 * pierda un aviso de borrado de datos.
 */
export async function processLifecycleNotices(
  deps: ProcessLifecycleNoticesDeps,
): Promise<ProcessLifecycleNoticesResult> {
  const { subscriptions, notifier, ledger, clock, dryRun } = deps;
  const nowMs = clock.now().getTime();
  const candidates = await subscriptions.listExpired(Math.floor(nowMs / 1000));

  const result: ProcessLifecycleNoticesResult = {
    ok: true, dryRun, checked: candidates.length, found: 0, sent: 0, failed: 0, report: [],
  };

  for (const c of candidates) {
    if (!isPaidProductPlan(c.plan)) continue;

    const lifecycle = resolveLifecycle(c, nowMs);
    const decisions = [
      decidePaymentNotice({ expiredAtSec: c.currentPeriodEnd, nowMs, alreadyMarks: c.reminderHistory }),
      decideDeletionWarning({ lifecycle, nowMs, alreadyMarks: c.reminderHistory }),
    ].filter((d): d is NoticeDecision => d !== null);

    for (const notice of decisions) {
      result.found += 1;
      const row: ProcessLifecycleNoticesResult['report'][number] = {
        userId: c.userId,
        email: c.email,
        kind: notice.kind,
        plan: c.plan,
        daysLeft: notice.daysLeft,
        deletionAt: notice.deletionAtSec ? new Date(notice.deletionAtSec * 1000).toISOString() : undefined,
        sent: false,
      };

      if (!dryRun) {
        try {
          await notifier.send(c.email, notice, {
            plan: c.plan,
            graceEndsAt: new Date((c.currentPeriodEnd + GRACE_PERIOD_DAYS * DAY_SEC) * 1000),
          });
          await subscriptions.recordNotice(c.subscriptionId, notice.mark);
          await ledger.append({
            userId: c.userId, email: c.email, kind: notice.kind, mark: notice.mark, sentAt: clock.now(),
          });
          row.sent = true;
          result.sent += 1;
        } catch (e) {
          row.error = e instanceof Error ? e.message : String(e);
          result.failed += 1;
        }
      }
      result.report.push(row);
    }
  }

  return result;
}
