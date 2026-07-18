/**
 * Artefacto BotIvA: **navegación de estado del dashboard vía agente**.
 *
 * El agente (Math-ais) no solo responde texto: puede proponer un cambio de
 * pantalla (estado de la SPA). Este módulo es el contrato servidor entre:
 *
 *   intención del usuario + respuesta del LLM + pagePath  →  navOffer  →  SPA
 *
 * ## Pipeline
 * 1. **Entrada**: mensaje usuario, reply del modelo, `pagePath` (estado actual).
 * 2. **Resolución** (`resolveAssistAgentNavigation`): destino `/dashboard/...`.
 *    Prioridad: mensaje usuario > bloque ```assist-nav del modelo > reply > pantalla.
 * 3. **Payload** (`attachAssistNavigationToChat`): `{ reply, navOffer? }` al widget.
 * 4. **Cliente** (`assist.js`): botones Sí/No → `__BIV.navigate` / `biv:navigate-request`
 *    (sin recargar la app; overlay + spinner en la burbuja).
 * 5. **Post-estado**: `afterNavigate` en chat cuando la ruta cambió.
 *
 * ## Eventos browser (contrato host ↔ widget)
 * - `biv:navigate-request` — widget pide transición SPA
 * - `biv:navigate-start` / `biv:navigate-done` — ciclo de vida
 * - `window.__BIV.navigate(path)` — implementación en `landing-widget-script.tsx`
 *
 * Ampliar destinos en `detectNavIntentFromText` (assist-nav-offers.ts) y rutas
 * permitidas en `isAllowedAssistNavPath`.
 */

import {
  resolveAssistNavOffer,
  type AssistNavInferContext,
  type AssistNavOffer,
} from '@/lib/assist-nav-offers';

export type {
  AssistNavInferContext,
  AssistNavOffer,
} from '@/lib/assist-nav-offers';

/** Destinos de estado del dashboard que el agente puede solicitar. */
export const ASSIST_DASHBOARD_NAV_STATES = [
  { id: 'agents-new', path: '/dashboard/agents/new', label: 'Nuevo agente' },
  { id: 'agents-list', path: '/dashboard/agents', label: 'Agentes' },
  { id: 'widgets-list', path: '/dashboard/widgets', label: 'Mis widgets' },
  { id: 'widget-builder', path: '/dashboard/widget-builder', label: 'Widget builder' },
  { id: 'inbox', path: '/dashboard/inbox', label: 'Inbox' },
  { id: 'mcp', path: '/dashboard/mcp', label: 'Integraciones MCP' },
  { id: 'api', path: '/dashboard/api', label: 'API REST' },
  { id: 'settings', path: '/dashboard/settings', label: 'Ajustes' },
] as const;

export type AssistDashboardNavStateId = (typeof ASSIST_DASHBOARD_NAV_STATES)[number]['id'];

export type AssistAgentNavigationResult = {
  reply: string;
  navOffer?: AssistNavOffer;
};

/** Resuelve transición de estado propuesta por el agente (fuente de verdad servidor). */
export function resolveAssistAgentNavigation(
  modelReply: string,
  ctx: AssistNavInferContext,
): AssistAgentNavigationResult {
  return resolveAssistNavOffer(modelReply, ctx);
}

export function attachAssistNavigationToChat<T extends Record<string, unknown>>(
  payload: T,
  enabled: boolean,
  modelReply: string,
  ctx: AssistNavInferContext,
): T & { navOffer?: AssistNavOffer } {
  if (!enabled || !modelReply?.trim()) {
    return payload;
  }
  const nav = resolveAssistAgentNavigation(modelReply, ctx);
  return {
    ...payload,
    reply: nav.reply,
    ...(nav.navOffer ? { navOffer: nav.navOffer } : {}),
  };
}

export function assistNavigationContextFromChatBody(
  body: Record<string, unknown>,
): AssistNavInferContext {
  const userMessage = typeof body.message === 'string' ? body.message : '';
  const pagePath = typeof body.pagePath === 'string' ? body.pagePath : '';
  const agentDetail = pagePath.match(/\/dashboard\/agents\/([a-f0-9]{24})/i);
  return {
    userMessage,
    pagePath,
    agentDetailId: agentDetail?.[1],
  };
}

export function buildAssistNavigationContext(
  userMessage: string,
  pagePath?: string,
): AssistNavInferContext {
  return assistNavigationContextFromChatBody({
    message: userMessage,
    ...(pagePath ? { pagePath } : {}),
  });
}

/** Texto para system prompt: el agente opera navegación de estado, no solo URLs. */
export function assistAgentNavigationPromptSection(): string {
  return `[NAVEGACIÓN DE ESTADO — artefacto Math-ais]
Puedes proponer cambiar la pantalla del dashboard (estado SPA), no recargar la web.
Flujo: explica breve → pregunta si rediriges → bloque oculto assist-nav (path, onDecline, afterNavigate).
Prioriza el destino según lo que preguntó el usuario (crear widget → /dashboard/widget-builder, crear agente → /dashboard/agents/new, etc.).
Si ya está en esa pantalla, no propongas ir otra vez; indica el siguiente paso en la UI actual.
Rutas: /dashboard/agents, /dashboard/agents/new, /dashboard/widgets, /dashboard/widget-builder, /dashboard/inbox, /dashboard/mcp, /dashboard/api, /dashboard/settings.`;
}
