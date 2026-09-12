import { sendSubscriptionEmail } from '@/lib/email';
import type { ILifecycleNotifier, NoticeContext } from '../ports/ILifecycleNotifier';
import type { NoticeDecision } from '../domain/notices';

/**
 * Traduce la decisión del dominio al correo correspondiente. El dominio decide
 * QUÉ avisar; acá solo se elige la plantilla y se pasan los datos.
 */
export const emailLifecycleNotifier: ILifecycleNotifier = {
  async send(to: string, notice: NoticeDecision, ctx: NoticeContext): Promise<void> {
    await sendSubscriptionEmail(to, notice.kind, ctx.plan, {
      graceEndsAt: ctx.graceEndsAt,
      daysLeft: notice.daysLeft,
      deletionAt: notice.deletionAtSec ? new Date(notice.deletionAtSec * 1000) : undefined,
    });
  },
};
