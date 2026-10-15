/**
 * POST /api/ai/design-agent
 *
 * Asistente que crea agentes: entrevista del negocio → agente completo (prompt, FAQ, reglas,
 * skills e integraciones sugeridas) para revisar antes de crearlo. Proxy a AIBackHub
 * `/api/ai-assist/design-agent` con el modelo de `platform_config.ai_assistant`.
 * Requiere sesión activa. No crea nada: devuelve el diseño.
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { verifySessionToken } from '@/lib/auth';
import { hubFetch, hubCreateHeaders } from '@/lib/aibackhub-sync';
import { listSkillCatalog } from '@/lib/skill-catalog-service';

export const maxDuration = 120;

async function getAiModel(): Promise<{ provider: string; modelId: string }> {
  try {
    await connectDB();
    const doc = await mongoose.connection.db!
      .collection<{ key: string; provider?: string; modelId?: string }>('platform_config')
      .findOne({ key: 'ai_assistant' });
    if (doc?.provider && doc?.modelId) return { provider: doc.provider, modelId: doc.modelId };
  } catch {
    // silencioso — usa default
  }
  return { provider: 'vertex', modelId: process.env.VERTEX_GEMINI_MODEL ?? 'gemini-2.5-flash' };
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { interview?: unknown; documentContext?: unknown } | null;
  if (!body?.interview || typeof body.interview !== 'object') {
    return NextResponse.json({ error: 'Faltan los datos del negocio.' }, { status: 400 });
  }

  const [ai, catalog] = await Promise.all([
    getAiModel(),
    listSkillCatalog({ includeDisabled: false }).catch(() => []),
  ]);

  try {
    const resp = await hubFetch(
      '/api/ai-assist/design-agent',
      {
        method: 'POST',
        headers: { ...hubCreateHeaders(), 'x-ai-provider': ai.provider, 'x-ai-model': ai.modelId },
        body: JSON.stringify({
          interview: body.interview,
          documentContext: typeof body.documentContext === 'string' ? body.documentContext.slice(0, 30_000) : '',
          skillCatalog: catalog.slice(0, 200).map((s) => ({
            id: s.id,
            label: s.label.slice(0, 200),
            description: (s.description ?? '').slice(0, 1000),
          })),
        }),
      },
      100_000,
    );
    const json = await resp.json().catch(() => null);
    return NextResponse.json(json ?? { error: 'Respuesta inválida del hub.' }, { status: json ? resp.status : 502 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: 'El asistente tardó demasiado o no está disponible. Intenta de nuevo.', detail: msg }, { status: 503 });
  }
}
