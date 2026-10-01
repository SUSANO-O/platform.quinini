/**
 * Post-procesa respuestas Math-ais (delegado al artefacto assist-agent-navigation).
 */
import {
  attachAssistNavigationToChat,
  buildAssistNavigationContext,
  resolveAssistAgentNavigation,
  assistNavigationContextFromChatBody,
  type AssistNavInferContext,
  type AssistNavOffer,
} from '@/lib/assist-agent-navigation';

import { finalizeWidgetNavReply } from '@/lib/widget-page-nav';

export type { AssistNavInferContext, AssistNavOffer };

export function finalizeAssistChatReply(
  rawReply: string,
  isAssist: boolean,
  navCtx?: AssistNavInferContext,
): { reply: string; navOffer?: AssistNavOffer } {
  if (!rawReply?.trim()) return { reply: rawReply };
  // Widgets de clientes: navegación genérica (solo rutas del mismo sitio, bloque assist-nav).
  if (!isAssist) return finalizeWidgetNavReply(rawReply) as { reply: string; navOffer?: AssistNavOffer };
  return resolveAssistAgentNavigation(rawReply, navCtx || {});
}

export function attachAssistNavToPayload<T extends Record<string, unknown>>(
  payload: T,
  isAssist: boolean,
  rawReply: string,
  navCtx?: AssistNavInferContext,
): T & { navOffer?: AssistNavOffer } {
  if (!isAssist) {
    if (!rawReply?.trim()) return payload;
    const nav = finalizeWidgetNavReply(rawReply);
    return {
      ...payload,
      reply: nav.reply,
      ...(nav.navOffer ? { navOffer: nav.navOffer as AssistNavOffer } : {}),
    };
  }
  return attachAssistNavigationToChat(
    payload,
    isAssist,
    rawReply,
    navCtx || {},
  );
}

export function assistNavFromReply(
  isAssist: boolean,
  rawReply: string,
  navCtx?: AssistNavInferContext,
) {
  return finalizeAssistChatReply(rawReply, isAssist, navCtx);
}

export const assistNavContextFromBody = assistNavigationContextFromChatBody;
export const buildAssistNavCtx = buildAssistNavigationContext;
