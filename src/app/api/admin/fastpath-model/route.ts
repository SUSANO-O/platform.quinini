/**
 * GET  /api/admin/fastpath-model — obtener modelo configurado para preguntas triviales
 * POST /api/admin/fastpath-model — { modelId }
 */

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';

interface FastpathModelConfig {
  key: string;
  modelId: string;
  updatedAt: Date | string;
  updatedBy?: string;
}

function getSystemConfig() {
  return mongoose.connection.db!.collection<FastpathModelConfig>('system_config');
}

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  await connectDB();
  const user = (await User.findById(userId).lean()) as { role?: string } | null;
  if (!user || user.role !== 'admin') return null;
  return userId;
}

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  await connectDB();
  const doc = await getSystemConfig().findOne({ key: 'fastpath_model' });
  const config: FastpathModelConfig = doc ?? {
    key: 'fastpath_model',
    modelId: '',
    updatedAt: new Date(),
  };

  return NextResponse.json({
    ok: true,
    modelId: config.modelId || '',
    updatedAt: config.updatedAt,
  });
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdmin(req);
  if (!adminId) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  try {
    const body = await req.json();
    const { modelId } = body;

    if (typeof modelId !== 'string') {
      return NextResponse.json({ error: 'modelId debe ser un string.' }, { status: 400 });
    }

    await connectDB();

    await getSystemConfig().updateOne(
      { key: 'fastpath_model' },
      {
        $set: {
          key: 'fastpath_model',
          modelId: modelId.trim(),
          updatedAt: new Date(),
          updatedBy: adminId,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      ok: true,
      message: 'Modelo guardado exitosamente.',
      modelId: modelId.trim(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al guardar.' }, { status: 500 });
  }
}
