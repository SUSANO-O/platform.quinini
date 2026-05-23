/**
 * Genera shortcuts del widget (preguntas frecuentes clicables) a partir del contenido RAG.
 */

import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { getAibackhubBaseUrl, hubCreateHeaders, hubFetch } from '@/lib/aibackhub-sync';

export type WidgetShortcut = {
  id: string;
  label: string;
  message: string;
  emoji: string;
  enabled: boolean;
};

type RagSourceLike = { name?: string; content?: string };

type SuggestAgentResponse = {
  success?: boolean;
  data?: {
    faqs?: Array<{ question?: string; answer?: string }>;
    rules?: Array<{ title?: string; description?: string }>;
  };
};

interface AiAssistantConfig {
  provider: string;
  modelId: string;
}

const DEFAULT_AI_CONFIG: AiAssistantConfig = {
  provider: 'vertex',
  modelId: process.env.VERTEX_GEMINI_MODEL ?? 'gemini-2.5-flash',
};

async function getAiConfig(): Promise<AiAssistantConfig> {
  try {
    await connectDB();
    const col = mongoose.connection.db!.collection<{ key: string } & AiAssistantConfig>('platform_config');
    const doc = await col.findOne({ key: 'ai_assistant' });
    if (doc?.provider && doc?.modelId) return { provider: doc.provider, modelId: doc.modelId };
  } catch {
    /* usa default */
  }
  return DEFAULT_AI_CONFIG;
}

export function buildRagExcerptForShortcuts(sources: unknown[], maxChars = 12_000): string {
  const parts: string[] = [];
  let total = 0;

  for (const raw of sources) {
    if (!raw || typeof raw !== 'object') continue;
    const src = raw as RagSourceLike;
    const name = typeof src.name === 'string' && src.name.trim() ? src.name.trim() : 'Documento';
    const content = typeof src.content === 'string' ? src.content.replace(/\s+/g, ' ').trim() : '';
    if (!content) continue;

    const budget = Math.max(500, maxChars - total);
    const slice = content.slice(0, Math.min(4000, budget));
    parts.push(`--- ${name} ---\n${slice}`);
    total += slice.length + name.length + 12;
    if (total >= maxChars) break;
  }

  return parts.join('\n\n').slice(0, maxChars);
}

function truncateLabel(text: string, max = 72): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

export function faqsToWidgetShortcuts(faqs: Array<{ question: string }>): WidgetShortcut[] {
  const seen = new Set<string>();
  const out: WidgetShortcut[] = [];

  for (const faq of faqs) {
    const message = faq.question.trim();
    if (!message || seen.has(message.toLowerCase())) continue;
    seen.add(message.toLowerCase());
    out.push({
      id: randomUUID(),
      label: truncateLabel(message),
      message,
      emoji: '❓',
      enabled: true,
    });
    if (out.length >= 5) break;
  }

  return out;
}

export function fallbackShortcutsFromRagSources(sources: unknown[]): WidgetShortcut[] {
  const names = sources
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return '';
      const name = (raw as RagSourceLike).name;
      return typeof name === 'string' ? name.replace(/\.[^.]+$/, '').trim() : '';
    })
    .filter((n) => n.length >= 2)
    .slice(0, 3);

  const candidates: Array<{ message: string; emoji: string }> = [
    { message: '¿De qué trata esta documentación?', emoji: '📄' },
    ...names.map((name) => ({
      message: `¿Qué información importante hay sobre ${name}?`,
      emoji: '📋',
    })),
    { message: '¿Cuáles son los puntos clave que debo conocer?', emoji: '✨' },
    { message: '¿Hay requisitos o condiciones que deba tener en cuenta?', emoji: '📝' },
  ];

  return candidates.slice(0, 5).map((c) => ({
    id: randomUUID(),
    label: truncateLabel(c.message),
    message: c.message,
    emoji: c.emoji,
    enabled: true,
  }));
}

function buildAgentPurpose(agentName: string, sourceNames: string[]): string {
  const docs =
    sourceNames.length > 0
      ? sourceNames.slice(0, 3).join(', ')
      : 'documentación subida por el usuario';
  const purpose =
    `Asistente que responde preguntas sobre: ${docs}. ` +
    'Genera preguntas que un visitante haría al consultar esos documentos.';
  return purpose.slice(0, 500);
}

export async function suggestWidgetShortcutsFromRag(input: {
  agentName: string;
  ragSources: unknown[];
}): Promise<WidgetShortcut[]> {
  const sources = input.ragSources ?? [];
  const excerpt = buildRagExcerptForShortcuts(sources);
  const sourceNames = sources
    .map((raw) => (raw && typeof raw === 'object' ? (raw as RagSourceLike).name : ''))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

  if (!getAibackhubBaseUrl()) {
    return fallbackShortcutsFromRagSources(sources);
  }

  const config = await getAiConfig();
  const headers: Record<string, string> = {
    ...hubCreateHeaders(),
    'x-ai-provider': config.provider,
    'x-ai-model': config.modelId,
  };

  try {
    const resp = await hubFetch(
      '/api/ai-assist/suggest-agent',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agentName: input.agentName,
          agentPurpose: buildAgentPurpose(input.agentName, sourceNames),
          documentContext: excerpt || undefined,
          faqCount: 5,
          rulesCount: 0,
          tone: 'amigable',
          language: 'es',
        }),
      },
      45_000,
    );

    const json = (await resp.json()) as SuggestAgentResponse;
    if (!resp.ok || !json.success || !json.data) {
      return fallbackShortcutsFromRagSources(sources);
    }

    const faqs = (json.data.faqs ?? [])
      .map((f) => ({ question: typeof f.question === 'string' ? f.question.trim() : '' }))
      .filter((f) => f.question.length >= 8);

    const fromFaqs = faqsToWidgetShortcuts(faqs);
    if (fromFaqs.length >= 3) return fromFaqs;

    const fromRules = (json.data.rules ?? [])
      .map((r) => ({
        question:
          typeof r.title === 'string' && r.title.trim()
            ? `¿${r.title.trim().replace(/\?$/, '')}?`
            : '',
      }))
      .filter((r) => r.question.length >= 8);

    const merged = faqsToWidgetShortcuts([...faqs, ...fromRules]);
    return merged.length >= 3 ? merged : fallbackShortcutsFromRagSources(sources);
  } catch {
    return fallbackShortcutsFromRagSources(sources);
  }
}
