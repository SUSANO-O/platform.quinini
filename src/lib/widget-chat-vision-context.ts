/**
 * Inyecta análisis OCR/visión como contexto de sistema + sesión (no solo en el mensaje del usuario).
 */

import { connectDB } from '@/lib/db/connection';
import { ClientAgent } from '@/lib/db/models';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';
import { formatPlatformUiClassificationHint } from '@/lib/botiva-platform-ui-reference';
import { formatWidgetScreenshotOriginBlock } from '@/lib/widget-image-vision-context';

const IMAGE_REFERENCE_RE =
  /\b(la imagen|el de la imagen|esta imagen|esa imagen|la foto|esta foto|esa foto|lo de la foto|el veh[ií]culo de la imagen|en la captura|de la captura)\b/i;

/** El usuario se refiere a una imagen enviada en un turno anterior. */
export function messageReferencesPriorImage(message: string): boolean {
  return IMAGE_REFERENCE_RE.test(message.trim());
}

const VISION_FAILURE_MARKERS = [
  '[No se pudo analizar la imagen.]',
  '[Imagen adjunta — configura VERTEX_GEMINI_API_KEY',
  '[Imagen adjunta — configura VERTEX_GEMINI_API_KEY o GEMINI_API_KEY',
  '[Formato de imagen no válido.]',
];

const VISION_SESSION_MARKER = 'ANÁLISIS DE IMAGEN DEL USUARIO';

export function bodyHasVisionSessionContext(parsed: Record<string, unknown>): boolean {
  const block = typeof parsed.sessionContextBlock === 'string' ? parsed.sessionContextBlock : '';
  return block.includes(VISION_SESSION_MARKER) && block.includes('Contenido detectado');
}

export function isVisionAnalysisFailure(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return VISION_FAILURE_MARKERS.some((m) => t.startsWith(m));
}

export function buildVisionSessionBlock(enrichment: WidgetImageEnrichment): string {
  const originBlock = enrichment.screenshotContext
    ? `${formatWidgetScreenshotOriginBlock(enrichment.screenshotContext)}\n\n`
    : '[ORIGEN DE LA CAPTURA — widget BotIvA]\nCaptura enviada por el visitante desde el chat widget BotIvA.\n\n';

  const lines = enrichment.analyses.map((a, i) => {
    const header = enrichment.analyses.length > 1 ? `Imagen ${i + 1}` : 'Imagen adjunta';
    return `[${header}]\nContenido detectado (OCR/visión):\n${a.text.trim()}`;
  });
  return [
    '[ANÁLISIS DE IMAGEN DEL USUARIO — generado por el servidor, usar como descripción fiel]',
    '',
    originBlock.trimEnd(),
    '',
    ...lines,
  ].join('\n');
}

export const VISION_SYSTEM_INSTRUCTIONS = `[CAPACIDAD DE VISIÓN — PRIORIDAD ALTA]
El usuario adjuntó imagen(es) desde el widget de chat BotIvA (canal oficial de capturas del producto).
El servidor ya las procesó con OCR/visión automática e indicó el origen (dashboard BotIvA, web del visitante, etc.).
- NO digas que no puedes ver, visualizar o leer imágenes.
- NO menciones "limitación técnica" por imágenes: ya tienes el análisis en el contexto.
- Trata "Contenido detectado" y "ORIGEN DE LA CAPTURA" como hechos: responde según tu rol y la pantalla BotIvA o del sitio del cliente.
- Si el análisis falló, pide amablemente que el usuario describa la imagen; no digas que el sistema no soporta imágenes.`;

function appendToSystemPrompt(base: string, extra: string): string {
  const b = base.trim();
  const e = extra.trim();
  if (!e) return b;
  return b ? `${b}\n\n${e}` : e;
}

/**
 * Fusiona OCR/visión en sessionContextBlock y systemPromptOverride del body al hub.
 */
export function applyVisionContextToParsedBody(
  parsed: Record<string, unknown>,
  enrichment: WidgetImageEnrichment,
  agentSystemPrompt?: string | null,
): void {
  const userText = enrichment.displayMessage.trim();
  const imageOnly = !userText || userText === '📎 Imagen adjunta';

  parsed.message = imageOnly
    ? 'El usuario adjuntó una imagen. Responde según el análisis en el contexto de sesión.'
    : userText;

  const visionBlock = buildVisionSessionBlock(enrichment);
  const existingSession =
    typeof parsed.sessionContextBlock === 'string' ? parsed.sessionContextBlock.trim() : '';
  parsed.sessionContextBlock = existingSession
    ? `${visionBlock}\n\n---\n\n${existingSession}`
    : visionBlock;

  const hasFailure = enrichment.analyses.some((a) => isVisionAnalysisFailure(a.text));
  let visionSystem = `${VISION_SYSTEM_INSTRUCTIONS}\n\n${visionBlock}`;
  const platformHint = enrichment.analyses
    .map((a) => formatPlatformUiClassificationHint(a.text))
    .find(Boolean);
  if (platformHint) {
    visionSystem += `\n\n${platformHint}`;
  }
  if (hasFailure) {
    visionSystem += `\n\n[NOTA] El análisis automático no fue concluyente. Usa lo disponible arriba; si falta detalle, pide una descripción breve sin mencionar limitaciones del sistema.`;
  }

  const basePrompt =
    (typeof parsed.systemPromptOverride === 'string' && parsed.systemPromptOverride.trim()) ||
    (typeof agentSystemPrompt === 'string' ? agentSystemPrompt.trim() : '') ||
    '';

  parsed.systemPromptOverride = appendToSystemPrompt(basePrompt, visionSystem);
  parsed.visionEnriched = true;
}

export function mergeVisionContextIntoBody(
  rawBody: string,
  enrichment: WidgetImageEnrichment | null | undefined,
  agentSystemPrompt?: string | null,
  options?: { force?: boolean },
): string {
  if (!enrichment?.analyses?.length) return rawBody;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return rawBody;
  }
  if (!options?.force && parsed.visionEnriched === true && bodyHasVisionSessionContext(parsed)) {
    return rawBody;
  }
  delete parsed.visionEnriched;
  if (typeof parsed.sessionContextBlock === 'string') {
    parsed.sessionContextBlock = parsed.sessionContextBlock
      .split('\n')
      .filter((line) => !line.includes(VISION_SESSION_MARKER))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!parsed.sessionContextBlock) delete parsed.sessionContextBlock;
  }
  if (typeof parsed.systemPromptOverride === 'string') {
    const idx = parsed.systemPromptOverride.indexOf(VISION_SYSTEM_INSTRUCTIONS);
    if (idx >= 0) {
      parsed.systemPromptOverride = parsed.systemPromptOverride.slice(0, idx).trim();
      if (!parsed.systemPromptOverride) delete parsed.systemPromptOverride;
    }
  }
  applyVisionContextToParsedBody(parsed, enrichment, agentSystemPrompt);
  return JSON.stringify(parsed);
}

async function resolveAgentSystemPrompt(
  agentId: string,
  ownerUserId: string,
): Promise<{ systemPrompt: string; strictPurposeOnly: boolean } | null> {
  const id = agentId.trim();
  if (!id) return null;
  await connectDB();
  const filter = /^[a-f0-9]{24}$/i.test(id) ? { _id: id } : { agentHubId: id };
  const doc = await ClientAgent.findOne({
    $and: [filter, { $or: [{ userId: ownerUserId }, { isPlatform: true }] }],
  })
    .select({ systemPrompt: 1, strictPurposeOnly: 1 })
    .lean() as { systemPrompt?: string; strictPurposeOnly?: boolean } | null;
  if (!doc) return null;
  return {
    systemPrompt: typeof doc.systemPrompt === 'string' ? doc.systemPrompt : '',
    strictPurposeOnly: doc.strictPurposeOnly === true,
  };
}

/**
 * Aplica OCR/visión al body ANTES de MCP directo, inferencia o proxy al hub.
 * Debe llamarse tras enrichWidgetChatBody y antes de cualquier early-return de chat.
 */
export async function finalizeWidgetChatBodyWithVision(params: {
  rawBody: string;
  enrichment: WidgetImageEnrichment | null | undefined;
  agentId: string;
  ownerUserId: string;
  strictPurposeSuffix?: string;
  /** Re-aplica OCR aunque visionEnriched ya esté en el body (p. ej. tras triaje multi-agente). */
  force?: boolean;
}): Promise<string> {
  if (!params.enrichment?.analyses?.length || !params.agentId.trim()) {
    return params.rawBody;
  }

  const agent = await resolveAgentSystemPrompt(params.agentId, params.ownerUserId);
  let body = mergeVisionContextIntoBody(
    params.rawBody,
    params.enrichment,
    agent?.systemPrompt,
    { force: params.force === true },
  );

  if (agent?.strictPurposeOnly && params.strictPurposeSuffix) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const base =
        (typeof parsed.systemPromptOverride === 'string' && parsed.systemPromptOverride.trim()) ||
        agent.systemPrompt ||
        '';
      parsed.systemPromptOverride = base + params.strictPurposeSuffix;
      body = JSON.stringify(parsed);
    } catch {
      /* ignore */
    }
  }

  return body;
}

/** Prompt del usuario con bloque de sesión (OCR/visión, facts, etc.). */
export function buildUserPromptWithSessionContext(
  message: string,
  sessionContextBlock?: string | null,
): string {
  const block = typeof sessionContextBlock === 'string' ? sessionContextBlock.trim() : '';
  if (!block) return message;
  return `[CONTEXTO DE SESIÓN — incluye análisis de imágenes; tratar como hechos confirmados]\n${block}\n\n[MENSAJE DEL USUARIO]\n${message}`;
}
