/**
 * POST /api/agents/[id]/rag/bulk
 * multipart: files[] (múltiples) o zip (un ZIP con documentos)
 * GET  /api/agents/[id]/rag/bulk?jobId= — estado del job async
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ClientAgent, Subscription, RagBulkJob } from '@/lib/db/models';
import { verifySessionToken } from '@/lib/auth';
import { getAgentLimits } from '@/lib/agent-plans';
import {
  extractFilesFromZip,
  scheduleRagBulkJob,
  shouldProcessBulkAsync,
} from '@/lib/rag-bulk-processor';
import { stageBulkFiles } from '@/lib/rag-bulk-queue';
import { ingestRagFileToAgent, type RagIngestInput } from '@/lib/rag-file-ingest';

type Params = { params: Promise<{ id: string }> };

function getUserId(req: NextRequest): string | null {
  const token = req.cookies.get('afhub_session')?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function GET(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
  if (!jobId) return NextResponse.json({ error: 'jobId requerido.' }, { status: 400 });

  await connectDB();
  const job = await RagBulkJob.findOne({ _id: jobId, userId }).lean();
  if (!job) return NextResponse.json({ error: 'Job no encontrado.' }, { status: 404 });

  return NextResponse.json({
    job: {
      id: String(job._id),
      status: job.status,
      totalFiles: job.totalFiles,
      processedFiles: job.processedFiles,
      errors: job.fileErrors ?? [],
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { id } = await params;
  await connectDB();

  const agent = await ClientAgent.findOne({ _id: id, userId });
  if (!agent) return NextResponse.json({ error: 'Agente no encontrado.' }, { status: 404 });
  if (agent.isPlatform) {
    return NextResponse.json({ error: 'Agente de plataforma no editable.' }, { status: 403 });
  }

  const sub = await Subscription.findOne({ userId }).lean() as { plan?: string; status?: string } | null;
  const hasActivePlan = sub?.status === 'active' || sub?.status === 'trialing';
  const plan = hasActivePlan ? (sub?.plan ?? 'free') : 'free';
  const limits = getAgentLimits(plan);
  if (!limits.ragEnabled) {
    return NextResponse.json({ error: 'Almacenamiento no disponible en tu plan.' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Error al leer archivos.' }, { status: 400 });
  }

  type Staged = { name: string; buffer: Buffer; mimeType?: string };
  const staged: Staged[] = [];

  const zipFile = formData.get('zip');
  if (zipFile instanceof File && zipFile.size > 0) {
    const buf = Buffer.from(await zipFile.arrayBuffer());
    const extracted = await extractFilesFromZip(buf);
    for (const e of extracted) {
      staged.push({ name: e.name, buffer: e.buffer });
    }
  }

  const rawFiles = [
    ...formData.getAll('files'),
    ...formData.getAll('files[]'),
  ].filter((f): f is File => f instanceof File && f.size > 0);

  for (const file of rawFiles) {
    staged.push({
      name: file.name || 'archivo',
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || undefined,
    });
  }

  if (!staged.length) {
    return NextResponse.json({ error: 'No se recibieron archivos ni ZIP.' }, { status: 400 });
  }
  if (staged.length > 100) {
    return NextResponse.json({ error: 'Máximo 100 archivos por lote.' }, { status: 400 });
  }

  if (!shouldProcessBulkAsync(staged.length)) {
    const errors: Array<{ file: string; error: string }> = [];
    let processed = 0;
    for (const f of staged) {
      const input: RagIngestInput = {
        buffer: f.buffer,
        filename: f.name,
        mimeType: f.mimeType || 'application/octet-stream',
        size: f.buffer.length,
      };
      const result = await ingestRagFileToAgent(agent, input, limits);
      if (!result.ok) {
        errors.push({ file: f.name, error: result.error });
        if (result.status === 403) break;
        continue;
      }
      processed += 1;
    }
    return NextResponse.json({
      ok: true,
      mode: 'sync',
      totalFiles: staged.length,
      processedFiles: processed,
      errors,
    });
  }

  const job = await RagBulkJob.create({
    userId,
    agentId: id,
    plan,
    status: 'pending',
    totalFiles: staged.length,
    processedFiles: 0,
    errors: [],
  });

  stageBulkFiles(String(job._id), staged);
  scheduleRagBulkJob(String(job._id));

  return NextResponse.json(
    {
      ok: true,
      mode: 'async',
      jobId: String(job._id),
      totalFiles: staged.length,
      status: 'pending',
    },
    { status: 202 },
  );
}
