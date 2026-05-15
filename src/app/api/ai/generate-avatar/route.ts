/**
 * POST /api/ai/generate-avatar
 *
 * Usa un modelo ligero para optimizar el prompt del usuario y genera
 * una imagen de avatar via pollinations.ai (gratuito, sin API key).
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken } from '@/lib/auth';
import { hubFetch, hubCreateHeaders } from '@/lib/aibackhub-sync';

interface AiAssistantConfig { provider: string; modelId: string; }

const DEFAULT_CONFIG: AiAssistantConfig = {
  provider: 'google',
  // Modelo ligero (nano) para generación de prompts — rápido y económico
  modelId: process.env.VERTEX_GEMINI_MODEL ?? 'gemini-2.0-flash',
};

async function getAiConfig(): Promise<AiAssistantConfig> {
  try {
    await connectDB();
    const col = mongoose.connection.db!.collection<{ key: string } & AiAssistantConfig>('platform_config');
    const doc = await col.findOne({ key: 'ai_assistant' });
    if (doc?.provider && doc?.modelId) return { provider: doc.provider, modelId: doc.modelId };
  } catch { /* silencioso */ }
  return DEFAULT_CONFIG;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    description?: string;
    agentContext?: { name?: string; purpose?: string; industry?: string };
  } | null;

  if (!body?.description?.trim()) {
    return NextResponse.json({ error: 'description es requerido.' }, { status: 400 });
  }

  const { description, agentContext = {} } = body;
  const config = await getAiConfig();

  const userMsg = [
    `Describe in English a professional AI assistant avatar image.`,
    `User request: ${description}`,
    agentContext.name     ? `Agent name: ${agentContext.name}`       : '',
    agentContext.purpose  ? `Purpose: ${agentContext.purpose}`       : '',
    agentContext.industry ? `Industry: ${agentContext.industry}`     : '',
    ``,
    `Rules: respond ONLY with an English image generation prompt (max 200 chars).`,
    `Focus on: photorealistic, professional, clean background, good lighting, high quality.`,
    `No markdown, no explanations, no quotes.`,
  ].filter(Boolean).join('\n');

  let optimizedPrompt = description.trim();

  try {
    const resp = await hubFetch('/api/ai-assist/enhance-field', {
      method:  'POST',
      headers: {
        ...hubCreateHeaders(),
        'Content-Type':   'application/json',
        'x-ai-provider': config.provider,
        'x-ai-model':    config.modelId,
      },
      body: JSON.stringify({
        fieldType:       'generic',
        fieldName:       'image_prompt',
        userDescription: userMsg,
        // language:'en' fuerza respuesta en inglés aunque la plataforma esté en español
        agentContext:    { ...agentContext, language: 'en' },
      }),
    }, 12_000);

    const json = await resp.json() as { success?: boolean; data?: { content?: string } };
    if (json.success && json.data?.content?.trim()) {
      let raw = json.data.content.trim();
      // Truncar en límite de palabra (evita cortar caracteres multi-byte)
      if (raw.length > 300) {
        raw = raw.slice(0, 300);
        const lastSpace = raw.lastIndexOf(' ');
        if (lastSpace > 100) raw = raw.slice(0, lastSpace);
      }
      optimizedPrompt = raw;
    }
  } catch {
    // Fallback: usa la descripción original (en español) — pollinations.ai la acepta igual
  }

  const seed = Math.floor(Math.random() * 99_999) + 1;
  const imageUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(optimizedPrompt)}` +
    `?width=512&height=512&seed=${seed}&nologo=true&model=flux`;

  return NextResponse.json({ url: imageUrl, prompt: optimizedPrompt });
}
