/**
 * Persistencia de transcript del widget (texto + capturas) para el Inbox.
 */

import { NextResponse } from 'next/server';
import { WidgetMessage } from '@/lib/db/models';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';

export type PersistTranscriptInput = {
  widgetId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  traceId?: string;
  userMessage: string;
  assistantMessage: string;
  enrichment?: WidgetImageEnrichment | null;
  /** Si el LLM realmente ejecutó tools en esta respuesta. Lista de tool-ids invocados. */
  toolsUsed?: string[];
};

/**
 * Heurística: la respuesta parece halucinada de tool-calls (el LLM "actúa" como
 * si hubiera llamado una API pero NO ejecutó ninguna tool). Si persistimos
 * estas respuestas y luego las rehidratamos como historial, el LLM anclará
 * en el patrón teatral y seguirá inventando aunque ya tenga tools reales.
 */
function looksLikeHallucinatedToolCall(text: string, toolsUsed?: string[]): boolean {
  if (toolsUsed && toolsUsed.length > 0) return false; // Sí ejecutó tools → es real
  const lower = String(text || '').toLowerCase();
  // Patrones típicos de halucinación de tool calls observados:
  const patterns = [
    /\[url_\w+\]/i,                              // [URL_DEL_WEBHOOK]
    /\bexecutionid:\s*["']?wf_/i,                // executionId: "wf_xxxx"
    /\bof_fake/i,
    /workflow triggered successfully/i,
    /workflow was started successfully/i,
    /\[endpoint_/i,
    /api\.human-approval/i,                      // dominio inventado típico
    /endpoint consultado:/i,                     // formato teatral típico
    /\b(payload|cuerpo) enviado:\s*\{/i,         // expone "el payload" como teatro
    /status:\s*esperando respuesta/i,
  ];
  // Si menciona "ejecutando" o "delegando" sin tool real, sospechoso
  const teatralKeywords = /(ejecutando|delegando la tarea|consultando un endpoint|enviando solicitud al servidor)/i;
  const hasTeatro = teatralKeywords.test(lower);
  const hasPlaceholder = patterns.some((re) => re.test(text || ''));
  // Sólo bloqueamos si hay placeholders explícitos. Lo teatral solo, no es bloqueo definitivo.
  return hasPlaceholder || (hasTeatro && /\[[A-Z_]{4,}\]/.test(text || ''));
}

export async function persistWidgetTranscript(input: PersistTranscriptInput): Promise<void> {
  const sessionId = input.sessionId.trim();
  if (!sessionId || !input.widgetId || !input.userId) return;

  // FILTRO ANTI-POLUCIÓN: si la respuesta del asistente parece una halucinación
  // de tool calls (placeholders, payloads inventados) y NO se ejecutó ningún tool
  // real, NO la persistimos para evitar contaminar el historial futuro.
  if (looksLikeHallucinatedToolCall(input.assistantMessage, input.toolsUsed)) {
    // Persistimos solo el mensaje del usuario, no la respuesta polucionada
    await WidgetMessage.create({
      widgetId: input.widgetId,
      userId: input.userId,
      agentId: input.agentId || '',
      sessionId,
      traceId: input.traceId || '',
      role: 'user',
      content: (input.enrichment?.displayMessage || input.userMessage).slice(0, 4000),
    });
    console.warn('[widget-transcript] assistant response looks hallucinated — skipping persist', {
      sessionId, traceId: input.traceId, preview: input.assistantMessage.slice(0, 120),
    });
    return;
  }

  const base = {
    widgetId: input.widgetId,
    userId: input.userId,
    agentId: input.agentId || '',
    sessionId,
    traceId: input.traceId || '',
  };

  const userAttachments =
    input.enrichment?.images?.map((img, i) => ({
      type: 'image' as const,
      url: img.url,
      ocrText: input.enrichment?.analyses?.[i]?.text?.slice(0, 4000) || '',
    })) ?? [];

  const userContent = (input.enrichment?.displayMessage || input.userMessage).slice(0, 4000);

  const docs: Array<Record<string, unknown>> = [
    {
      ...base,
      role: 'user',
      content: userContent,
      ...(userAttachments.length ? { attachments: userAttachments } : {}),
    },
  ];
  const assistantContent = input.assistantMessage.trim().slice(0, 8000);
  if (assistantContent) {
    docs.push({
      ...base,
      role: 'assistant',
      content: assistantContent,
    });
  }
  await WidgetMessage.insertMany(docs);
}

/** Fire-and-forget: persiste transcript cuando hay respuesta del asistente. */
export function schedulePersistWidgetTranscript(input: PersistTranscriptInput): void {
  const assistant = (input.assistantMessage || '').trim();
  if (!assistant || !input.sessionId?.trim() || !input.widgetId || !input.userId) return;
  void persistWidgetTranscript(input).catch(() => {});
}

/**
 * Único punto de acople "responder + persistir" para /api/widget/chat (no-stream).
 *
 * Antes, cada una de las ~7 ramas de esa ruta (ticket-deflection, pipeline
 * multiagente, paralelo multiagente, MCP directo, 2 variantes de inferencia
 * directa, proxy plano al hub) armaba su propio `NextResponse` Y llamaba a
 * `schedulePersistWidgetTranscript` por separado, a mano. Bug real encontrado
 * en vivo (Tribu GPS): 2 de esas ramas devolvían la respuesta sin llamar al
 * guardado — el turno se perdía del historial en silencio. Forzar que TODA
 * rama pase por esta función hace que ese olvido sea estructuralmente
 * imposible: no hay forma de "responder" sin pasar por acá.
 */
export function respondAndPersist(
  response: NextResponse,
  persistInput: PersistTranscriptInput | null,
): NextResponse {
  if (persistInput) schedulePersistWidgetTranscript(persistInput);
  return response;
}

/**
 * Equivalente a `respondAndPersist` para la ruta de streaming: el "responder"
 * final es un evento SSE (normalmente `{type:'done', ...}`, ya armado por el
 * caller — algunas ramas lo pasan por `attachAssistNavToPayload` antes, que
 * agrega campos propios), pero el acople con el guardado es el mismo — una
 * sola función que ninguna rama puede saltear.
 */
export function emitDoneAndPersist(
  enqueue: (data: Record<string, unknown>) => void,
  donePayload: Record<string, unknown>,
  persistInput: PersistTranscriptInput | null,
): void {
  enqueue(donePayload);
  if (persistInput) schedulePersistWidgetTranscript(persistInput);
}
