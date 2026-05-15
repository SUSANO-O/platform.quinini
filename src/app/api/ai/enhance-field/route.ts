/**
 * POST /api/ai/enhance-field
 *
 * Proxy al endpoint /api/ai-assist/enhance-field de AIBackHub.
 * Lee el proveedor y modelo configurados en platform_config y los pasa como headers.
 * Requiere sesión activa (no necesariamente admin).
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken } from '@/lib/auth';
import { getAibackhubBaseUrl, hubCreateHeaders } from '@/lib/aibackhub-sync';

interface AiAssistantConfig {
  provider: string;
  modelId: string;
}

const DEFAULT_CONFIG: AiAssistantConfig = {
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
    // silencioso — usa default
  }
  return DEFAULT_CONFIG;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });

  const baseUrl = getAibackhubBaseUrl();
  if (!baseUrl) return NextResponse.json({ error: 'Hub no configurado.' }, { status: 503 });

  const config = await getAiConfig();

  // Los modelos vertex tienen prefijo "vx/" en la landing, pero AIBackHub los maneja internamente
  const headers: Record<string, string> = {
    ...hubCreateHeaders(),
    'x-ai-provider': config.provider,
    'x-ai-model': config.modelId,
  };

  try {
    const resp = await fetch(`${baseUrl}/api/ai-assist/enhance-field`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: 'Error al conectar con el hub.', detail: msg }, { status: 503 });
  }
}
