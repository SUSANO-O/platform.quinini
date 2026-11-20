/**
 * Aprovisionamiento de un agente a partir de la data de un lead del onboarding.
 *
 * Reúsa el mapeador determinista del quiz (`buildAgentFromQuiz`) y, si el plan lo permite y el lead
 * dejó una web, la scrapea con el scraper Node existente (Jina + Chromium) y la guarda como fuente de
 * conocimiento (texto), para que el agente nazca sabiendo de su negocio. No llama a ningún LLM aquí.
 *
 * Se usa desde: el convert de admin (server-side) y el endpoint de ingesta de URL (sesión del dueño).
 */

import { randomBytes } from 'crypto';
import { ClientAgent, Widget } from '@/lib/db/models';
import { canAttemptHubSync, ensureClientAgentHubSynced } from '@/lib/aibackhub-sync';
import { buildAgentFromQuiz } from '@/lib/onboarding/quiz-to-agent';
import type { QuizAnswers } from '@/lib/onboarding/quiz-config';

export type TextRagSource = { type: 'text'; name: string; content: string; charCount: number; uploadedAt: Date };

/**
 * Recorre el sitio (multi-página) y lo devuelve como fuente RAG de texto. Best-effort: null si falla.
 * `maxPages` controla cuántas páginas internas sigue (inicial + prioritarias).
 */
export async function scrapeUrlToTextSource(url: string, maxPages = 8): Promise<TextRagSource | null> {
  const clean = (url ?? '').trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  try {
    const { crawlSite } = await import('@/lib/scraper/crawl');
    const result = await crawlSite(clean, { maxPages });
    const content = (result.text ?? '').trim().slice(0, 120_000);
    if (!content) return null;
    const pageNote = result.pages.length > 1 ? ` (${result.pages.length} páginas)` : '';
    return {
      type: 'text',
      name: `${(result.title || 'Sitio web').slice(0, 180)}${pageNote}`,
      content,
      charCount: content.length,
      uploadedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/** Dispara la sincronización del agente al hub (fire-and-forget). */
function syncAgentToHub(agentId: string, userId: string): void {
  if (!canAttemptHubSync()) return;
  ensureClientAgentHubSynced(agentId, userId).catch(() => {
    ClientAgent.updateOne({ _id: agentId }, { syncStatus: 'failed' }).catch(() => {});
  });
}

/**
 * Crea el agente de un usuario a partir de las respuestas del quiz. Si `withScrape` y hay web elegible,
 * la scrapea e incluye como fuente de texto. Devuelve el documento creado.
 */
export async function createAgentFromAnswers(params: {
  userId: string;
  answers: QuizAnswers;
  withScrape?: boolean;
}): Promise<{ _id: unknown; name: string; widgetId: string; widgetToken: string }> {
  const gen = buildAgentFromQuiz(params.answers);

  const ragSources: Array<Record<string, unknown>> = [];
  if (params.withScrape) {
    const website = gen.ragSources.find((s) => s.type === 'url')?.content ?? '';
    const scraped = await scrapeUrlToTextSource(website);
    if (scraped) ragSources.push(scraped);
  }

  const agent = await ClientAgent.create({
    userId: params.userId,
    name: gen.name,
    description: gen.description,
    systemPrompt: gen.systemPrompt,
    model: gen.model,
    type: 'agent',
    parentAgentId: null,
    tools: [],
    ragEnabled: ragSources.length > 0,
    ragSources,
    behaviorRules: [],
    agentFaqs: gen.suggestedFaqs.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      question: f.question,
      answer: f.answer,
      enabled: true,
      priority: 100 + i,
    })),
    faqCandidates: [],
    strictPurposeOnly: true,
    syncStatus: 'pending',
  });

  syncAgentToHub(agent._id.toString(), params.userId);

  // ── Crear el widget embebible, listo para poner en la web del cliente ──
  const businessName = (params.answers.businessName ?? '').trim() || gen.name;
  const afhubToken = `wt_${randomBytes(24).toString('hex')}`;
  const widget = await Widget.create({
    userId: params.userId,
    name: `Widget de ${businessName}`.slice(0, 120),
    agentId: agent._id.toString(),
    afhubToken,
    color: gen.meta.color,
    title: businessName.slice(0, 80),
    welcome: `¡Hola! Soy el asistente de ${businessName}. ¿En qué te ayudo?`.slice(0, 300),
    welcomeEnabled: true,
    theme: 'light',
  });

  return { _id: agent._id, name: agent.name, widgetId: String(widget._id), widgetToken: afhubToken };
}
