/**
 * Referencia visual del dashboard BotIvA para Math-ais (agente de plataforma).
 * Permite clasificar si una captura del usuario coincide con UI BotIvA o es contenido externo.
 */

import {
  MATH_AIS_UI_REFERENCE_MANIFEST,
  mathAisUiReferencePublicUrl,
} from '@/lib/math-ais-ui-reference-manifest';

export type PlatformUiReferenceShot = {
  id: string;
  label: string;
  url: string;
};

/** Señales textuales estables del dashboard BotIvA (memoria curada, sin depender de OCR). */
export const BOTIVA_PLATFORM_UI_SIGNATURES = [
  'Barra lateral izquierda con secciones: Agentes, Widgets / Widget builder, Inbox, Integraciones MCP, Ajustes.',
  'Encabezado con saludo tipo "Hola, {nombre}" y métricas/tarjetas en la home del dashboard.',
  'Paleta acento teal BotIvA (~#006B7D), fondos claros, cards con bordes redondeados.',
  'Burbuja Math-ais en esquina inferior (chat interno del dashboard).',
  'Textos de producto: BotIvA, Agentes, Mis widgets, Widget builder, Estado del sistema.',
  'Listados de agentes con badges/iniciales, builder de widget con pasos y preview.',
  'Widget Builder (/dashboard/widget-builder): wizard 4 pasos (Identidad → Apariencia → Comportamiento → Publicar). Paso 1: nombre widget, toggle multiagente, grilla de agentes. Paso 2: color #006B7D, tema claro/oscuro, textos chat, posición launcher, toggles adjuntar/mic/TTS. Paso 3: WhatsApp humano, botón hablar con persona, privacidad, shortcuts. Vista previa en vivo a la derecha.',
  'Formulario Crear agente (/dashboard/agents/new): nombre, sugerir con AI, catálogo de modelos, system prompt, solo propósito, integraciones MCP (Gmail, HubSpot, etc.).',
  'Ficha agente (/dashboard/agents/[id]): sidebar 8 pestañas — General, Reglas, FAQ, Herramientas, Almacén, Sub-agentes, Tareas, WhatsApp. Cabecera con nombre, Activo, modelo, Hub sync.',
  'Mis widgets: grilla de tarjetas, menú ⋮ (embed, compartir, historial), botón + Nuevo widget. Vista previa del widget con paneles de config y chat flotante.',
  'Vista previa widget (/dashboard/widget-preview): Resumen de capacidades (grid), MCP Tools con badges Sincronizado, tarjeta Embed con snippet script widget.js y AgentFlowhub.init (agentId, widgetId, host, token).',
  'Marca "POWERED BY BOTIVA" solo en widgets embebidos, no en el panel principal.',
] as const;

export function platformUiSignatureBlock(): string {
  return [
    '[MEMORIA VISUAL — UI dashboard BotIvA]',
    'Usa estas señales para decidir si una captura es del panel BotIvA o de otra app/sitio:',
    ...BOTIVA_PLATFORM_UI_SIGNATURES.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}

/**
 * URLs de capturas de referencia (golden screenshots).
 * Env: BOTIVA_PLATFORM_UI_REFERENCE_URLS=id|label|url,id2|label2|url2
 * o URLs simples separadas por coma (sin id).
 */
export function getPlatformUiReferenceShots(appOrigin?: string): PlatformUiReferenceShot[] {
  const raw = process.env.BOTIVA_PLATFORM_UI_REFERENCE_URLS?.trim();
  if (raw) {
    const shots: PlatformUiReferenceShot[] = [];
    for (const chunk of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (chunk.includes('|')) {
        const [id, label, url] = chunk.split('|').map((s) => s.trim());
        if (url && /^https?:\/\//i.test(url)) {
          shots.push({
            id: id || `ref-${shots.length + 1}`,
            label: label || 'Referencia BotIvA',
            url,
          });
        }
      } else if (/^https?:\/\//i.test(chunk)) {
        shots.push({
          id: `ref-${shots.length + 1}`,
          label: 'Referencia dashboard BotIvA',
          url: chunk,
        });
      }
    }
    if (shots.length) return shots.slice(0, 4);
  }

  const base = (appOrigin || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!base) return [];

  return MATH_AIS_UI_REFERENCE_MANIFEST.map((entry) => ({
    id: entry.id,
    label: `${entry.title} (referencia BotIvA)`,
    url: mathAisUiReferencePublicUrl(entry.file, base),
  }));
}

export function buildPlatformUiMatchVisionPrompt(params: {
  screenshotContextPagePath?: string;
  referenceLabels: string[];
}): string {
  const refLine =
    params.referenceLabels.length > 0
      ? `Antes de la captura del usuario recibiste ${params.referenceLabels.length} imagen(es) de REFERENCIA del dashboard BotIvA (${params.referenceLabels.join('; ')}). Úsalas para comparar visualmente.`
      : 'No hay imágenes de referencia adjuntas; usa la memoria textual de UI BotIvA abajo.';

  return [
    'Eres el módulo de visión de Math-ais (asistente del dashboard BotIvA).',
    refLine,
    '',
    platformUiSignatureBlock(),
    '',
    'La ÚLTIMA imagen es la captura que envió el usuario desde Math-ais.',
    params.screenshotContextPagePath
      ? `Pantalla reportada por el widget: ${params.screenshotContextPagePath}`
      : '',
    '',
    'Tareas:',
    '1) Describe la captura del usuario (OCR, elementos, textos exactos).',
    '2) Compara con referencias BotIvA y la memoria visual.',
    '3) Clasifica si la captura es del dashboard BotIvA o contenido externo (otra web, app, meme, documento, etc.).',
    '',
    'Responde en español. Al final incluye EXACTAMENTE este bloque:',
    '',
    '[CLASIFICACIÓN UI BOTIVA]',
    'coincide_dashboard: si | no | parcial',
    'confianza: alta | media | baja',
    'señales_botiva: (viñetas breves o "ninguna")',
    'señales_externas: (viñetas breves o "ninguna")',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Extrae coincide_dashboard del análisis de visión. */
export function parsePlatformUiClassification(analysis: string): {
  matchesDashboard: 'si' | 'no' | 'parcial' | 'unknown';
  confidence: 'alta' | 'media' | 'baja' | 'unknown';
} {
  const block = analysis.match(/\[CLASIFICACIÓN UI BOTIVA\]([\s\S]*?)(?:\n\[|$)/i)?.[1] || analysis;
  const matchCoincide = /coincide_dashboard:\s*(si|no|parcial)/i.exec(block);
  const matchConf = /confianza:\s*(alta|media|baja)/i.exec(block);
  return {
    matchesDashboard: (matchCoincide?.[1]?.toLowerCase() as 'si' | 'no' | 'parcial') || 'unknown',
    confidence: (matchConf?.[1]?.toLowerCase() as 'alta' | 'media' | 'baja') || 'unknown',
  };
}

export function formatPlatformUiClassificationHint(analysis: string): string | null {
  const { matchesDashboard, confidence } = parsePlatformUiClassification(analysis);
  if (matchesDashboard === 'unknown') return null;
  if (matchesDashboard === 'no') {
    return (
      '[NOTA Math-ais] La captura NO parece ser del dashboard BotIvA (confianza: ' +
      `${confidence}). Es contenido externo u otra app. Ayuda al usuario aclarando que la imagen no es del panel BotIvA y pide contexto o una captura del dashboard si buscaba soporte de la plataforma.`
    );
  }
  if (matchesDashboard === 'parcial') {
    return (
      '[NOTA Math-ais] La captura solo coincide parcialmente con UI BotIvA (confianza: ' +
      `${confidence}). Responde con cautela; confirma si la duda es del dashboard o de otro sitio.`
    );
  }
  return null;
}
