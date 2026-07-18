/**
 * Contexto de origen para capturas enviadas por el widget BotIvA.
 * Permite al OCR/visión y al agente saber que la imagen viene del chat BotIvA
 * (dashboard, marketing o sitio del visitante con widget embebido).
 */

import { isAppBotIvAWidgetPath, isLandingMarketingPath } from '@/lib/landing-widget-paths';

export type WidgetScreenshotKind = 'botiva_dashboard' | 'botiva_marketing' | 'visitor_site';

export type WidgetScreenshotContext = {
  kind: WidgetScreenshotKind;
  pagePath: string;
  /** Texto para el agente (sessionContextBlock). */
  originLabel: string;
};

function normalizePagePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return `${u.pathname}${u.search}` || '/';
    } catch {
      return trimmed;
    }
  }
  return trimmed.split('?')[0] || trimmed;
}

/** Infiere origen BotIvA desde el body del widget (pagePath). */
export function inferWidgetScreenshotContext(
  parsed: Record<string, unknown>,
): WidgetScreenshotContext {
  const rawPath = typeof parsed.pagePath === 'string' ? parsed.pagePath.trim() : '';
  const pathOnly = normalizePagePath(rawPath);

  if (pathOnly && isAppBotIvAWidgetPath(pathOnly)) {
    return {
      kind: 'botiva_dashboard',
      pagePath: pathOnly,
      originLabel:
        `Captura enviada desde el asistente del dashboard BotIvA (Math-ais). ` +
        `Pantalla actual del cliente: ${pathOnly}. ` +
        `Suele mostrar UI de BotIvA: agentes, widgets, inbox, MCP, ajustes, métricas o estado del sistema.`,
    };
  }

  if (pathOnly && isLandingMarketingPath(pathOnly)) {
    return {
      kind: 'botiva_marketing',
      pagePath: pathOnly,
      originLabel:
        `Captura enviada desde el widget BotIvA en la web pública de BotIvA (Math). ` +
        `Pantalla: ${pathOnly}.`,
    };
  }

  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return {
      kind: 'visitor_site',
      pagePath: rawPath,
      originLabel:
        `Captura enviada por un visitante desde el chat widget BotIvA embebido en: ${rawPath}. ` +
        `Puede ser la web del cliente, un producto, error de pantalla, formulario, etc.`,
    };
  }

  if (pathOnly) {
    return {
      kind: 'visitor_site',
      pagePath: pathOnly,
      originLabel:
        `Captura enviada por un visitante desde el chat widget BotIvA. ` +
        `Ruta de la página donde está el widget: ${pathOnly}.`,
    };
  }

  return {
    kind: 'visitor_site',
    pagePath: '',
    originLabel:
      'Captura enviada por un visitante desde el chat widget BotIvA (canal oficial de adjuntos del producto).',
  };
}

const VISION_PROMPT_COMMON =
  'Incluye:\n' +
  '1. Qué objetos, productos o elementos aparecen\n' +
  '2. Texto visible (exacto, sin parafrasear)\n' +
  '3. Colores, formas, marcas o características relevantes\n' +
  '4. Contexto general de la imagen\n' +
  'Responde en español. Formato: descripción clara y concisa. Solo describe lo que ves, sin opiniones ni explicaciones adicionales.';

const VISION_PROMPT_BY_KIND: Record<WidgetScreenshotKind, string> = {
  botiva_dashboard:
    'Esta imagen es una captura enviada por un usuario dentro del dashboard BotIvA (plataforma SaaS: agentes de IA, widgets embebibles, inbox, integraciones MCP).\n' +
    'Busca UI típica BotIvA: tarjetas de métricas, listado de agentes, widget builder, inbox/chats, "Estado del sistema", planes, errores de build Next.js, etc.\n' +
    VISION_PROMPT_COMMON,
  botiva_marketing:
    'Esta imagen es una captura enviada desde la web pública de BotIvA (landing, pricing, demos).\n' +
    VISION_PROMPT_COMMON,
  visitor_site:
    'Esta imagen fue enviada por un visitante a través del widget de chat BotIvA embebido en un sitio web (no es una imagen aleatoria de internet).\n' +
    'Puede ser captura del sitio del cliente, un producto, ticket, error, chat, formulario u otra pantalla que el usuario quiera mostrar al agente.\n' +
    VISION_PROMPT_COMMON,
};

export function buildSupportVisionPrompt(ctx: WidgetScreenshotContext): string {
  const base = VISION_PROMPT_BY_KIND[ctx.kind];
  if (!ctx.pagePath) return base;
  return `${base}\n\nReferencia de página reportada por el widget: ${ctx.pagePath}`;
}

/** Bloque corto de origen BotIvA para sessionContextBlock del agente. */
export function formatWidgetScreenshotOriginBlock(ctx: WidgetScreenshotContext): string {
  const lines = [
    '[ORIGEN DE LA CAPTURA — widget BotIvA]',
    ctx.originLabel,
  ];
  if (ctx.pagePath) {
    lines.push(`Página reportada: ${ctx.pagePath}`);
  }
  return lines.join('\n');
}
