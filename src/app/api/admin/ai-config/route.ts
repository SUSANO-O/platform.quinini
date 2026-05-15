/**
 * GET  /api/admin/ai-config  — lee la config del asistente AI de la plataforma
 * PUT  /api/admin/ai-config  — guarda provider + modelId seleccionados por el admin
 *
 * Almacena en MongoDB colección `platform_config` con key "ai_assistant".
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

export interface AiAssistantConfig {
  provider: string;
  modelId: string;
  updatedAt: string;
  updatedBy?: string;
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = await User.findById(userId).lean() as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

function getPlatformConfig() {
  return mongoose.connection.db!.collection<{ key: string } & AiAssistantConfig>('platform_config');
}

const DEFAULT_CONFIG: AiAssistantConfig = {
  provider: 'vertex',
  modelId: 'vx/gemini-2.5-flash',
  updatedAt: new Date().toISOString(),
};

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const col = getPlatformConfig();
  const doc = await col.findOne({ key: 'ai_assistant' });

  const config: AiAssistantConfig = doc
    ? { provider: doc.provider, modelId: doc.modelId, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy }
    : DEFAULT_CONFIG;

  return NextResponse.json({ success: true, data: config });
}

export async function PUT(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.provider !== 'string' || typeof body.modelId !== 'string') {
    return NextResponse.json({ error: 'provider y modelId son requeridos.' }, { status: 400 });
  }

  const { provider, modelId } = body as { provider: string; modelId: string };

  if (!provider.trim() || !modelId.trim()) {
    return NextResponse.json({ error: 'provider y modelId no pueden estar vacíos.' }, { status: 400 });
  }

  const col = getPlatformConfig();
  const now = new Date().toISOString();

  await col.updateOne(
    { key: 'ai_assistant' },
    { $set: { key: 'ai_assistant', provider, modelId, updatedAt: now, updatedBy: adminId } },
    { upsert: true },
  );

  return NextResponse.json({
    success: true,
    data: { provider, modelId, updatedAt: now },
  });
}
