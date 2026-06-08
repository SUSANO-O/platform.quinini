/**
 * Persistencia de transcript del widget (texto + capturas) para el Inbox.
 */

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
