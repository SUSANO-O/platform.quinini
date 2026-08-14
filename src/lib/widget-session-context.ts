/**
 * Contexto compartido por sesión de chat (multi-agente y facts ligeros).
 */

import { connectDB } from '@/lib/db/connection';
import { WidgetSessionContext } from '@/lib/db/models';
import type { WidgetImageEnrichment } from '@/lib/widget-chat-images';

export type SessionFact = {
  key: string;
  value: string;
  source?: 'extracted' | 'routing' | 'handoff';
};

export type WidgetSessionContextDoc = {
  widgetId: string;
  chatSessionId: string;
  userId: string;
  summary: string;
  facts: SessionFact[];
  lastRoutedAgentName?: string;
};

const SUMMARY_MAX = 2_000;
const FACTS_MAX = 24;

export async function loadWidgetSessionContext(
  widgetId: string,
  chatSessionId: string,
  userId: string,
): Promise<WidgetSessionContextDoc | null> {
  if (!widgetId || !chatSessionId || !userId) return null;
  await connectDB();
  const row = await WidgetSessionContext.findOne({ widgetId, chatSessionId, userId }).lean();
  if (!row) return null;
  return {
    widgetId,
    chatSessionId,
    userId,
    summary: typeof row.summary === 'string' ? row.summary : '',
    facts: Array.isArray(row.facts) ? (row.facts as SessionFact[]) : [],
    lastRoutedAgentName:
      typeof row.lastRoutedAgentName === 'string' ? row.lastRoutedAgentName : undefined,
  };
}

export function formatSessionContextBlock(ctx: WidgetSessionContextDoc | null): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.summary.trim()) {
    parts.push(`Resumen de la conversación:\n${ctx.summary.trim().slice(0, SUMMARY_MAX)}`);
  }
  const facts = (ctx.facts ?? []).filter((f) => f?.key && f?.value).slice(0, 12);
  if (facts.length) {
    const lines = facts.map((f) => `- ${f.key}: ${String(f.value).slice(0, 200)}`);
    parts.push(`Datos conocidos del visitante:\n${lines.join('\n')}`);
  }
  if (ctx.lastRoutedAgentName) {
    parts.push(`Último especialista activo: ${ctx.lastRoutedAgentName}`);
  }
  if (!parts.length) return '';
  return `\n\n--- CONTEXTO DE SESIÓN (equipo multi-agente) ---\n${parts.join('\n\n')}\n--- FIN CONTEXTO DE SESIÓN ---`;
}

export async function upsertWidgetSessionContext(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  patch: Partial<Pick<WidgetSessionContextDoc, 'summary' | 'facts' | 'lastRoutedAgentName'>>,
): Promise<void> {
  if (!widgetId || !chatSessionId || !userId) return;
  await connectDB();
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.summary === 'string') {
    $set.summary = patch.summary.trim().slice(0, SUMMARY_MAX);
  }
  if (Array.isArray(patch.facts)) {
    $set.facts = patch.facts.slice(0, FACTS_MAX);
  }
  if (typeof patch.lastRoutedAgentName === 'string') {
    $set.lastRoutedAgentName = patch.lastRoutedAgentName.slice(0, 120);
  }
  await WidgetSessionContext.findOneAndUpdate(
    { widgetId, chatSessionId, userId },
    { $set, $setOnInsert: { widgetId, chatSessionId, userId } },
    { upsert: true },
  );
}

export async function appendSessionRoutingNote(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  note: string,
  routedAgentName?: string,
): Promise<void> {
  const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, userId);
  const prev = ctx?.summary?.trim() ?? '';
  const line = note.trim().slice(0, 400);
  const next = prev ? `${prev}\n• ${line}` : `• ${line}`;
  await upsertWidgetSessionContext(widgetId, chatSessionId, userId, {
    summary: next.slice(-SUMMARY_MAX),
    lastRoutedAgentName: routedAgentName,
    facts: ctx?.facts ?? [],
  });
}

/** Extrae hechos simples del mensaje del usuario (sin LLM). */
export function extractLightFactsFromMessage(message: string): SessionFact[] {
  const text = message.trim();
  if (!text) return [];
  const facts: SessionFact[] = [];
  const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
  if (email) facts.push({ key: 'email', value: email, source: 'extracted' });
  const phone = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/)?.[0];
  if (phone && phone.replace(/\D/g, '').length >= 8) {
    facts.push({ key: 'teléfono', value: phone.trim(), source: 'extracted' });
  }
  const order = text.match(/(?:pedido|orden|guía|guia|ticket|ref(?:erencia)?)\s*[#:]?\s*([A-Za-z0-9-]{4,24})/i);
  if (order?.[1]) facts.push({ key: 'referencia', value: order[1], source: 'extracted' });
  return facts;
}

export async function mergeSessionFacts(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  incoming: SessionFact[],
): Promise<void> {
  if (!incoming.length) return;
  const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, userId);
  const map = new Map<string, SessionFact>();
  for (const f of ctx?.facts ?? []) {
    if (f?.key) map.set(f.key.toLowerCase(), f);
  }
  for (const f of incoming) {
    if (f?.key) map.set(f.key.toLowerCase(), f);
  }
  await upsertWidgetSessionContext(widgetId, chatSessionId, userId, {
    summary: ctx?.summary ?? '',
    facts: [...map.values()].slice(0, FACTS_MAX),
    lastRoutedAgentName: ctx?.lastRoutedAgentName,
  });
}

const VISION_OCR_FACT_KEY = 'vision_ocr';
const VISION_URL_FACT_KEY = 'vision_url';
/** Cuándo se analizó, para saber si la imagen sigue siendo del momento. */
const VISION_AT_FACT_KEY = 'vision_at';

/** Guarda el último análisis OCR/visión de la sesión para follow-ups ("el de la imagen"). */
export async function persistSessionVisionAnalysis(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  enrichment: WidgetImageEnrichment,
): Promise<void> {
  if (!widgetId || !chatSessionId || !userId || !enrichment.analyses.length) return;
  const analysisText = enrichment.analyses
    .map((a) => a.text.trim())
    .filter(Boolean)
    .join('\n---\n')
    .slice(0, 2_000);
  if (!analysisText) return;

  const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, userId);
  const facts = (ctx?.facts ?? []).filter(
    (f) =>
      f.key !== VISION_OCR_FACT_KEY &&
      f.key !== VISION_URL_FACT_KEY &&
      f.key !== VISION_AT_FACT_KEY,
  );
  facts.push({ key: VISION_OCR_FACT_KEY, value: analysisText, source: 'extracted' });
  facts.push({
    key: VISION_AT_FACT_KEY,
    value: new Date().toISOString(),
    source: 'extracted',
  });
  const imageUrl = enrichment.images[0]?.url?.trim();
  if (imageUrl) {
    facts.push({ key: VISION_URL_FACT_KEY, value: imageUrl.slice(0, 500), source: 'extracted' });
  }
  await upsertWidgetSessionContext(widgetId, chatSessionId, userId, {
    summary: ctx?.summary ?? '',
    facts: facts.slice(0, FACTS_MAX),
    lastRoutedAgentName: ctx?.lastRoutedAgentName,
  });
}

export type SessionVisionEnrichment = {
  enrichment: WidgetImageEnrichment;
  /** Null en sesiones anteriores a que se guardara la marca de tiempo. */
  analyzedAt: Date | null;
};

/**
 * Recupera el último OCR/visión de la sesión cuando el usuario no re-adjunta la
 * imagen. Devuelve también cuándo se analizó: quien llama decide si usarla.
 */
export async function loadSessionVisionEnrichment(
  widgetId: string,
  chatSessionId: string,
  userId: string,
  userMessage: string,
): Promise<SessionVisionEnrichment | null> {
  const ctx = await loadWidgetSessionContext(widgetId, chatSessionId, userId);
  const ocrFact = ctx?.facts?.find((f) => f.key === VISION_OCR_FACT_KEY);
  if (!ocrFact?.value?.trim()) return null;
  const urlFact = ctx?.facts?.find((f) => f.key === VISION_URL_FACT_KEY);
  const url = typeof urlFact?.value === 'string' ? urlFact.value.trim() : '';

  const atFact = ctx?.facts?.find((f) => f.key === VISION_AT_FACT_KEY);
  const parsedAt = atFact?.value ? new Date(atFact.value) : null;
  const analyzedAt = parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : null;

  return {
    enrichment: {
      images: url ? [{ url }] : [],
      analyses: [{ url, text: ocrFact.value.trim() }],
      displayMessage: userMessage.trim(),
    },
    analyzedAt,
  };
}
