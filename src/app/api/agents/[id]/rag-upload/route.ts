/**
 * POST /api/agents/[id]/rag-upload
 * Accepts multipart/form-data with a single "file" field.
 * Processes the file, extracts text, appends to ragSources.
 *
 * Limits: 10 MB per file, plan-based total sources limit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { processFile, getFileCategory } from '@/lib/rag-processor';
import { getAgentLimits } from '@/lib/agent-plans';
import crypto from 'crypto';

type Params = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_SOURCES_PER_AGENT = 20;

// Allowed MIME types
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const userId = verifySessionToken(token);
  if (!userId) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });

  const { id } = await params;

  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });

  if (agent.isPlatform) {
    return NextResponse.json(
      {
        error:
          'Los agentes de plataforma no se pueden modificar desde la landing. Edita el conocimiento en AgentFlowHub.',
      },
      { status: 403 },
    );
  }

  // Check plan — RAG must be enabled for user's plan
  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);

  if (!limits.ragEnabled) {
    return NextResponse.json({ error: 'RAG no está disponible en tu plan. Actualiza tu suscripción.' }, { status: 403 });
  }

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Error al leer el archivo. Verifica que el formato es válido.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  // Validate MIME
  const mimeType = file.type || 'application/octet-stream';
  const filename = file.name || 'archivo';

  if (!ALLOWED_MIMES.has(mimeType) && getFileCategory(mimeType, filename) === 'unsupported') {
    return NextResponse.json(
      { error: `Tipo de archivo no soportado: ${mimeType}. Sube PDF, DOCX, TXT, CSV, JSON o imágenes.` },
      { status: 415 },
    );
  }

  // Check total sources limit
  const currentSources = agent.ragSources?.length ?? 0;
  if (currentSources >= MAX_SOURCES_PER_AGENT) {
    return NextResponse.json(
      { error: `Máximo ${MAX_SOURCES_PER_AGENT} fuentes por agente. Elimina alguna antes de subir más.` },
      { status: 403 },
    );
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Process and extract text
  const result = await processFile(buffer, filename, mimeType);

  if (result.category === 'unsupported') {
    return NextResponse.json({ error: result.warning ?? 'Tipo de archivo no soportado.' }, { status: 415 });
  }

  // Build the new ragSource entry
  const fileId = crypto.randomBytes(8).toString('hex');
  const newSource = {
    type: 'file' as const,
    name: filename,
    content: result.text,
    fileId,
    fileName: filename,
    fileMime: mimeType,
    fileSize: file.size,
    fileCategory: result.category,
    charCount: result.charCount,
    warning: result.warning ?? null,
    uploadedAt: new Date(),
  };

  // Append to ragSources and mark for re-sync
  agent.ragSources = [...(agent.ragSources ?? []), newSource];
  if (agent.agentHubId) agent.syncStatus = 'pending';
  await agent.save();

  return NextResponse.json({
    ok: true,
    source: newSource,
    message: result.warning
      ? `Archivo procesado con aviso: ${result.warning}`
      : `Archivo procesado: ${result.charCount.toLocaleString()} caracteres extraídos.`,
  });
}
