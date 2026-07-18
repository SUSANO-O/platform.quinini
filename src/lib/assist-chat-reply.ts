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

export type { AssistNavInferContext, AssistNavOffer };

export function finalizeAssistChatReply(
  rawReply: string,
  isAssist: boolean,
  navCtx?: AssistNavInferContext,
): { reply: string; navOffer?: AssistNavOffer } {
  if (!isAssist || !rawReply?.trim()) {
    return { reply: rawReply };
  }
  return resolveAssistAgentNavigation(rawReply, navCtx || {});
}

export function attachAssistNavToPayload<T extends Record<string, unknown>>(
  payload: T,
  isAssist: boolean,
  rawReply: string,
  navCtx?: AssistNavInferContext,
): T & { navOffer?: AssistNavOffer } {
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
