import type { NoticeDecision } from '../domain/notices';

export type NoticeContext = {
  plan: string;
  /** Fin de la cortesía (solo para 'grace'). */
  graceEndsAt?: Date;
};

/** Envía los correos del ciclo de vida. No decide cuál: eso es del dominio. */
export interface ILifecycleNotifier {
  send(to: string, notice: NoticeDecision, ctx: NoticeContext): Promise<void>;
}
